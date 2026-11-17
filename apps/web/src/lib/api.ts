import type {
  MCPServerConfig,
  MCPSession,
  MCPResource,
  MCPPrompt,
} from "@ai-chatbox/shared";

// Resolve the API base URL once. In Electron (file:// protocol) the embedded
// server may start on a dynamic port, so we ask the main process for the
// actual port rather than assuming 3001.
const _apiBasePromise: Promise<string> = (async () => {
  if (window.location.protocol === "file:") {
    try {
      const port = await (window as unknown as { electronAPI: { invoke: (ch: string) => Promise<number> } })
        .electronAPI.invoke("server:port");
      return `http://localhost:${port}/api`;
    } catch {
      return "http://localhost:3001/api";
    }
  }
  return "/api";
})();

async function apiBase(): Promise<string> {
  return _apiBasePromise;
}

/** Returns the server origin (no /api suffix), e.g. "http://localhost:3001" */
export async function getServerBaseUrl(): Promise<string> {
  const base = await _apiBasePromise;
  return base.replace(/\/api$/, "");
}

export const chatApi = {
  async getMCPSessions() {
    const response = await fetch(`${await apiBase()}/mcp/sessions`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  async getMCPTools() {
    const response = await fetch(`${await apiBase()}/mcp/tools`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  async callTool(name: string, args: Record<string, unknown>) {
    const response = await fetch(`${await apiBase()}/mcp/tools/${name}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
  },

  async getLLMConfig(): Promise<{
    availableProviders: string[];
    defaultProvider: string;
    backendConfigured: boolean;
  }> {
    const response = await fetch(`${await apiBase()}/llm/config`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  async getModels(provider: string): Promise<string[]> {
    const response = await fetch(`${await apiBase()}/llm/models?provider=${encodeURIComponent(provider)}`);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || `HTTP ${response.status}`);
    }
    const data = await response.json() as { models: string[] };
    return data.models;
  },

  async setLLMConfig(provider: string, apiKey: string): Promise<{ success: boolean }> {
    const response = await fetch(`${await apiBase()}/llm/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
  },

  async testLLMConnection(provider: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
    const res = await fetch(`${await apiBase()}/llm/test-connection`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });
    if (!res.ok) return { success: false, error: "Request failed" };
    return res.json();
  },

  async fetchLLMModels(provider: string, apiKey: string): Promise<{ models: string[] }> {
    const res = await fetch(`${await apiBase()}/llm/models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, apiKey }),
    });
    if (!res.ok) return { models: [] };
    return res.json();
  },

  async approveToolCall(id: string, approved: boolean): Promise<void> {
    const response = await fetch(`${await apiBase()}/tools/approve/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || `HTTP ${response.status}`);
    }
  },
};

// MCP API
export const mcpApi = {
  // Server management
  async getServers(): Promise<MCPServerConfig[]> {
    const response = await fetch(`${await apiBase()}/mcp/servers`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  async addServer(config: MCPServerConfig): Promise<{ success: boolean; serverId: string }> {
    const response = await fetch(`${await apiBase()}/mcp/servers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
  },

  async removeServer(serverId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${await apiBase()}/mcp/servers/${serverId}`, {
      method: "DELETE",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  // Connection control
  async connect(serverId: string): Promise<MCPSession> {
    const response = await fetch(`${await apiBase()}/mcp/servers/${serverId}/connect`, {
      method: "POST",
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
  },

  async disconnect(serverId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${await apiBase()}/mcp/servers/${serverId}/disconnect`, {
      method: "POST",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  async getSessions(): Promise<MCPSession[]> {
    const response = await fetch(`${await apiBase()}/mcp/sessions`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  // Server details (config + session + resources + prompts)
  async getServerDetails(serverId: string): Promise<{
    config: MCPServerConfig;
    session?: MCPSession;
    resources: MCPResource[];
    prompts: MCPPrompt[];
  }> {
    const response = await fetch(`${await apiBase()}/mcp/servers/${serverId}/details`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  // Resources
  async readResource(serverId: string, uri: string): Promise<unknown> {
    const response = await fetch(`${await apiBase()}/mcp/servers/${serverId}/resources/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uri }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
  },

  // Prompts
  async getPrompt(
    serverId: string,
    name: string,
    args?: Record<string, string>
  ): Promise<unknown> {
    const response = await fetch(`${await apiBase()}/mcp/servers/${serverId}/prompts/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, args }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
  },

  // Tools
  async getTools(): Promise<unknown[]> {
    const response = await fetch(`${await apiBase()}/mcp/tools`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  },

  async callTool(name: string, args: Record<string, unknown>): Promise<{ result: unknown }> {
    const response = await fetch(`${await apiBase()}/mcp/tools/${name}/call`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${response.status}`);
    }
    return response.json();
  },
};

export interface EnvToolStatus {
  id: string;
  name: string;
  installed: boolean;
  version: string | null;
}

// Environment API
// Note: /env/check endpoint was removed for security (information disclosure).
// Client-side env checks are no longer supported.
export const envApi = {
  async check(): Promise<EnvToolStatus[]> {
    return [];
  },
};
