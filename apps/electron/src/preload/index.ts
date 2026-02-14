import { contextBridge, ipcRenderer } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import { IPC_CHANNELS } from "@ai-chatbox/shared";

// Custom APIs for renderer
const api = {
  // Window controls
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),

  // Server
  getServerStatus: () => ipcRenderer.invoke(IPC_CHANNELS.SERVER_STATUS),

  // MCP
  connectMCP: (config: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_CONNECT, config),
  disconnectMCP: (serverId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_DISCONNECT, serverId),
  listMCPTools: () => ipcRenderer.invoke(IPC_CHANNELS.MCP_LIST_TOOLS),
  callMCPTool: (toolName: string, args: Record<string, unknown>) =>
    ipcRenderer.invoke(IPC_CHANNELS.MCP_CALL_TOOL, toolName, args),

  // LLM
  chat: (messages: unknown[], options?: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.LLM_CHAT, messages, options),

  // Events
  onMCPSessionsUpdated: (callback: (sessions: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, sessions: unknown) =>
      callback(sessions);
    ipcRenderer.on("mcp:sessions-updated", listener);
    return () => {
      ipcRenderer.removeListener("mcp:sessions-updated", listener);
    };
  },

  // Generic invoke/on for flexibility
  invoke: (channel: string, ...args: unknown[]) =>
    ipcRenderer.invoke(channel, ...args),
  on: (channel: string, callback: (data: unknown) => void) => {
    const listener = (_: Electron.IpcRendererEvent, data: unknown) =>
      callback(data);
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("electronAPI", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.electronAPI = api;
}
