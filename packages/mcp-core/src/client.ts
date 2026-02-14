import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  MCPServerConfig,
  MCPSession,
  MCPTool,
  MCPCapabilities,
} from "@ai-chatbox/shared";
import { createTransportAsync, type MCPTransport } from "./transports";
import { CircuitBreaker } from "./retry";

/** 重连配置 */
export interface ReconnectConfig {
  maxAttempts: number;
  initialDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  jitter: boolean;
}

const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxAttempts: 5,
  initialDelayMs: 1000,
  backoffFactor: 2,
  maxDelayMs: 30000,
  jitter: true,
};

export interface MCPClientOptions {
  config: MCPServerConfig;
  onStatusChange?: (status: MCPSession["status"]) => void;
  onToolsUpdate?: (tools: MCPTool[]) => void;
  onError?: (error: Error) => void;
  autoReconnect?: boolean;
  reconnectConfig?: Partial<ReconnectConfig>;
  onReconnectAttempt?: (attempt: number, maxAttempts: number) => void;
}

export class MCPClient {
  private client: Client | null = null;
  private transport: MCPTransport | null = null;
  private config: MCPServerConfig;
  private status: MCPSession["status"] = "disconnected";
  private tools: MCPTool[] = [];
  private capabilities: MCPCapabilities | null = null;

  private onStatusChange?: (status: MCPSession["status"]) => void;
  private onToolsUpdate?: (tools: MCPTool[]) => void;
  private onError?: (error: Error) => void;
  private onReconnectAttempt?: (attempt: number, maxAttempts: number) => void;

  // 自动重连
  private autoReconnect: boolean;
  private reconnectConfig: ReconnectConfig;
  private intentionalDisconnect = false;
  private reconnectAbortController: AbortController | null = null;
  private circuitBreaker: CircuitBreaker;

