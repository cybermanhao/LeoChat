import type { ChatMessage, ToolCall, MCPTool } from "./index";
import type { RetryConfig, CircuitBreakerConfig, CircuitState } from "./retry";
import type { CheckpointReason } from "./checkpoint";

/**
 * 消息卡片状态 - 用于 UI 显示
 */
export type CardStatus =
  | "connecting"    // 正在连接 LLM
  | "thinking"      // 模型思考中（等待首个 token）
  | "reasoning"     // 推理中（o1/DeepSeek 的思考过程）
  | "generating"    // 生成内容中
  | "tool_calling"  // 执行工具中
  | "stable";       // 完成/稳定状态

/**
 * TaskLoop 内部状态
 */
export type TaskLoopStatus =
  | "idle"
  | "connecting"
  | "thinking"
  | "reasoning"
  | "generating"
  | "tool_calling"
  | "tool_completed"
  | "completed"
  | "error"
  | "aborted";

/**
 * 增量更新数据
 */
export interface MessageDelta {
  content_delta?: string;
  reasoning_delta?: string;
  followup_content_delta?: string;
  tool_calls?: ToolCall[];
}

/**
 * TaskLoop 事件类型（Discriminated Union）
 */
export type TaskLoopEvent =
  | TaskLoopAddEvent
  | TaskLoopUpdateEvent
  | TaskLoopToolCallEvent
  | TaskLoopToolResultEvent
  | TaskLoopStatusEvent
  | TaskLoopErrorEvent
  | TaskLoopDoneEvent
  | TaskLoopRetryEvent
  | TaskLoopCircuitStateEvent
  | TaskLoopCheckpointEvent;

export interface TaskLoopAddEvent {
  type: "add";
  message: ChatMessage;
  cardStatus?: CardStatus;
}

export interface TaskLoopUpdateEvent {
  type: "update";
  messageId: string;
  delta: MessageDelta;
}

export interface TaskLoopToolCallEvent {
  type: "toolcall";
  toolCall: ToolCall;
  messageId: string;
  /** 工具调用前的累积内容（用于日志） */
  contentBeforeToolCall?: string;
}

export interface TaskLoopToolResultEvent {
  type: "toolresult";
  toolCallId: string;
  result: unknown;
  error?: string;
}

export interface TaskLoopStatusEvent {
  type: "status";
  status: TaskLoopStatus;
  cardStatus?: CardStatus;
}

export interface TaskLoopErrorEvent {
  type: "error";
  error: Error;
  recoverable?: boolean;
}

export interface TaskLoopDoneEvent {
  type: "done";
  epochCount: number;
  totalTokens?: {
    input: number;
    output: number;
  };
  /** 完整的内部消息历史（用于下次发送给 LLM） */
  internalMessages?: ChatMessage[];
}

export interface TaskLoopRetryEvent {
  type: "retry";
  /** Current attempt number (1-indexed) */
  attempt: number;
  /** Maximum attempts configured */
  maxAttempts: number;
  /** Delay before this retry in ms */
  delayMs: number;
  /** The error that triggered the retry */
  error: Error;
  /** HTTP status code if available */
  statusCode?: number;
}

export interface TaskLoopCircuitStateEvent {
  type: "circuit_state_change";
  /** Previous circuit state */
  previousState: CircuitState;
  /** New circuit state */
  newState: CircuitState;
  /** Current failure count */
  failureCount: number;
}

export interface TaskLoopCheckpointEvent {
  type: "checkpoint_created";
  /** Checkpoint ID */
  checkpointId: string;
  /** Reason for checkpoint */
  reason: CheckpointReason;
}

/**
 * TaskLoop 构造选项
 */
export interface TaskLoopOptions {
  chatId: string;
  history?: ChatMessage[];
  systemPrompt?: string;

  // LLM 配置
  llmConfig: LLMConfig;

  // MCP 配置
  mcpTools?: MCPTool[];
  onToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;

  // 控制参数
  maxEpochs?: number;           // 最大工具调用轮数，默认 50
  parallelToolCalls?: boolean;  // 是否并行执行工具调用

  // 重试配置（可选）
  retryConfig?: Partial<RetryConfig>;
  circuitBreakerConfig?: Partial<CircuitBreakerConfig>;

  // Checkpoint 配置（可选）
  enableCheckpoints?: boolean;         // 是否启用自动检查点

  // 后端代理模式配置
  useBackendProxy?: boolean;           // 是否使用后端代理（API 密钥在服务端）
  backendURL?: string;                 // 后端 URL，默认 http://localhost:3001
}

/**
 * LLM 配置
 */
export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;

  // 额外 headers（如 OpenRouter 需要）
  headers?: Record<string, string>;
}

/**
 * 支持的 LLM 提供商
 */
export type LLMProvider =
  | "openrouter"
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "custom";

/**
 * 模型适配器接口
 */
export interface ModelAdapter {
  /**
   * 获取 API 基础 URL
   */
  getBaseURL(config: LLMConfig): string;

  /**
   * 转换工具格式
   */
  convertTools(tools: MCPTool[], model: string): unknown;

  /**
   * 构建请求 headers
   */
  buildHeaders(config: LLMConfig): Record<string, string>;

  /**
   * 构建请求体
   */
  buildRequestBody(
    messages: ChatMessage[],
    tools: unknown,
    config: LLMConfig
  ): unknown;

  /**
   * 解析流式响应 chunk
   */
  parseStreamChunk(chunk: string, model: string): {
    content_delta?: string;
    reasoning_delta?: string;
    tool_calls?: Partial<ToolCall>[];
    finish_reason?: string;
  };

  /**
   * 解析完整的工具调用
   */
  parseToolCalls(message: unknown, model: string): ToolCall[];

  /**
   * 检测是否支持推理内容
   */
  supportsReasoning(model: string): boolean;
}

/**
 * TaskLoop 事件订阅器
 */
export type TaskLoopListener = (event: TaskLoopEvent) => void;

/**
 * TaskLoop 取消订阅函数
 */
export type TaskLoopUnsubscribe = () => void;
