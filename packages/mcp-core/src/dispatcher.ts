import type { MCPTool, ToolCall } from "@ai-chatbox/shared";
import { generateId } from "@ai-chatbox/shared";
import type { MCPClient } from "./client";

export interface ToolDispatcherOptions {
  onToolStart?: (toolCall: ToolCall) => void;
  onToolComplete?: (toolCall: ToolCall) => void;
  onToolError?: (toolCall: ToolCall, error: Error) => void;
}

export interface DispatchResult {
  toolCall: ToolCall;
  result: unknown;
}

/**
 * Tool dispatcher that routes tool calls to appropriate MCP servers
 */
export class ToolDispatcher {
  private clients: Map<string, MCPClient> = new Map();
  private toolServerMap: Map<string, string> = new Map(); // tool name -> server id
  private options: ToolDispatcherOptions;

  constructor(options: ToolDispatcherOptions = {}) {
    this.options = options;
  }

  /**
   * Register an MCP client for tool dispatch
   */
  registerClient(client: MCPClient): void {
    this.clients.set(client.serverId, client);
    this.updateToolMap();
  }

  /**
   * Unregister an MCP client
   */
  unregisterClient(serverId: string): void {
    this.clients.delete(serverId);
    this.updateToolMap();
  }

  /**
   * Update the tool -> server mapping
   */
  private updateToolMap(): void {
    this.toolServerMap.clear();
    for (const [serverId, client] of this.clients) {
      for (const tool of client.availableTools) {
        // If tool name conflicts, later registered server wins
        this.toolServerMap.set(tool.name, serverId);
      }
    }
  }

  /**
   * Get all available tools from all connected servers
   */
  getAllTools(): MCPTool[] {
    const tools: MCPTool[] = [];
    for (const client of this.clients.values()) {
      tools.push(...client.availableTools);
    }
    return tools;
  }

  /**
   * Get tools formatted for LLM API
   */
  getToolsForLLM(): Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }> {
    return this.getAllTools().map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Find which server handles a specific tool
   */
  findServerForTool(toolName: string): string | undefined {
    return this.toolServerMap.get(toolName);
  }

  /**
   * Dispatch a tool call to the appropriate server
   */
  async dispatch(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<DispatchResult> {
    const toolCall: ToolCall = {
      id: generateId(),
      name: toolName,
      arguments: args,
      status: "pending",
    };

    const serverId = this.toolServerMap.get(toolName);
    if (!serverId) {
      toolCall.status = "error";
      const error = new Error(`No server found for tool: ${toolName}`);
      this.options.onToolError?.(toolCall, error);
      throw error;
    }

    const client = this.clients.get(serverId);
    if (!client) {
      toolCall.status = "error";
      const error = new Error(`Server not connected: ${serverId}`);
      this.options.onToolError?.(toolCall, error);
      throw error;
    }

    try {
      toolCall.status = "running";
      this.options.onToolStart?.(toolCall);

      const result = await client.callTool(toolName, args);

      toolCall.status = "completed";
      toolCall.result = result;
      this.options.onToolComplete?.(toolCall);

      return { toolCall, result };
    } catch (error) {
      toolCall.status = "error";
      this.options.onToolError?.(
        toolCall,
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Dispatch multiple tool calls in parallel
   */
  async dispatchMany(
    calls: Array<{ name: string; arguments: Record<string, unknown> }>
  ): Promise<DispatchResult[]> {
    return Promise.all(
      calls.map((call) => this.dispatch(call.name, call.arguments))
    );
  }

  /**
   * Check if a tool is available
   */
  hasTools(toolName: string): boolean {
    return this.toolServerMap.has(toolName);
  }

  /**
   * Get connected server count
   */
  get connectedServers(): number {
    return this.clients.size;
  }

  /**
   * Get total tool count
   */
  get totalTools(): number {
    return this.toolServerMap.size;
  }
}

/**
 * Built-in tools that don't require MCP servers
 */
export const builtInTools = {
  /**
   * Update interface theme
   */
  update_interface: {
    name: "update_interface",
    description: "Update the chat interface theme and appearance",
    inputSchema: {
      type: "object",
      properties: {
        theme: {
          type: "string",
          description: "Theme preset ID (e.g., 'dark', 'light-purple', 'dark-green')",
        },
        primary: {
          type: "string",
          description: "Primary color in HSL format (e.g., '270 50% 40%')",
        },
        radius: {
          type: "string",
          description: "Border radius (e.g., '0.5rem', '1rem')",
        },
      },
    },
  },
} as const;

export type BuiltInToolName = keyof typeof builtInTools;
