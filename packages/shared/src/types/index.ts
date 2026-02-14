// ============ 消息状态枚举 ============

/**
 * 消息最终状态
 */
export enum MessageState {
  Success = 'success',
  Abort = 'abort',
  Timeout = 'timeout',
  LLMError = 'llm_error',
  MCPError = 'mcp_error',
}

/**
 * 消息卡片渲染状态
 */
export type MessageCardStatus =
  | 'connecting'
  | 'thinking'
  | 'generating'
  | 'tool_calling'
  | 'stable';

// ============ 核心消息类型 ============

/**
 * Message - 统一消息格式
 * 用于: LLM 交互、存储、前后端通信
 */
export interface Message {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  timestamp: number;
  state?: MessageState;
  reasoning_content?: string;
  metadata?: MessageMetadata;
  /** @deprecated 使用 toDisplayMessage() 转换，此字段将被移除 */
  contentItems?: ContentItem[];
}

// ============ UI 显示类型 ============

/**
 * 内容项类型
 */
export type ContentItemType =
  | 'text'
  | 'tool-call'
  | 'tool-result'
  | 'ui-command'
  | 'card'
  | 'action-button';

/**
 * 内容项
 */
export interface ContentItem {
  id: string;
  type: ContentItemType;
  content: string | ToolCall | ToolResult | UICommand | CardData | ActionButtonData;
  timestamp: number;
  status?: 'pending' | 'running' | 'completed' | 'error';
}

/**
 * DisplayMessage - UI 显示消息
 * 由 Message 转换而来，仅用于前端渲染
 */
export interface DisplayMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  contentItems: ContentItem[];
  timestamp: number;
  reasoning_content?: string;
  metadata?: MessageMetadata;
}

// ============ 转换函数 ============

/**
 * 将 Message 转换为 DisplayMessage
 */
export function toDisplayMessage(msg: Message): DisplayMessage {
  const contentItems: ContentItem[] = [];

  // 添加文本内容
  if (msg.content) {
    contentItems.push({
      id: `${msg.id}-text`,
      type: 'text',
      content: msg.content,
      timestamp: msg.timestamp,
    });
  }

  // 添加工具调用
  if (msg.tool_calls) {
    for (const tc of msg.tool_calls) {
      contentItems.push({
        id: `${msg.id}-tc-${tc.id}`,
        type: 'tool-call',
        content: tc,
        timestamp: msg.timestamp,
        status: tc.status,
      });
    }
  }

  return {
    id: msg.id,
    role: msg.role,
    contentItems,
    timestamp: msg.timestamp,
    reasoning_content: msg.reasoning_content,
    metadata: msg.metadata,
  };
}

/**
 * 从 DisplayMessage 提取用于 LLM 的 Message
 */
export function toMessage(dm: DisplayMessage): Message {
  const textItems = dm.contentItems.filter(item => item.type === 'text');
  const toolCallItems = dm.contentItems.filter(item => item.type === 'tool-call');

  return {
    id: dm.id,
    role: dm.role,
    content: textItems.map(item => item.content as string).join(''),
    tool_calls: toolCallItems.length > 0
      ? toolCallItems.map(item => item.content as ToolCall)
      : undefined,
    timestamp: dm.timestamp,
    reasoning_content: dm.reasoning_content,
    metadata: dm.metadata,
  };
}

// ============ 向后兼容别名 ============

/** @deprecated Use Message instead */
export type ChatMessage = Message;

/** @deprecated Use Message instead */
export type ContextMessage = Message;

/** @deprecated Use ContentItem instead */
export type MessageContentItem = ContentItem;

/** @deprecated Use ContentItemType instead */
export type MessageContentType = ContentItemType;

/** @deprecated Use ContentItem[] instead */
export type BubbleContentArray = ContentItem[];

/** @deprecated Use ContentItem instead */
export type BubbleContentItem = ContentItem;

/** @deprecated Use ContentItemType instead */
export type BubbleContentType = ContentItemType;

// 工具结果类型
export interface ToolResult {
  id: string;
  toolCallId: string;
  result: unknown;
  error?: string;
  status: 'success' | 'error';
}

// UI命令类型
export interface UICommand {
  command: 'update_theme' | 'show_notification' | 'show_confirm' | 'open_panel' | 'close_panel' | 'copy_to_clipboard' | 'open_url' | 'scroll_to_message' | 'set_input' | 'render_cards';
  payload: Record<string, unknown>;
}

// 卡片数据类型
export interface CardData {
  title?: string;
  description?: string;
  image?: string;
  link?: string;
  linkText?: string;
}

// 动作按钮数据类型
export interface ActionButtonData {
  name: string;
  label: string;
  attributes: Record<string, string>;
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
  timeout?: number;
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
