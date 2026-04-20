declare global {
  interface Window {
    electronAPI?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
      getServerStatus: () => Promise<unknown>;
      connectMCP: (config: unknown) => Promise<unknown>;
      disconnectMCP: (serverId: string) => Promise<unknown>;
      listMCPTools: () => Promise<unknown>;
      callMCPTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
      chat: (messages: unknown[], options?: unknown) => Promise<unknown>;
      onMCPSessionsUpdated: (callback: (sessions: unknown) => void) => () => void;
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>;
      on: (channel: string, callback: (data: unknown) => void) => () => void;
    };
    electron?: unknown;
    /** Dev-only helper to clear chat history */
    __devClearHistory?: () => void;
  }
}

// Extend React CSSProperties for Electron-specific styles
declare module "react" {
  interface CSSProperties {
    WebkitAppRegion?: "drag" | "no-drag";
  }
}

export {};
