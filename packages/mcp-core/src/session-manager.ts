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
  /** 进行中的连接（同一个服务器的并发 connect 复用它） */
  private connecting: Map<string, { promise: Promise<MCPSession>; configKey: string }> = new Map();
  /** 当前连接所用的配置（配置变了才重连） */
  private connectedConfig: Map<string, string> = new Map();
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
   * 确保已连接（按 dsh 的连接监督器：每个服务器只有一个连接，"确保已连接"是幂等的）。
   * - 已连接且配置没变：直接返回现有会话，不断开重建（以前每次调用都会断开重连，
   *   多个窗口或页面刷新会互相踢掉对方的连接，导致另一方读到空的工具列表）
   * - 同一个服务器已有连接在进行中：复用那一次
   * - 配置变了，或 force：断开后重新连接
   */
  async connect(serverId: string, opts: { force?: boolean } = {}): Promise<MCPSession> {
    const config = this.configs.get(serverId);
    if (!config) {
      throw new Error(`Server not found: ${serverId}`);
    }
    const configKey = JSON.stringify(config);

    if (!opts.force) {
      const inflight = this.connecting.get(serverId);
      if (inflight && inflight.configKey === configKey) return inflight.promise;
      const existing = this.clients.get(serverId);
      if (existing && !inflight && existing.getSession().status === "connected" && this.connectedConfig.get(serverId) === configKey) {
        return existing.getSession();
      }
    }

    const promise = this.connectFresh(serverId, config, configKey);
    const entry = { promise, configKey };
    this.connecting.set(serverId, entry);
    try {
      return await promise;
    } finally {
      if (this.connecting.get(serverId) === entry) this.connecting.delete(serverId);
    }
  }

  /** 断开现有连接（如果有）并新建一个 */
  private async connectFresh(serverId: string, config: MCPServerConfig, configKey: string): Promise<MCPSession> {
    // Disconnect existing client if any
    if (this.clients.has(serverId)) {
      await this.disconnect(serverId);
    }

    const clientOptions: MCPClientOptions = {
      config,
      autoReconnect: true,
      onStatusChange: (status) => {
        // 重连成功后重新注册到 dispatcher
        if (status === "connected") {
          const client = this.clients.get(serverId);
          if (client) {
            this.dispatcher.registerClient(client);
          }
        }
        // 重连失败或断开时注销
        if (status === "error" || status === "disconnected") {
          this.dispatcher.unregisterClient(serverId);
        }
        this.notifySessionChange();
      },
      onToolsUpdate: () => {
        const client = this.clients.get(serverId);
        if (client) {
          this.dispatcher.registerClient(client);
        }
      },
      onError: (error) => {
        this.options.onError?.(serverId, error);
      },
      onReconnectAttempt: (attempt, maxAttempts) => {
        console.log(`[MCP] Server ${serverId}: reconnect attempt ${attempt}/${maxAttempts}`);
      },
    };

    const client = new MCPClient(clientOptions);
    this.clients.set(serverId, client);

    try {
      await client.connect();
      this.dispatcher.registerClient(client);
      this.connectedConfig.set(serverId, configKey);
      this.notifySessionChange();
      return client.getSession();
    } catch (error) {
      // 只删自己：失败时这个 id 可能已经被更新的一次连接占用
      if (this.clients.get(serverId) === client) this.clients.delete(serverId);
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
      if (this.clients.get(serverId) === client) this.clients.delete(serverId);
      this.connectedConfig.delete(serverId);
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
   * Get a specific client (for direct access to resources/prompts)
   */
  getClient(serverId: string): MCPClient | undefined {
    return this.clients.get(serverId);
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