  constructor(options: MCPClientOptions) {
    this.config = options.config;
    this.onStatusChange = options.onStatusChange;
    this.onToolsUpdate = options.onToolsUpdate;
    this.onError = options.onError;
    this.onReconnectAttempt = options.onReconnectAttempt;
    this.autoReconnect = options.autoReconnect ?? false;
    this.reconnectConfig = { ...DEFAULT_RECONNECT_CONFIG, ...options.reconnectConfig };
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 60000,
      successThreshold: 1,
    });
  }

  get serverId(): string {
    return this.config.id;
  }

  get serverName(): string {
    return this.config.name;
  }

  get currentStatus(): MCPSession["status"] {
    return this.status;
  }

  get availableTools(): MCPTool[] {
    return this.tools;
  }

  get serverCapabilities(): MCPCapabilities | null {
    return this.capabilities;
  }

  private setStatus(status: MCPSession["status"]) {
    this.status = status;
    this.onStatusChange?.(status);
  }

  async connect(): Promise<void> {
    if (this.status === "connected" || this.status === "connecting" || this.status === "reconnecting") {
      return;
    }

    this.intentionalDisconnect = false;
    this.circuitBreaker.reset();

    try {
      this.setStatus("connecting");
      await this.connectInternal();
    } catch (error) {
      this.setStatus("error");
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * 内部连接逻辑，connect() 和 handleUnexpectedClose() 共用
   */
  private async connectInternal(): Promise<void> {
    // Create transport based on config (async)
    const transportResult = await createTransportAsync(this.config, {
      hostMode: typeof process !== "undefined" ? "electron" : "web",
      connectionTimeout: this.config.timeout,
      onStatusChange: (status) => {
        if (status === "error") {
          this.setStatus("error");
        }
      },
    });

    if (!transportResult.transport) {
      throw new Error(transportResult.error || "Failed to create transport");
    }

    this.transport = transportResult.transport;

    // Create MCP client with listChanged support
    this.client = new Client(
      {
        name: "leochat",
        version: "0.0.1",
      },
      {
        capabilities: {},
        listChanged: {
          tools: {
            autoRefresh: true,
            debounceMs: 500,
            onChanged: (_error: Error | null, tools: MCPTool[] | null) => {
              if (tools) {
                console.log(`[MCP] Tools list changed for ${this.config.name}: ${tools.length} tools`);
                this.tools = tools.map((tool: any) => ({
                  name: tool.name,
                  description: tool.description,
                  inputSchema: tool.inputSchema as Record<string, unknown>,
                }));
                this.onToolsUpdate?.(this.tools);
              }
            },
          },
        },
      }
    );

    // Connect
    await this.client.connect(this.transport);

    // 监听连接关闭，触发自动重连
    this.client.onclose = () => {
      if (!this.intentionalDisconnect) {
        console.log(`[MCP] Connection lost for ${this.config.name}, initiating reconnect...`);
        this.handleUnexpectedClose();
      }
    };

    // Get server capabilities
    const serverCapabilities = this.client.getServerCapabilities() as Record<string, unknown> | undefined;
    this.capabilities = {
      tools: !!serverCapabilities?.tools,
      resources: !!serverCapabilities?.resources,
      prompts: !!serverCapabilities?.prompts,
      sampling: !!serverCapabilities?.sampling,
    };

    // Mark as connected before refreshing tools
    this.setStatus("connected");

    // List available tools if supported
    if (this.capabilities.tools) {
      await this.refreshTools();
    }
  }

  async disconnect(): Promise<void> {
    if (this.status === "disconnected") {
      return;
    }

    this.intentionalDisconnect = true;
    this.cancelReconnect();

    try {
      if (this.client) {
        await this.client.close();
      }
      this.client = null;
      this.transport = null;
      this.tools = [];
      this.capabilities = null;
      this.setStatus("disconnected");
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * 意外断开后的自动重连
   */
  private async handleUnexpectedClose(): Promise<void> {
    // 清理 dead 引用
    this.client = null;
    this.transport = null;
    this.tools = [];

    if (!this.autoReconnect) {
      this.setStatus("disconnected");
      return;
    }

    this.setStatus("reconnecting");
    this.reconnectAbortController = new AbortController();
    const signal = this.reconnectAbortController.signal;
    const { maxAttempts, initialDelayMs, backoffFactor, maxDelayMs, jitter } = this.reconnectConfig;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // 检查是否被取消（用户主动断开）
      if (signal.aborted) {
        console.log(`[MCP] Reconnect cancelled for ${this.config.name}`);
        return;
      }

      // 检查熔断器
      if (!this.circuitBreaker.canAttempt()) {
        console.log(`[MCP] Circuit breaker open for ${this.config.name}, stopping reconnect`);
        this.setStatus("error");
        this.onError?.(new Error(`Reconnect circuit breaker open after repeated failures`));
        return;
      }

      this.onReconnectAttempt?.(attempt, maxAttempts);

      try {
        await this.connectInternal();
        // 成功
        this.circuitBreaker.recordSuccess();
        this.reconnectAbortController = null;
        console.log(`[MCP] Reconnected successfully: ${this.config.name} (attempt ${attempt}/${maxAttempts})`);
        return;
      } catch (error) {
        this.circuitBreaker.recordFailure();
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[MCP] Reconnect attempt ${attempt}/${maxAttempts} failed for ${this.config.name}: ${errorMsg}`);

        if (attempt < maxAttempts) {
          // 计算退避延迟
          const exponentialDelay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
          const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
          const delay = jitter ? Math.random() * cappedDelay : cappedDelay;

          console.log(`[MCP] Next reconnect in ${Math.round(delay)}ms`);

          // 等待，支持取消
          try {
            await this.sleep(delay, signal);
          } catch {
            // AbortError — 用户取消
            console.log(`[MCP] Reconnect cancelled for ${this.config.name}`);
            return;
          }
        }
      }
    }

    // 所有重试用尽
    this.reconnectAbortController = null;
    console.error(`[MCP] Reconnect failed for ${this.config.name} after ${maxAttempts} attempts`);
    this.setStatus("error");
    this.onError?.(new Error(`Failed to reconnect after ${maxAttempts} attempts`));
  }

  private cancelReconnect(): void {
    if (this.reconnectAbortController) {
      this.reconnectAbortController.abort();
      this.reconnectAbortController = null;
    }
  }

  private sleep(ms: number, signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException("Aborted", "AbortError"));
        return;
      }
      const timeoutId = setTimeout(resolve, ms);
      signal?.addEventListener("abort", () => {
        clearTimeout(timeoutId);
        reject(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    });
  }

  async refreshTools(): Promise<MCPTool[]> {
    if (!this.client || this.status !== "connected") {
      throw new Error("Client not connected");
    }

    const result = await this.client.listTools();
    this.tools = result.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
    }));

    this.onToolsUpdate?.(this.tools);
    return this.tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    if (!this.client || this.status !== "connected") {
      throw new Error("Client not connected");
    }

    const result = await this.client.callTool({
      name,
      arguments: args,
    });

    return result;
  }

  async listResources(): Promise<unknown[]> {
    if (!this.client || this.status !== "connected") {
      throw new Error("Client not connected");
    }

    if (!this.capabilities?.resources) {
      return [];
    }

    const result = await this.client.listResources();
    return result.resources;
  }

  async readResource(uri: string): Promise<unknown> {
    if (!this.client || this.status !== "connected") {
      throw new Error("Client not connected");
    }

    const result = await this.client.readResource({ uri });
    return result;
  }

  async listPrompts(): Promise<unknown[]> {
    if (!this.client || this.status !== "connected") {
      throw new Error("Client not connected");
    }

    if (!this.capabilities?.prompts) {
      return [];
    }

    const result = await this.client.listPrompts();
    return result.prompts;
  }

  async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<unknown> {
    if (!this.client || this.status !== "connected") {
      throw new Error("Client not connected");
    }

    const result = await this.client.getPrompt({
      name,
      arguments: args,
    });
    return result;
  }

  getSession(): MCPSession {
    return {
      serverId: this.config.id,
      status: this.status,
      capabilities: this.capabilities || undefined,
      tools: this.tools,
    };
  }
}
