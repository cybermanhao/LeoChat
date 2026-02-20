import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import { createServer, startServer } from "@ai-chatbox/server";
import { createSessionManager } from "@ai-chatbox/mcp-core";
import type { MCPServerConfig } from "@ai-chatbox/shared";
import { IPC_CHANNELS } from "@ai-chatbox/shared";

// Keep a global reference of the window object
let mainWindow: BrowserWindow | null = null;

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
const SERVER_PORT = 3001;

function createWindow(): void {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow?.show();
    // Always open DevTools for debugging (remove in production)
    mainWindow?.webContents.openDevTools();
  });

  // Log renderer errors
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

  // Load the remote URL for development or the local html file for production
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

  // LLM chat (proxy to server)
  ipcMain.handle(IPC_CHANNELS.LLM_CHAT, async (_, messages, options) => {
    // For non-streaming, make a direct call to server
    const response = await fetch(`http://localhost:${SERVER_PORT}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, stream: false, ...options }),
    });
    return response.json();
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId("com.ai-chatbox.mcp");

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Setup IPC handlers
  setupIPC();

  // Start the embedded server
  startServer(server, SERVER_PORT);

  // Create window
  createWindow();

  app.on("activate", function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// Quit when all windows are closed, except on macOS.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// Clean up on quit
app.on("before-quit", async () => {
  await sessionManager.disconnectAll();
});
