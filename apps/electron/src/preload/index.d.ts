import { ElectronAPI } from "@electron-toolkit/preload";

interface ElectronAppAPI {
  getServerStatus: () => Promise<unknown>;
  connectMCP: (config: unknown) => Promise<unknown>;
  disconnectMCP: (serverId: string) => Promise<unknown>;
  listMCPTools: () => Promise<unknown>;
  callMCPTool: (
    toolName: string,
    args: Record<string, unknown>
  ) => Promise<unknown>;
  chat: (messages: unknown[], options?: unknown) => Promise<unknown>;
  onMCPSessionsUpdated: (callback: (sessions: unknown) => void) => () => void;
  invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
  on: (channel: string, callback: (data: unknown) => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    electronAPI: ElectronAppAPI;
  }
}
