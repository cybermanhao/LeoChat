// ============ 消息 ============

/**
 * LLMService（OpenAI 兼容接口）使用的消息格式。
 * 对话本身、持久化和界面都用 @leochat/core 的 Message（内容块）；这个类型只在旧桥接里使用。
 */
export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  timestamp: number;
  reasoning_content?: string;
  metadata?: MessageMetadata;
}

/** @deprecated 同 Message */
export type ChatMessage = Message;

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
  cwd?: string;
  url?: string;
  env?: Record<string, string>;
  timeout?: number;
  /**
   * Max size (bytes) of a single stdio JSON-RPC message. The v2 MCP SDK
   * enforces a 10MB default (v1 had no cap) — exceeding it closes the
   * connection. Bump this for servers that can return large payloads
   * (screenshots, large file reads). Only applies to "stdio" transport.
   */
  maxBufferSize?: number;
}

export interface MCPSession {
  serverId: string;
  status: "connecting" | "connected" | "disconnected" | "error" | "reconnecting";
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

// MCP Resource types
export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

// MCP Prompt types
export interface MCPPrompt {
  name: string;
  description?: string;
  arguments?: MCPPromptArgument[];
}

export interface MCPPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

// MCP Source types (for grouping servers)
export type MCPSourceType = "builtin" | "custom";

export interface MCPSource {
  id: string;
  name: string;
  type: MCPSourceType;
  servers: MCPServerConfig[];
}

// Extended server config
export interface MCPServerConfigExtended extends MCPServerConfig {
  sourceId?: string;
  description?: string;
  autoConnect?: boolean;
}

// Server runtime state
export interface MCPServerState {
  serverId: string;
  enabled: boolean;
  session?: MCPSession;
  resources?: MCPResource[];
  prompts?: MCPPrompt[];
  lastConnected?: number;
  error?: string;
}

// Theme types
export interface ThemeConfig {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
  card?: string;              // 卡片背景色（可选，默认使用 background）
  cardForeground?: string;    // 卡片前景色（可选，默认使用 foreground）
  muted: string;
  mutedForeground: string;
  border: string;
  radius: string;
}

// Host bridge types (for Electron/Web abstraction)
export type HostMode = "web" | "electron";


// Server API types
export interface ServerStatus {
  isRunning: boolean;
  mode: HostMode;
  /** @deprecated Use mcpSessionCount instead */
  mcpSessions?: MCPSession[];
  mcpSessionCount?: number;
  uptime: number;
}

// LLM 配置
export * from "./llm";

// Re-export Card types
export * from "./card";
