import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import { readFile, writeFile, unlink, mkdir } from "fs/promises";
import { createServer as createNetServer } from "net";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { createServer, startServer } from "@ai-chatbox/server";
import { createSessionManager } from "@ai-chatbox/mcp-core";
import type { MCPServerConfig } from "@ai-chatbox/shared";
import { IPC_CHANNELS } from "@ai-chatbox/shared";

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

// Actual port assigned after server starts. The promise lets IPC handlers wait
// for the server to be ready before returning the port to the renderer.
let serverPort = 3001;
let _serverPortResolve: ((port: number) => void) | null = null;
const serverPortPromise = new Promise<number>((resolve) => {
  _serverPortResolve = resolve;
});

// Create session manager for MCP connections
const sessionManager = createSessionManager({
  onSessionChange: (sessions) => {
    mainWindow?.webContents.send("mcp:sessions-updated", sessions);
  },
  onError: (serverId, error) => {
    console.error(`MCP error [${serverId}]:`, error.message);
  },
});

// Create and start the server (share sessionManager with HTTP routes)
const server = createServer(sessionManager);

/** Returns `preferred` if free, otherwise lets the OS pick a random free port. */
function findFreePort(preferred: number): Promise<number> {
  return new Promise((resolve) => {
    const s = createNetServer();
    s.listen(preferred, () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on("error", () => {
      const fallback = createNetServer();
      fallback.listen(0, () => {
        const port = (fallback.address() as { port: number }).port;
        fallback.close(() => resolve(port));
      });
    });
  });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    // Prevents white flash before the renderer paints its first frame.
    // Matches the CSS --background variable of the default light theme.
    backgroundColor: "#ffffff",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Show as soon as Chromium has painted at least one frame so there's
  // no blank-window gap, but we don't wait for the full JS bundle to run.
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
    if (is.dev) {
      mainWindow?.webContents.openDevTools();
    }
  });

  // Hard fallback: show after 1 s even if ready-to-show never fires.
  const showFallback = setTimeout(() => mainWindow?.show(), 1000);
  mainWindow.once("show", () => clearTimeout(showFallback));

  mainWindow.webContents.on("console-message", (_e, level, message, line, sourceId) => {
    if (level >= 2) console.error(`[Renderer] ${message} (${sourceId}:${line})`);
  });

  mainWindow.webContents.on("did-fail-load", (_e, errorCode, errorDescription) => {
    console.error(`[did-fail-load] ${errorCode}: ${errorDescription}`);
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

// Register IPC handlers
function setupIPC(): void {
  // Window controls
  ipcMain.on("window:minimize", () => mainWindow?.minimize());
  ipcMain.on("window:maximize", () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow?.maximize();
    }
  });
  ipcMain.on("window:close", () => mainWindow?.close());
  ipcMain.handle("window:resize", (_, { width, height, maximize }: { width?: number; height?: number; maximize?: boolean }) => {
    if (!mainWindow) return;
    if (maximize) {
      mainWindow.maximize();
      return;
    }
    if (width != null && height != null) {
      const w = Math.max(800, Math.round(width));
      const h = Math.max(600, Math.round(height));
      mainWindow.setSize(w, h, true);
      mainWindow.center();
    }
  });

  // Server status
  ipcMain.handle(IPC_CHANNELS.SERVER_STATUS, () => {
    return {
      isRunning: true,
      mode: "electron",
      mcpSessions: sessionManager.getSessions(),
      uptime: process.uptime() * 1000,
    };
  });

  // MCP server management
  ipcMain.handle(IPC_CHANNELS.MCP_CONNECT, async (_, config: MCPServerConfig) => {
    sessionManager.addServer(config);
    return sessionManager.connect(config.id);
  });

  ipcMain.handle(IPC_CHANNELS.MCP_DISCONNECT, async (_, serverId: string) => {
    await sessionManager.disconnect(serverId);
    return { success: true };
  });

  ipcMain.handle(IPC_CHANNELS.MCP_LIST_TOOLS, () => {
    return sessionManager.getAllTools();
  });

  ipcMain.handle(
    IPC_CHANNELS.MCP_CALL_TOOL,
    async (_, toolName: string, args: Record<string, unknown>) => {
      return sessionManager.callTool(toolName, args);
    }
  );

  // Storage handlers (replace localStorage with file-based storage)
  const storageDir = join(app.getPath("userData"), "leochat-storage");

  /** Validate storage key to prevent path traversal */
  function sanitizeStorageKey(key: string): string | null {
    if (!/^[a-zA-Z0-9_.-]+$/.test(key)) return null;
    if (key.includes("..") || key.includes("/") || key.includes("\\")) return null;
    return key;
  }

  ipcMain.handle("storage:getItem", async (_, key: string) => {
    const safeKey = sanitizeStorageKey(key);
    if (!safeKey) return null;
    try {
      return await readFile(join(storageDir, `${safeKey}.json`), "utf-8");
    } catch {
      return null;
    }
  });

  ipcMain.handle("storage:setItem", async (_, key: string, value: string) => {
    const safeKey = sanitizeStorageKey(key);
    if (!safeKey) throw new Error("Invalid storage key");
    await mkdir(storageDir, { recursive: true });
    await writeFile(join(storageDir, `${safeKey}.json`), value, "utf-8");
  });

  ipcMain.handle("storage:removeItem", async (_, key: string) => {
    const safeKey = sanitizeStorageKey(key);
    if (!safeKey) return;
    try {
      await unlink(join(storageDir, `${safeKey}.json`));
    } catch {}
  });

  // Blocks until the server is ready, then returns the actual port.
  // This lets the renderer's _apiBasePromise naturally wait for server startup.
  ipcMain.handle("server:port", () => serverPortPromise);

  // Expose correct leochat-mcp path (dev: repo path, prod: extraResource)
  ipcMain.handle("builtin:leochat-mcp-path", () => {
    if (is.dev) {
      return join(__dirname, "../../../../packages/leochat-mcp/dist/index.js");
    }
    return join(process.resourcesPath, "leochat-mcp.js");
  });

  // LLM chat (proxy to server)
  ipcMain.handle(IPC_CHANNELS.LLM_CHAT, async (_, messages, options) => {
    const port = await serverPortPromise;
    const response = await fetch(`http://localhost:${port}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, stream: false, ...options }),
    });
    return response.json();
  });
}

// Enforce single instance — second launch focuses the existing window instead
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.ai-chatbox.mcp");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  setupIPC();

  // Open window immediately — renderer shows loading screen while server starts.
  createWindow();

  // Start server in the background. Once ready, resolve the port promise so
  // all waiting IPC callers (api.ts _apiBasePromise, LLM_CHAT, etc.) unblock,
  // and notify the renderer to dismiss the loading screen.
  findFreePort(3001)
    .then((port) => startServer(server, port))
    .then((actualPort) => {
      serverPort = actualPort;
      _serverPortResolve!(actualPort);
      mainWindow?.webContents.send("server:ready", actualPort);
      console.log(`[Server] Ready on port ${actualPort}`);
    })
    .catch((err: NodeJS.ErrnoException) => {
      console.error("[Server] Failed to start:", err);
      // Resolve anyway so the renderer doesn't hang on the loading screen.
      _serverPortResolve!(serverPort);
      mainWindow?.webContents.send("server:ready", serverPort);
    });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  await sessionManager.disconnectAll();
});
