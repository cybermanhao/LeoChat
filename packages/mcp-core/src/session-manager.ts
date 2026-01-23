import type { MCPServerConfig, MCPSession } from "@ai-chatbox/shared";
import { MCPClient, type MCPClientOptions } from "./client";
import { ToolDispatcher, type ToolDispatcherOptions } from "./dispatcher";
import { validateTransportConfig } from "./transports";

export interface SessionManagerOptions {
  onSessionChange?: (sessions: MCPSession[]) => void;
  onError?: (serverId: string, error: Error) => void;
  dispatcherOptions?: ToolDispatcherOptions;
}

export interface SessionManagerEvents {
  sessionChange: (sessions: MCPSession[]) => void;
  error: (serverId: string, error: Error) => void;
  toolsChange: (tools: ReturnType<ToolDispatcher["getAllTools"]>) => void;
}

/**
 * Manages multiple MCP client sessions
 */
export class SessionManager {
  private clients: Map<string, MCPClient> = new Map();
  private configs: Map<string, MCPServerConfig> = new Map();
  private dispatcher: ToolDispatcher;
  private options: SessionManagerOptions;

  constructor(options: SessionManagerOptions = {}) {
    this.options = options;
    this.dispatcher = new ToolDispatcher(options.dispatcherOptions);
  }

  /**
   * Get the tool dispatcher
   */
  getDispatcher(): ToolDispatcher {
    return this.dispatcher;
  }

  /**
   * Add a server configuration (does not connect)
   */
  addServer(config: MCPServerConfig): void {
    const validation = validateTransportConfig(config);
    if (!validation.valid) {
      throw new Error(`Invalid server config: ${validation.errors.join(", ")}`);
    }
    this.configs.set(config.id, config);
  }

  /**
   * Remove a server configuration and disconnect if connected
   */
  async removeServer(serverId: string): Promise<void> {
    await this.disconnect(serverId);
    this.configs.delete(serverId);
  }

  /**
   * Connect to a specific server
   */
  async connect(serverId: string): Promise<MCPSession> {
    const config = this.configs.get(serverId);
    if (!config) {
      throw new Error(`Server not found: ${serverId}`);
    }

    // Disconnect existing client if any
    if (this.clients.has(serverId)) {
      await this.disconnect(serverId);
    }

    const clientOptions: MCPClientOptions = {
      config,
      onStatusChange: () => this.notifySessionChange(),
      onToolsUpdate: () => {
        this.dispatcher.registerClient(this.clients.get(serverId)!);
      },
      onError: (error) => {
        this.options.onError?.(serverId, error);
      },
    };

    const client = new MCPClient(clientOptions);
    this.clients.set(serverId, client);

    try {
      await client.connect();
      this.dispatcher.registerClient(client);
      this.notifySessionChange();
      return client.getSession();
    } catch (error) {
      this.clients.delete(serverId);
      throw error;
    }
  }

  /**
   * Disconnect from a specific server
   */
  async disconnect(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      await client.disconnect();
      this.dispatcher.unregisterClient(serverId);
      this.clients.delete(serverId);
      this.notifySessionChange();
    }
  }

  /**
   * Connect to all configured servers
   */
  async connectAll(): Promise<MCPSession[]> {
    const results: MCPSession[] = [];
    for (const serverId of this.configs.keys()) {
      try {
        const session = await this.connect(serverId);
        results.push(session);
      } catch (error) {
        this.options.onError?.(
          serverId,
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
    return results;
  }

  /**
   * Disconnect from all servers
   */
  async disconnectAll(): Promise<void> {
    for (const serverId of this.clients.keys()) {
      await this.disconnect(serverId);
    }
  }

  /**
   * Get all current sessions
   */
  getSessions(): MCPSession[] {
    return Array.from(this.clients.values()).map((client) =>
      client.getSession()
    );
  }

  /**
   * Get a specific session
   */
  getSession(serverId: string): MCPSession | undefined {
    return this.clients.get(serverId)?.getSession();
  }

  /**
   * Get all server configs
   */
  getConfigs(): MCPServerConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Get a specific server config
   */
  getConfig(serverId: string): MCPServerConfig | undefined {
    return this.configs.get(serverId);
  }

  /**
   * Check if connected to a server
   */
  isConnected(serverId: string): boolean {
    const client = this.clients.get(serverId);
    return client?.currentStatus === "connected";
  }

  /**
   * Notify listeners of session changes
   */
  private notifySessionChange(): void {
    this.options.onSessionChange?.(this.getSessions());
  }

  /**
   * Call a tool through the dispatcher
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const result = await this.dispatcher.dispatch(toolName, args);
    return result.result;
  }

  /**
   * Get all available tools
   */
  getAllTools() {
    return this.dispatcher.getAllTools();
  }

  /**
   * Get tools formatted for LLM
   */
  getToolsForLLM() {
    return this.dispatcher.getToolsForLLM();
  }
}

/**
 * Create a session manager with default options
 */
export function createSessionManager(
  options?: SessionManagerOptions
): SessionManager {
  return new SessionManager(options);
}
