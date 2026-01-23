import { generateId } from "@ai-chatbox/shared";
import type {
  ChatMessage,
  ToolCall,
  MCPTool,
  TaskLoopOptions,
  TaskLoopEvent,
  TaskLoopListener,
  TaskLoopUnsubscribe,
  TaskLoopStatus,
  CardStatus,
  LLMConfig,
  RetryConfig,
  TaskLoopCheckpoint,
  CheckpointStorage,
  CheckpointReason,
  ResumeOptions,
} from "@ai-chatbox/shared";

/**
 * 流式工具调用块（包含 index 和 arguments_delta）
 */
interface StreamingToolCallChunk {
  index?: number;
  id?: string;
  name?: string;
  arguments_delta?: string;
}
import { createModelAdapter, type ModelAdapterInstance } from "./model-adapter";
import { withRetry, CircuitBreaker, DEFAULT_RETRY_CONFIG } from "./retry";
import { getCheckpointStorage } from "./checkpoint-storage";

const MAX_EPOCHS_DEFAULT = 50;
const MAX_TOOL_RESULT_LENGTH = 3000;
const DEFAULT_BACKEND_URL = "http://localhost:3001";

/**
 * 截断工具调用结果
 */
function truncateToolResult(content: string, maxLength: number = MAX_TOOL_RESULT_LENGTH): string {
  if (content.length <= maxLength) return content;
  const truncatedLength = Math.floor(maxLength * 0.85);
  return content.substring(0, truncatedLength) + `\n\n[内容已截断 - 原长度: ${content.length}]`;
}

/**
 * TaskLoop - 框架无关的对话循环引擎
 *
 * 核心设计：
 * 1. 多实例模式：每个聊天会话独立的 TaskLoop 实例
 * 2. 事件驱动：通过 emit/subscribe 与 UI 解耦
 * 3. 自动工具链：支持多轮工具调用的自动循环
 * 4. UI 占位消息与内部历史分离
 */
export class TaskLoop {
  private chatId: string;
  private messages: ChatMessage[];  // 内部历史（深拷贝）
  private listeners: Set<TaskLoopListener> = new Set();
  private abortController: AbortController | null = null;
  private status: TaskLoopStatus = "idle";

  // 配置
  private llmConfig: LLMConfig;
  private mcpTools: MCPTool[];
  private onToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  private maxEpochs: number;
  private parallelToolCalls: boolean;

  // 重试与熔断配置
  private retryConfig: RetryConfig;
  private circuitBreaker: CircuitBreaker;

  // Checkpoint 配置
  private enableCheckpoints: boolean;
  private checkpointStorage: CheckpointStorage;
  private currentEpoch: number = 0;

  // 模型适配器
  private adapter: ModelAdapterInstance;

  // 后端代理模式
  private useBackendProxy: boolean;
  private backendURL: string;

  constructor(opts: TaskLoopOptions) {
    this.chatId = opts.chatId;
    // 深拷贝历史消息，避免外部状态干扰
    this.messages = opts.history
      ? JSON.parse(JSON.stringify(opts.history))
      : [];

    this.llmConfig = opts.llmConfig;
    this.mcpTools = opts.mcpTools || [];
    this.onToolCall = opts.onToolCall;
    this.maxEpochs = opts.maxEpochs ?? MAX_EPOCHS_DEFAULT;
    this.parallelToolCalls = opts.parallelToolCalls ?? true;

    // 初始化重试配置
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...opts.retryConfig };

    // 初始化熔断器
    this.circuitBreaker = new CircuitBreaker(
      opts.circuitBreakerConfig,
      (event) => {
        this.emit({
          type: "circuit_state_change",
          previousState: event.previousState,
          newState: event.newState,
          failureCount: event.failureCount,
        });
      }
    );

    // 初始化 Checkpoint 配置
    this.enableCheckpoints = opts.enableCheckpoints ?? false;
    this.checkpointStorage = getCheckpointStorage();

    // 创建模型适配器
    this.adapter = createModelAdapter(opts.llmConfig.provider);

