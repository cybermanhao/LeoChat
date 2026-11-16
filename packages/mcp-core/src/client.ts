import { Client } from "@modelcontextprotocol/client";
import type {
  MCPServerConfig,
  MCPSession,
  MCPTool,
  MCPCapabilities,
} from "@ai-chatbox/shared";
import { createTransportAsync, type MCPTransport } from "./transports";

/** 重连配置 */
export interface ReconnectConfig {
  maxAttempts: number;
  initialDelayMs: number;
  backoffFactor: number;
  maxDelayMs: number;
  jitter: boolean;
}

// 与 dsh mcp-client 一致：500ms 起翻倍、上限 30s、每次断线最多连续失败 10 次；
// 连接稳定运行超过 maxDelayMs 后，失败计数重新开始
const DEFAULT_RECONNECT_CONFIG: ReconnectConfig = {
  maxAttempts: 10,
  initialDelayMs: 500,
  backoffFactor: 2,
  maxDelayMs: 30000,
  jitter: false,
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
  /** 连续失败的重连次数；连接稳定超过 maxDelayMs 后才清零（参考 dsh 的尝试预算） */
  private failedAttempts = 0;
  private connectedAt = 0;
  /**
   * 所有同步（首次连接、listChanged 触发的刷新、重连）串行执行，参考 dsh 的连接监督器。
   * 以前 SDK 的 autoRefresh 和我们自己的 refreshTools() 并发，导致 connect 永久挂住（见 docs/mcp-sdk-listchanged-hang.md）；
   * 串行之后这类竞态在结构上不可能再发生。
   */
  private syncQueue: Promise<unknown> = Promise.resolve();

  constructor(options: MCPClientOptions) {
    this.config = options.config;
    this.onStatusChange = options.onStatusChange;
    this.onToolsUpdate = options.onToolsUpdate;
    this.onError = options.onError;
    this.onReconnectAttempt = options.onReconnectAttempt;
    this.autoReconnect = options.autoReconnect ?? false;
    this.reconnectConfig = { ...DEFAULT_RECONNECT_CONFIG, ...options.reconnectConfig };
  }

  /** 把一次同步排进串行队列；前一次失败不影响后一次执行 */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.syncQueue.then(fn, fn);
    this.syncQueue = run.catch(() => {});
    return run;
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
    this.failedAttempts = 0;

    try {
      this.setStatus("connecting");
      await this.enqueue(() => this.connectInternal());
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
      hostMode: typeof process !== "undefined" && !!process.versions?.node ? "electron" : "web",
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

    // Create MCP client
    // Note: do NOT pass listChanged.tools.autoRefresh — in SDK >=1.x it triggers
    // an internal listTools() call during connect() which races with our own
    // refreshTools() call below, causing the connect to hang indefinitely.
    //
    // versionNegotiation: 'auto' opts into probing every server for MCP
    // 2026-07-28 (modern era) support via server/discover. Servers that don't
    // implement it (the vast majority right now — this is brand new) fall
    // back to the plain legacy handshake automatically; on stdio a fallback
    // costs one extra short-lived sibling-process spawn per connect.
    this.client = new Client(
      {
        name: "leochat",
        version: "0.0.1",
      },
      {
        capabilities: {},
        versionNegotiation: { mode: "auto" },
      }
    );

    // Connect
    await this.client.connect(this.transport);
    this.connectedAt = Date.now();

    // 服务端通知工具列表变化时刷新。刷新排进串行队列，不会和连接、重连或另一次刷新并发
    const client = this.client;
    client.setNotificationHandler("notifications/tools/list_changed", () => {
      void this.enqueue(async () => {
        if (this.client === client && this.status === "connected") await this.refreshTools();
      }).catch((err) => this.onError?.(err instanceof Error ? err : new Error(String(err))));
    });

    // 监听连接关闭，触发自动重连
    this.client.onclose = () => {
      if (!this.intentionalDisconnect) {
        console.log(`[MCP] Connection lost for ${this.config.name}, initiating reconnect...`);
        this.handleUnexpectedClose().catch((err) => {
          this.onError?.(err instanceof Error ? err : new Error(String(err)));
        });
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
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
    } finally {
      // Always clean up state even if close() fails
      this.client = null;
      this.transport = null;
      this.tools = [];
      this.capabilities = null;
      this.setStatus("disconnected");
    }
  }

  /**
   * 意外断开后的自动重连
   */
  private async handleUnexpectedClose(): Promise<void> {
    // 清理 dead 引用。工具列表保留（断线期间仍然列出，调用会失败），直到重连放弃
    this.client = null;
    this.transport = null;

    if (!this.autoReconnect) {
      this.dropTools();
      this.setStatus("disconnected");
      return;
    }
    // 上一次连接稳定运行得够久，失败计数重新开始；否则接着上次的计数（避免反复闪断时无限重连）
    if (Date.now() - this.connectedAt >= this.reconnectConfig.maxDelayMs) this.failedAttempts = 0;

    this.setStatus("reconnecting");
    this.reconnectAbortController = new AbortController();
    const signal = this.reconnectAbortController.signal;
    const { maxAttempts, initialDelayMs, backoffFactor, maxDelayMs, jitter } = this.reconnectConfig;

    while (this.failedAttempts < maxAttempts) {
      // 检查是否被取消（用户主动断开）
      if (signal.aborted) {
        console.log(`[MCP] Reconnect cancelled for ${this.config.name}`);
        return;
      }
      const attempt = this.failedAttempts + 1;
      this.onReconnectAttempt?.(attempt, maxAttempts);

      try {
        await this.enqueue(() => this.connectInternal());
        this.reconnectAbortController = null;
        console.log(`[MCP] Reconnected successfully: ${this.config.name} (attempt ${attempt}/${maxAttempts})`);
        return;
      } catch (error) {
        this.failedAttempts++;
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.log(`[MCP] Reconnect attempt ${attempt}/${maxAttempts} failed for ${this.config.name}: ${errorMsg}`);
        if (this.failedAttempts >= maxAttempts) break;

        const cappedDelay = Math.min(initialDelayMs * Math.pow(backoffFactor, this.failedAttempts - 1), maxDelayMs);
        const delay = jitter ? Math.random() * cappedDelay : cappedDelay;
        console.log(`[MCP] Next reconnect in ${Math.round(delay)}ms`);
        try {
          await this.sleep(delay, signal);
        } catch {
          console.log(`[MCP] Reconnect cancelled for ${this.config.name}`);
          return;
        }
      }
    }

    // 连续失败次数用尽：移除工具，停止重连，直到用户手动连接
    this.reconnectAbortController = null;
    console.error(`[MCP] Reconnect failed for ${this.config.name} after ${maxAttempts} attempts`);
    this.dropTools();
    this.setStatus("error");
    this.onError?.(new Error(`Failed to reconnect after ${maxAttempts} attempts`));
  }

  private dropTools(): void {
    if (this.tools.length === 0) return;
    this.tools = [];
    this.onToolsUpdate?.([]);
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

    try {
      const result = await this.client.listResources();
      return result.resources;
    } catch (error) {
      // Some servers advertise capability but don't implement the method (-32601)
      if ((error as { code?: number }).code === -32601) return [];
      throw error;
    }
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

    try {
      const result = await this.client.listPrompts();
      return result.prompts;
    } catch (error) {
      // Some servers advertise capability but don't implement the method (-32601)
      if ((error as { code?: number }).code === -32601) return [];
      throw error;
    }
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
