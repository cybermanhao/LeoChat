import type { HostBridge, HostMode } from "@ai-chatbox/shared";
import { IPC_CHANNELS } from "@ai-chatbox/shared";

/**
 * Detect current host mode
 */
function detectHostMode(): HostMode {
  // Check if running in Electron
  if (
    typeof window !== "undefined" &&
    (window as typeof window & { electronAPI?: unknown }).electronAPI
  ) {
    return "electron";
  }
  return "web";
}

/**
 * Create Web-based host bridge using Fetch/SSE
 */
function createWebBridge(): HostBridge {
  const listeners = new Map<string, Set<(data: unknown) => void>>();

  return {
    mode: "web",

    async sendMessage(channel: string, data: unknown): Promise<unknown> {
      // Map channel to API endpoint
      const endpoint = channelToEndpoint(channel);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      return response.json();
    },

    onMessage(channel: string, callback: (data: unknown) => void): () => void {
      if (!listeners.has(channel)) {
        listeners.set(channel, new Set());
      }
      listeners.get(channel)!.add(callback);

      return () => {
        listeners.get(channel)?.delete(callback);
      };
    },

    async invoke<T>(method: string, ...args: unknown[]): Promise<T> {
      const endpoint = methodToEndpoint(method);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ args }),
      });
      return response.json();
    },
  };
}

/**
 * Create Electron-based host bridge using IPC
 */
function createElectronBridge(): HostBridge {
  const electronAPI = (window as typeof window & { electronAPI: ElectronAPI }).electronAPI;

  return {
    mode: "electron",

    async sendMessage(channel: string, data: unknown): Promise<unknown> {
      return electronAPI.invoke(channel, data);
    },

    onMessage(channel: string, callback: (data: unknown) => void): () => void {
      return electronAPI.on(channel, callback);
    },

    async invoke<T>(method: string, ...args: unknown[]): Promise<T> {
      return electronAPI.invoke(method, ...args) as Promise<T>;
    },
  };
}

interface ElectronAPI {
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, callback: (data: unknown) => void) => () => void;
}

/**
 * Map IPC channel to API endpoint
 */
function channelToEndpoint(channel: string): string {
  const mapping: Record<string, string> = {
    [IPC_CHANNELS.LLM_CHAT]: "/api/chat",
    [IPC_CHANNELS.MCP_CONNECT]: "/api/mcp/connect",
    [IPC_CHANNELS.MCP_DISCONNECT]: "/api/mcp/disconnect",
    [IPC_CHANNELS.MCP_LIST_TOOLS]: "/api/mcp/tools",
    [IPC_CHANNELS.MCP_CALL_TOOL]: "/api/mcp/tools/call",
    [IPC_CHANNELS.SERVER_STATUS]: "/health",
  };
  return mapping[channel] || `/api/${channel}`;
}

/**
 * Map method name to API endpoint
 */
function methodToEndpoint(method: string): string {
  return `/api/${method.replace(/:/g, "/")}`;
}

/**
 * Create the appropriate host bridge based on environment
 */
export function createHostBridge(): HostBridge {
  const mode = detectHostMode();
  return mode === "electron" ? createElectronBridge() : createWebBridge();
}

// Export singleton instance
export const hostBridge = createHostBridge();