    // 后端代理模式
    this.useBackendProxy = opts.useBackendProxy ?? false;
    this.backendURL = opts.backendURL ?? DEFAULT_BACKEND_URL;

    // 确保包含 system 消息
    if (opts.systemPrompt) {
      this.ensureSystemMessage(opts.systemPrompt);
    }
  }

  /**
   * 确保消息历史包含 system 消息
   */
  private ensureSystemMessage(systemPrompt: string): void {
    const hasSystem = this.messages.some(m => m.role === "system");
    if (!hasSystem) {
      this.messages.unshift({
        id: generateId(),
        role: "system",
        content: systemPrompt,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * 订阅事件
   */
  subscribe(listener: TaskLoopListener): TaskLoopUnsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * 发射事件
   */
  private emit(event: TaskLoopEvent): void {
    this.listeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error("[TaskLoop] Event listener error:", error);
      }
    });
  }

  /**
   * 设置状态并发射事件
   */
  private setStatus(status: TaskLoopStatus, cardStatus?: CardStatus): void {
    this.status = status;
    this.emit({ type: "status", status, cardStatus });
  }

  /**
   * 获取当前状态
   */
  getStatus(): TaskLoopStatus {
    return this.status;
  }

  /**
   * 中止当前任务
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      this.setStatus("aborted", "stable");
    }
  }

  /**
   * 启动对话循环
   */
  async start(input: string): Promise<void> {
    if (this.status !== "idle" && this.status !== "completed" && this.status !== "error") {
      throw new Error(`TaskLoop is already running: ${this.status}`);
    }

    // 创建中止控制器
    this.abortController = new AbortController();

    try {
      // 1. 添加用户消息
      const userMessage: ChatMessage = {
        id: generateId(),
        role: "user",
        content: input,
        timestamp: Date.now(),
      };
      this.messages.push(userMessage);
      this.emit({ type: "add", message: userMessage });

      // 2. 多轮循环
      let epochCount = 0;
      for (let epoch = 0; epoch < this.maxEpochs; epoch++) {
        this.currentEpoch = epoch;
        epochCount = epoch + 1;

        // 检查是否已中止
        if (this.abortController?.signal.aborted) {
          this.setStatus("aborted", "stable");
          return;
        }

        // 2.1 创建 UI 占位消息
        const uiAssistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}-${epoch}`,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
        };
        this.emit({ type: "add", message: uiAssistantMessage, cardStatus: "connecting" });

        // 2.2 调用 LLM
        this.setStatus("connecting", "connecting");
        const { assistantMessage, needToolCall } = await this.callLLM(uiAssistantMessage.id);

        // 2.3 添加完整的 assistant 消息到内部历史
        this.messages.push(assistantMessage);

        // 2.4 检查工具调用
        if (needToolCall && assistantMessage.tool_calls?.length) {
          this.setStatus("tool_calling", "tool_calling");

          // 执行工具调用
          await this.executeToolCalls(assistantMessage.tool_calls);

          // 自动检查点（每轮完成后）
          if (this.enableCheckpoints) {
            await this.createCheckpoint("epoch_complete").catch(console.error);
          }

          this.setStatus("tool_completed", "connecting");
          // 继续下一轮
          continue;
        }

        // 无工具调用，结束循环
        break;
      }

      // 3. 完成
      this.setStatus("completed", "stable");
      this.emit({
        type: "done",
        epochCount,
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        this.setStatus("aborted", "stable");
      } else {
        // 错误时创建检查点（用于恢复）
        if (this.enableCheckpoints) {
          await this.createCheckpoint("error").catch(console.error);
        }

        this.setStatus("error", "stable");
        this.emit({
          type: "error",
          error: error instanceof Error ? error : new Error(String(error)),
          recoverable: false,
        });
      }
      throw error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * 调用 LLM 并流式处理响应（带重试机制）
   */
  private async callLLM(uiMessageId: string): Promise<{
    assistantMessage: ChatMessage;
    needToolCall: boolean;
  }> {
    return withRetry(
      (signal) => this.executeLLMRequest(uiMessageId, signal),
      this.retryConfig,
      this.circuitBreaker,
      (event) => {
        this.emit({
          type: "retry",
          attempt: event.attempt,
          maxAttempts: event.maxAttempts,
          delayMs: event.delayMs,
          error: event.error,
          statusCode: event.statusCode,
        });
      },
      this.abortController?.signal
    );
  }

  /**
   * 实际执行 LLM 请求
   */
  private async executeLLMRequest(
    uiMessageId: string,
    signal: AbortSignal
  ): Promise<{ assistantMessage: ChatMessage; needToolCall: boolean }> {
    // 使用后端代理模式
    if (this.useBackendProxy) {
      return this.executeBackendProxyRequest(uiMessageId, signal);
    }

    // 直连模式
    const baseURL = this.adapter.getBaseURL(this.llmConfig);
    const headers = this.adapter.buildHeaders(this.llmConfig);
    const tools = this.mcpTools.length > 0
      ? this.adapter.convertTools(this.mcpTools, this.llmConfig.model)
      : undefined;

    const body = this.adapter.buildRequestBody(
      this.messages,
      tools,
      this.llmConfig
    );

    // 发起流式请求
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify({ ...(body as Record<string, unknown>), stream: true }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM request failed: ${response.status} ${errorText}`);
    }

    // 处理流式响应
    return this.processStreamResponse(response, uiMessageId);
  }

  /**
   * 通过后端代理执行 LLM 请求
   */
  private async executeBackendProxyRequest(
    uiMessageId: string,
    signal: AbortSignal
  ): Promise<{ assistantMessage: ChatMessage; needToolCall: boolean }> {
    const response = await fetch(`${this.backendURL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: this.messages,
        model: this.llmConfig.model,
        provider: this.llmConfig.provider,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend proxy request failed: ${response.status} ${errorText}`);
    }

    // 处理后端 SSE 响应
    return this.processBackendSSEResponse(response, uiMessageId);
  }

  /**
   * 处理后端 SSE 响应格式
   * 后端使用的事件: chunk, tool_call, tool_result, complete, error
   */
  private async processBackendSSEResponse(
    response: Response,
    uiMessageId: string
  ): Promise<{ assistantMessage: ChatMessage; needToolCall: boolean }> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let reasoning_content = "";
    const toolCalls: ToolCall[] = [];
    let hasEmittedThinking = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          // SSE 格式: event: xxx\ndata: yyy
          if (line.startsWith("event: ")) {
            continue; // 跳过事件行，在 data 行处理
          }

          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            // 通过 index 字段区分 chunk 和 complete 事件
            // chunk 事件有 index 字段，complete 事件没有
            if ((parsed.content !== undefined || parsed.reasoning !== undefined) && parsed.index !== undefined) {
              // chunk 事件
              if (!hasEmittedThinking) {
                this.setStatus("generating", "generating");
                hasEmittedThinking = true;
              }

              // 处理 content
              if (parsed.content) {
                content += parsed.content;
              }

              // 处理 reasoning
              if (parsed.reasoning) {
                reasoning_content += parsed.reasoning;
              }

              this.emit({
                type: "update",
                messageId: uiMessageId,
                delta: {
                  content_delta: parsed.content,
                  reasoning_delta: parsed.reasoning
                },
              });
            } else if (parsed.id && parsed.name && parsed.arguments !== undefined) {
              // tool_call 事件
              toolCalls.push({
                id: parsed.id,
                name: parsed.name,
                arguments: parsed.arguments,
                status: "pending",
              });
            } else if (parsed.error) {
              // error 事件
              throw new Error(parsed.error);
            } else if (parsed.role === "assistant") {
              // complete 事件（完整的消息对象）
              // 已在循环中处理，这里可以忽略
            }
          } catch (e) {
            if (e instanceof SyntaxError) {
              // JSON 解析错误，忽略
            } else {
              throw e;
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // 如果有工具调用，发送更新
    if (toolCalls.length > 0) {
      this.emit({
        type: "update",
        messageId: uiMessageId,
        delta: { tool_calls: toolCalls },
      });
    }

    // 构建完整的 assistant 消息
    const assistantMessage: ChatMessage = {
      id: uiMessageId,
      role: "assistant",
      content,
      reasoning_content: reasoning_content || undefined,
      timestamp: Date.now(),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      metadata: {
        model: this.llmConfig.model,
      },
    };

    return {
      assistantMessage,
      needToolCall: toolCalls.length > 0,
    };
  }

  /**
   * 处理流式响应
   */
  private async processStreamResponse(
    response: Response,
    uiMessageId: string
  ): Promise<{ assistantMessage: ChatMessage; needToolCall: boolean }> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let reasoning_content = "";
    const toolCallsMap = new Map<number, { id?: string; name?: string; arguments?: string | Record<string, unknown> }>();
    let finishReason: string | undefined;
    let hasEmittedThinking = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;

          try {
            const parsed = this.adapter.parseStreamChunk(data, this.llmConfig.model);

            // 处理内容增量
            if (parsed.content_delta) {
              if (!hasEmittedThinking) {
                this.setStatus("generating", "generating");
                hasEmittedThinking = true;
              }
              content += parsed.content_delta;
              this.emit({
                type: "update",
                messageId: uiMessageId,
                delta: { content_delta: parsed.content_delta },
              });
            }

            // 处理推理内容增量（作为普通文本，不做特殊处理）
            if (parsed.reasoning_delta) {
              if (!hasEmittedThinking) {
                this.setStatus("thinking", "thinking");
                hasEmittedThinking = true;
              }
              reasoning_content += parsed.reasoning_delta;
              this.emit({
                type: "update",
                messageId: uiMessageId,
                delta: { reasoning_delta: parsed.reasoning_delta },
              });
            }

            // 处理工具调用增量
            if (parsed.tool_calls) {
              for (const tc of parsed.tool_calls as StreamingToolCallChunk[]) {
                if (tc.index !== undefined) {
                  const existing = toolCallsMap.get(tc.index) || {
                    id: tc.id || generateId(),
                    name: "",
                    arguments: "",
                  };
                  if (tc.id) existing.id = tc.id;
                  if (tc.name) existing.name = tc.name;
                  if (tc.arguments_delta) {
                    const currentArgs = typeof existing.arguments === "string"
                      ? existing.arguments
                      : "";
                    existing.arguments = currentArgs + tc.arguments_delta;
                  }
                  toolCallsMap.set(tc.index, existing);
                }
              }
            }

            // 记录完成原因
            if (parsed.finish_reason) {
              finishReason = parsed.finish_reason;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // 构建工具调用列表
    const toolCalls: ToolCall[] = [];
    for (const [, tc] of toolCallsMap) {
      if (tc.name && tc.id) {
        let args: Record<string, unknown> = {};
        if (typeof tc.arguments === "string") {
          try {
            args = JSON.parse(tc.arguments);
          } catch {
            args = { raw: tc.arguments };
          }
        } else if (tc.arguments) {
          args = tc.arguments;
        }
        toolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: args,
          status: "pending",
        });
      }
    }

    // 如果有工具调用，发送更新
    if (toolCalls.length > 0) {
      this.emit({
        type: "update",
        messageId: uiMessageId,
        delta: { tool_calls: toolCalls },
      });
    }

    // 构建完整的 assistant 消息
    const assistantMessage: ChatMessage = {
      id: uiMessageId,
      role: "assistant",
      content,
      timestamp: Date.now(),
      ...(reasoning_content ? { reasoning_content } : {}),
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
      metadata: {
        model: this.llmConfig.model,
        finishReason,
      },
    };

    return {
      assistantMessage,
      needToolCall: finishReason === "tool_calls" || toolCalls.length > 0,
    };
  }

  /**
   * 执行工具调用
   */
  private async executeToolCalls(toolCalls: ToolCall[]): Promise<void> {
    if (!this.onToolCall) {
      throw new Error("No tool call handler configured");
    }

    const executeOne = async (toolCall: ToolCall): Promise<ChatMessage> => {
      // 发出工具调用开始事件
      this.emit({
        type: "toolcall",
        toolCall: { ...toolCall, status: "running" },
        messageId: toolCall.id,
      });

      try {
        const result = await this.onToolCall!(toolCall.name, toolCall.arguments);
        const resultStr = typeof result === "string"
          ? result
          : JSON.stringify(result, null, 2);
        const truncatedResult = truncateToolResult(resultStr);

        // 发出工具结果事件
        this.emit({
          type: "toolresult",
          toolCallId: toolCall.id,
          result: truncatedResult,
        });

        // 构建工具结果消息
        return {
          id: generateId(),
          role: "tool",
          content: truncatedResult,
          tool_call_id: toolCall.id,
          timestamp: Date.now(),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // 发出工具错误事件
        this.emit({
          type: "toolresult",
          toolCallId: toolCall.id,
          result: null,
          error: errorMessage,
        });

        // 构建错误结果消息
        return {
          id: generateId(),
          role: "tool",
          content: `Error: ${errorMessage}`,
          tool_call_id: toolCall.id,
          timestamp: Date.now(),
        };
      }
    };

    // 根据配置决定并行或串行执行
    let toolResults: ChatMessage[];
    if (this.parallelToolCalls) {
      toolResults = await Promise.all(toolCalls.map(executeOne));
    } else {
      toolResults = [];
      for (const toolCall of toolCalls) {
        toolResults.push(await executeOne(toolCall));
      }
    }

    // 将工具结果添加到消息历史
    for (const result of toolResults) {
      this.messages.push(result);
      this.emit({ type: "add", message: result });
    }
  }

  /**
   * 获取当前消息历史
   */
  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  /**
   * 创建检查点
   */
  async createCheckpoint(reason: CheckpointReason = "auto"): Promise<TaskLoopCheckpoint> {
    const checkpoint: TaskLoopCheckpoint = {
      id: generateId(),
      version: 1,
      chatId: this.chatId,
      timestamp: Date.now(),
      epoch: this.currentEpoch,
      messages: JSON.parse(JSON.stringify(this.messages)),
      status: this.status,
      llmConfigSnapshot: {
        provider: this.llmConfig.provider,
        baseURL: this.llmConfig.baseURL,
        model: this.llmConfig.model,
        temperature: this.llmConfig.temperature,
        maxTokens: this.llmConfig.maxTokens,
        headers: this.llmConfig.headers,
      },
      availableToolNames: this.mcpTools.map((t) => t.name),
      reason,
    };

    await this.checkpointStorage.saveCheckpoint(checkpoint);

    this.emit({
      type: "checkpoint_created",
      checkpointId: checkpoint.id,
      reason,
    });

    return checkpoint;
  }

  /**
   * 从检查点恢复 TaskLoop
   */
  static async resumeFromCheckpoint(opts: ResumeOptions): Promise<TaskLoop> {
    const { checkpoint, apiKey, mcpTools, onToolCall } = opts;

    // 验证检查点版本
    if (checkpoint.version !== 1) {
      throw new Error(`Unsupported checkpoint version: ${checkpoint.version}`);
    }

    // 重建 LLM 配置
    const llmConfig: LLMConfig = {
      ...checkpoint.llmConfigSnapshot,
      apiKey,
    };

    // 创建 TaskLoop 实例
    const taskLoop = new TaskLoop({
      chatId: checkpoint.chatId,
      history: checkpoint.messages,
      llmConfig,
      mcpTools: mcpTools || [],
      onToolCall,
      enableCheckpoints: true,
    });

    // 恢复内部状态
    taskLoop.currentEpoch = checkpoint.epoch;
    taskLoop.status = checkpoint.status === "completed" ? "idle" : checkpoint.status;

    return taskLoop;
  }

  /**
   * 获取最新检查点
   */
  async getLatestCheckpoint(): Promise<TaskLoopCheckpoint | null> {
    return this.checkpointStorage.getLatestCheckpoint(this.chatId);
  }

  /**
   * 清理旧检查点（保留最新 N 个）
   */
  async pruneCheckpoints(keepCount: number = 5): Promise<void> {
    await this.checkpointStorage.pruneCheckpoints(this.chatId, keepCount);
  }
}

export { TaskLoop as default };
