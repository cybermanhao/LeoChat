// Message types
export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  reasoning_content?: string;  // 推理过程（o1/DeepSeek）
  tool_calls?: ToolCall[];     // 工具调用
  tool_call_id?: string;       // 工具结果对应的调用 ID
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  model?: string;
  tokens?: {
    input: number;
    output: number;
  };
  toolCalls?: ToolCall[];
  isStreaming?: boolean;
  finishReason?: string;
}

// Tool call types
export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  status: "pending" | "running" | "completed" | "error";
}

// MCP types
export interface MCPServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "streamable-http";
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
}

export interface MCPSession {
  serverId: string;
  status: "connecting" | "connected" | "disconnected" | "error";
  capabilities?: MCPCapabilities;
  tools?: MCPTool[];
}

export interface MCPCapabilities {
  tools?: boolean;
  resources?: boolean;
  prompts?: boolean;
  sampling?: boolean;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

// Theme types
export interface ThemeConfig {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  radius: string;
}

// Stream parsing types
export interface StreamChunk {
  type: "text" | "code" | "image" | "action" | "tool_call";
  content: string;
  metadata?: Record<string, unknown>;
  isComplete: boolean;
}

export interface CodeBlockState {
  language: string;
  content: string;
  isComplete: boolean;
}

// Host bridge types (for Electron/Web abstraction)
export type HostMode = "web" | "electron";

export interface HostBridge {
  mode: HostMode;
  sendMessage: (channel: string, data: unknown) => Promise<unknown>;
  onMessage: (channel: string, callback: (data: unknown) => void) => () => void;
  invoke: <T>(method: string, ...args: unknown[]) => Promise<T>;
}

// API types
export interface LLMRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  maxTokens?: number;
  tools?: MCPTool[];
}

export interface LLMResponse {
  id: string;
  choices: {
    message: ChatMessage;
    finishReason: string;
  }[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// Server API types
export interface ServerStatus {
  isRunning: boolean;
  mode: HostMode;
  mcpSessions: MCPSession[];
  uptime: number;
}

// Event types
export type AppEvent =
  | { type: "message:send"; payload: ChatMessage }
  | { type: "message:stream"; payload: StreamChunk }
  | { type: "message:complete"; payload: { messageId: string } }
  | { type: "theme:update"; payload: Partial<ThemeConfig> }
  | { type: "mcp:connect"; payload: MCPServerConfig }
  | { type: "mcp:disconnect"; payload: { serverId: string } }
  | { type: "tool:execute"; payload: ToolCall };

// Re-export TaskLoop types
export * from "./task-loop";

// Re-export Retry types
export * from "./retry";

// Re-export Checkpoint types
export * from "./checkpoint";
