import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type {
  MCPServerConfig,
  MCPSession,
  MCPTool,
  MCPCapabilities,
} from "@ai-chatbox/shared";
import { createTransport, type MCPTransport } from "./transports";

export interface MCPClientOptions {
  config: MCPServerConfig;
  onStatusChange?: (status: MCPSession["status"]) => void;
  onToolsUpdate?: (tools: MCPTool[]) => void;
  onError?: (error: Error) => void;
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

  constructor(options: MCPClientOptions) {
    this.config = options.config;
    this.onStatusChange = options.onStatusChange;
    this.onToolsUpdate = options.onToolsUpdate;
    this.onError = options.onError;
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
    if (this.status === "connected" || this.status === "connecting") {
      return;
    }

    try {
      this.setStatus("connecting");

      // Create transport based on config
      this.transport = createTransport(this.config);

      // Create MCP client
      this.client = new Client(
        {
          name: "ai-chatbox",
          version: "0.0.1",
        },
        {
          capabilities: {},
        }
      );

      // Connect
      await this.client.connect(this.transport);

      // Get server capabilities
      const serverCapabilities = this.client.getServerCapabilities() as Record<string, unknown> | undefined;
      this.capabilities = {
        tools: !!serverCapabilities?.tools,
        resources: !!serverCapabilities?.resources,
        prompts: !!serverCapabilities?.prompts,
        sampling: !!serverCapabilities?.sampling,
      };

      // List available tools if supported
      if (this.capabilities.tools) {
        await this.refreshTools();
      }

      this.setStatus("connected");
    } catch (error) {
      this.setStatus("error");
      this.onError?.(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.status === "disconnected") {
      return;
    }

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
