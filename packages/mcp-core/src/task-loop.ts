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
  MessageContentItem,
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

  // 上下文与容错
  private contextLength: number;
  private maxJsonParseRetry: number;

  // Token 消费统计
  private totalInputTokens: number = 0;
  private totalOutputTokens: number = 0;

  // 工具调用拦截钩子
  private onToolCallHooks: Array<{
    id: string;
    handler: (toolCall: ToolCall) => ToolCall;
  }> = [];
  private onToolCalledHooks: Array<{
    id: string;
    handler: (toolCallId: string, result: unknown) => unknown;
  }> = [];

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

    // 上下文与容错
    this.contextLength = opts.contextLength ?? 0;
    this.maxJsonParseRetry = opts.maxJsonParseRetry ?? 3;

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
   * 注册工具调用前拦截钩子（可修改参数）
   */
  registerOnToolCall(handler: (toolCall: ToolCall) => ToolCall): () => void {
    const id = generateId();
    this.onToolCallHooks.push({ id, handler });
    return () => {
      this.onToolCallHooks = this.onToolCallHooks.filter(h => h.id !== id);
    };
  }

  /**
   * 注册工具调用后拦截钩子（可修改结果）
   */
  registerOnToolCalled(handler: (toolCallId: string, result: unknown) => unknown): () => void {
    const id = generateId();
    this.onToolCalledHooks.push({ id, handler });
    return () => {
      this.onToolCalledHooks = this.onToolCalledHooks.filter(h => h.id !== id);
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

      // 2. 多轮循环 - 使用同一个 UI 消息 ID，所有内容合并显示
      let epochCount = 0;
      const uiMessageId = `assistant-${Date.now()}`;
      let uiMessageCreated = false;

      // 追踪合并后的 UI 消息内容
      let mergedContent = "";
      let mergedToolCalls: ToolCall[] = [];

      // JSON 解析错误重试计数
      let jsonParseErrorCount = 0;

      for (let epoch = 0; epoch < this.maxEpochs; epoch++) {
        this.currentEpoch = epoch;
        epochCount = epoch + 1;

        // 检查是否已中止
        if (this.abortController?.signal.aborted) {
          this.setStatus("aborted", "stable");
          return;
        }

        // 2.1 第一轮创建 UI 占位消息，后续轮次复用
        if (!uiMessageCreated) {
          const uiAssistantMessage: ChatMessage = {
            id: uiMessageId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
          };
          this.emit({ type: "add", message: uiAssistantMessage, cardStatus: "connecting" });
          uiMessageCreated = true;
        } else {
          // 后续轮次，发送状态更新
          this.setStatus("connecting", "connecting");
        }

        // 2.2 调用 LLM（传入已累积的工具调用，用于 UI 合并显示）
        this.setStatus("connecting", "connecting");

        const { assistantMessage, needToolCall, finalMessages } = await this.callLLM(uiMessageId, mergedToolCalls);

        // 如果后端返回了 finalMessages，表示后端已完成完整的工具调用循环
        // 直接使用后端的消息历史，跳过前端循环
        if (finalMessages) {
          // 使用后端的完整消息历史
          this.messages = finalMessages;

          // 完成
          this.setStatus("completed", "stable");
          this.emit({
            type: "done",
            epochCount: 1, // 后端处理所有轮次
            internalMessages: finalMessages,
          });
          return;
        }

        // 2.3 添加完整的 assistant 消息到内部历史
        this.messages.push(assistantMessage);

        // 2.4 合并内容到 UI 消息
        if (assistantMessage.content) {
          // 如果已有内容，添加分隔
          if (mergedContent) {
            mergedContent += "\n\n";
          }
          mergedContent += assistantMessage.content;
        }

        // 合并工具调用
        if (assistantMessage.tool_calls?.length) {
          mergedToolCalls = [...mergedToolCalls, ...assistantMessage.tool_calls];
        }

        // 2.5 检查工具调用
        if (needToolCall && assistantMessage.tool_calls?.length) {
          // JSON 解析错误检测 - 检查是否有工具参数包含 raw 字段（解析失败的标志）
          const parseErrorTools = assistantMessage.tool_calls.filter(
            tc => tc.arguments && typeof tc.arguments === "object" && "raw" in tc.arguments && Object.keys(tc.arguments).length === 1
          );
          if (parseErrorTools.length > 0) {
            jsonParseErrorCount++;
            if (jsonParseErrorCount >= this.maxJsonParseRetry) {
              // 超过最大重试次数，终止
              const errorMsg: ChatMessage = {
                id: generateId(),
                role: "assistant",
                content: `工具参数 JSON 解析错误，已重试 ${this.maxJsonParseRetry} 次仍然失败，无法继续调用工具。`,
                timestamp: Date.now(),
              };
              this.messages.push(errorMsg);
              this.emit({ type: "update", messageId: uiMessageId, delta: { content_delta: errorMsg.content } });
              break;
            }
            // 向 LLM 发送纠错消息，要求重新生成合法 JSON
            const toolNames = parseErrorTools.map(tc => tc.name).join(", ");
            const retryMsg: ChatMessage = {
              id: generateId(),
              role: "user",
              content: `你调用 ${toolNames} 提供的参数解析 JSON 错误，请重新生成合法 JSON 作为参数。(累计错误次数: ${jsonParseErrorCount})`,
              timestamp: Date.now(),
            };
            this.messages.push(retryMsg);
            continue;
          }

          this.setStatus("tool_calling", "tool_calling");

          // 检查工具是否已由后端执行
          const allToolsCompleted = assistantMessage.tool_calls.every(
            tc => tc.status === "completed" || tc.status === "error"
          );

          if (allToolsCompleted) {
            // 后端已执行工具，直接添加工具结果消息到历史
            for (const toolCall of assistantMessage.tool_calls) {
              const resultContent = toolCall.result
                ? (typeof toolCall.result === "string"
                    ? toolCall.result
                    : JSON.stringify(toolCall.result))
                : "";
              const toolResultMessage: ChatMessage = {
                id: generateId(),
                role: "tool",
                content: truncateToolResult(resultContent),
                tool_call_id: toolCall.id,
                timestamp: Date.now(),
              };
              this.messages.push(toolResultMessage);
              // 发射 add 事件，将 tool result 消息保存到 conversation 中
              // UI 中 ChatMessage 组件会过滤掉 role="tool" 的消息，不会显示
              this.emit({ type: "add", message: toolResultMessage });
            }
          } else {
            // 需要前端执行工具调用
            await this.executeToolCalls(assistantMessage.tool_calls);
          }

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
        totalTokens: (this.totalInputTokens > 0 || this.totalOutputTokens > 0)
          ? { input: this.totalInputTokens, output: this.totalOutputTokens }
          : undefined,
        // 发送完整的内部消息历史，用于前端保存以便下次正确发送给 LLM
        internalMessages: [...this.messages],
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
   * @param uiMessageId - UI 消息 ID
   * @param previousToolCalls - 之前轮次已累积的工具调用（用于 UI 合并显示）
   */
  private async callLLM(uiMessageId: string, previousToolCalls: ToolCall[] = []): Promise<{
    assistantMessage: ChatMessage;
    needToolCall: boolean;
    finalMessages?: ChatMessage[];
  }> {
    return withRetry(
      (signal) => this.executeLLMRequest(uiMessageId, signal, previousToolCalls),
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
   * 获取上下文截断后的消息列表
   */
  private getContextMessages(): ChatMessage[] {
    if (!this.contextLength || this.contextLength <= 0) {
      return this.messages;
    }
    const systemMessages = this.messages.filter(m => m.role === "system");
    const nonSystemMessages = this.messages.filter(m => m.role !== "system");
    const truncated = nonSystemMessages.slice(-this.contextLength);
    return [...systemMessages, ...truncated];
  }

  /**
   * 实际执行 LLM 请求
   * @param previousToolCalls - 之前轮次已累积的工具调用
   */
  private async executeLLMRequest(
    uiMessageId: string,
    signal: AbortSignal,
    previousToolCalls: ToolCall[] = []
  ): Promise<{ assistantMessage: ChatMessage; needToolCall: boolean; finalMessages?: ChatMessage[] }> {
    // 使用后端代理模式
    if (this.useBackendProxy) {
      return this.executeBackendProxyRequest(uiMessageId, signal, previousToolCalls);
    }

    // 直连模式
    const baseURL = this.adapter.getBaseURL(this.llmConfig);
    const headers = this.adapter.buildHeaders(this.llmConfig);
    const tools = this.mcpTools.length > 0
      ? this.adapter.convertTools(this.mcpTools, this.llmConfig.model)
      : undefined;

    const messagesToSend = this.getContextMessages();
    const body = this.adapter.buildRequestBody(
      messagesToSend,
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
   * @param previousToolCalls - 之前轮次已累积的工具调用（用于 UI 合并显示）
   */
  private async executeBackendProxyRequest(
    uiMessageId: string,
    signal: AbortSignal,
    previousToolCalls: ToolCall[] = []
  ): Promise<{ assistantMessage: ChatMessage; needToolCall: boolean; finalMessages?: ChatMessage[] }> {
    const messagesToSend = this.getContextMessages();
    const response = await fetch(`${this.backendURL}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: messagesToSend,
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
    return this.processBackendSSEResponse(response, uiMessageId, previousToolCalls);
  }

  /**
   * 处理后端 SSE 响应格式
   * 后端使用的事件: chunk, tool_call, tool_result, complete, final, error
   * 后端现在处理完整的工具调用循环，前端只需要一次请求
   * @param previousToolCalls - 之前轮次已累积的工具调用（用于 UI 合并显示）
   */
  private async processBackendSSEResponse(
    response: Response,
    uiMessageId: string,
    previousToolCalls: ToolCall[] = []
  ): Promise<{ assistantMessage: ChatMessage; needToolCall: boolean; finalMessages?: ChatMessage[] }> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let reasoning_content = "";
    let currentTextContent = "";  // 当前文本段（用于增量构建 contentItems）
    const contentItems: MessageContentItem[] = [];  // 增量构建，保持时序
    const toolCalls: ToolCall[] = [];
    let hasEmittedThinking = false;
    let finalMessages: ChatMessage[] | undefined;

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

            // 处理 final 事件 - 后端完成完整的工具调用循环后发送
            if (parsed.internalMessages !== undefined) {
              // final 事件，包含完整的内部消息历史
              finalMessages = parsed.internalMessages;
              continue;
            }

            // 通过 index 字段区分 chunk 和 complete 事件
            // chunk 事件有 index 字段，complete 事件没有
            if ((parsed.content !== undefined || parsed.reasoning !== undefined) && parsed.index !== undefined) {
              // chunk 事件
              if (!hasEmittedThinking) {
                this.setStatus("generating", "generating");
                hasEmittedThinking = true;
              }

              // 处理 content - 累积到 content（LLM上下文）和 currentTextContent（当前文本段）
              if (parsed.content) {
                content += parsed.content;
                currentTextContent += parsed.content;
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
                  reasoning_delta: parsed.reasoning,
                },
              });
            } else if (parsed.id && parsed.name && parsed.arguments !== undefined && parsed.result === undefined) {
              // tool_call 事件（有 id, name, arguments 但没有 result）

              // 检查是否已存在相同ID的工具调用，避免重复添加
              const existingToolCall = toolCalls.find(tc => tc.id === parsed.id);
              if (!existingToolCall) {
                // Flush 当前文本段到 contentItems（保持时序）
                if (currentTextContent) {
                  contentItems.push({
                    id: generateId(),
                    type: 'text',
                    content: currentTextContent,
                    timestamp: Date.now(),
                  });
                  currentTextContent = "";
                }

                const toolCall: ToolCall = {
                  id: parsed.id,
                  name: parsed.name,
                  arguments: parsed.arguments,
                  status: "pending", // 初始状态为 pending
                };
                toolCalls.push(toolCall);

                // 添加 tool-call 到 contentItems
                contentItems.push({
                  id: generateId(),
                  type: 'tool-call',
                  content: toolCall,
                  timestamp: Date.now(),
                  status: 'pending',
                });

                // 立即更新消息的 tool_calls，合并之前轮次的工具调用
                this.emit({
                  type: "update",
                  messageId: uiMessageId,
                  delta: { tool_calls: [...previousToolCalls, ...toolCalls] },
                });

                // 发送工具调用事件（用于更新 toolCallStates）
                this.emit({
                  type: "toolcall",
                  messageId: uiMessageId,
                  toolCall,
                  contentBeforeToolCall: content,  // 携带工具调用前的累积内容
                });
              }
            } else if (parsed.id && parsed.result !== undefined) {
              // tool_result 事件
              // 更新工具调用状态
              const toolCall = toolCalls.find((tc) => tc.id === parsed.id);
              if (toolCall) {
                toolCall.status = "completed";
                toolCall.result = parsed.result;

                this.emit({
                  type: "toolresult",
                  toolCallId: parsed.id,
                  result: parsed.result,
                });
              }
            } else if (parsed.id && parsed.error !== undefined) {
              // tool_error 事件
              // 更新工具调用状态
              const toolCall = toolCalls.find((tc) => tc.id === parsed.id);
              if (toolCall) {
                toolCall.status = "error";
                toolCall.result = { error: parsed.error };

                // 发送 toolresult 事件带上 error，让前端更新状态
                this.emit({
                  type: "toolresult",
                  toolCallId: parsed.id,
                  result: null,
                  error: parsed.error,
                });
              }
            } else if (parsed.error) {
              // error 事件
              throw new Error(parsed.error);
            } else if (parsed.role === "assistant") {
              // complete 事件（完整的消息对象）
              // 使用 complete 事件的 content（如果有的话）
              if (parsed.content && !content) {
                content = parsed.content;
              }
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

    // 如果有工具调用，发送更新（合并之前轮次的工具调用用于 UI 显示）
    if (toolCalls.length > 0) {
      this.emit({
        type: "update",
        messageId: uiMessageId,
        delta: { tool_calls: [...previousToolCalls, ...toolCalls] },
      });
    }

    // Flush 剩余文本到 contentItems
    if (currentTextContent) {
      contentItems.push({
        id: generateId(),
        type: 'text',
        content: currentTextContent,
        timestamp: Date.now(),
      });
    }

    const assistantMessage: ChatMessage = {
      id: generateId(), // 使用唯一 ID，避免内部消息历史中的 ID 冲突
      role: "assistant",
      content: content || '',  // 保持 content 字段用于 LLM 上下文
      contentItems,  // 用于 UI 显示
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
      reasoning_content: reasoning_content || undefined,
      timestamp: Date.now(),
      metadata: {
        model: this.llmConfig.model,
      },
    };

    // 如果收到 final 事件，表示后端已完成完整的工具调用循环
    // 前端不需要再循环，直接返回 needToolCall: false
    if (finalMessages) {
      return {
        assistantMessage,
        needToolCall: false,  // 后端已完成所有工具调用，无需前端继续循环
        finalMessages,  // 返回完整的消息历史
      };
    }

    // 没有 final 事件，可能是旧版后端或无工具调用
    return {
      assistantMessage,
      needToolCall: false,  // 后端代理模式下默认不需要前端循环
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
    let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;

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

            // 提取 usage（通常在最后一个 chunk 中）
            if (parsed.usage) {
              usage = parsed.usage;
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
        tokens: usage ? {
          input: usage.prompt_tokens || 0,
          output: usage.completion_tokens || 0,
        } : undefined,
      },
    };

    // 累积 token 消费
    if (usage) {
      this.totalInputTokens += usage.prompt_tokens || 0;
      this.totalOutputTokens += usage.completion_tokens || 0;
    }

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
      // 应用 pre-call 钩子（可修改参数）
      let modifiedToolCall = { ...toolCall };
      for (const hook of this.onToolCallHooks) {
        modifiedToolCall = hook.handler(modifiedToolCall);
      }

      // 发出工具调用开始事件
      this.emit({
        type: "toolcall",
        toolCall: { ...modifiedToolCall, status: "running" },
        messageId: modifiedToolCall.id,
      });

      try {
        const startTime = Date.now();
        let result = await this.onToolCall!(modifiedToolCall.name, modifiedToolCall.arguments);
        const duration = Date.now() - startTime;

        // 应用 post-call 钩子（可修改结果）
        for (const hook of this.onToolCalledHooks) {
          result = hook.handler(modifiedToolCall.id, result);
        }

        const resultStr = typeof result === "string"
          ? result
          : JSON.stringify(result, null, 2);
        const truncatedResult = truncateToolResult(resultStr);

        // 发出工具结果事件（包含耗时）
        this.emit({
          type: "toolresult",
          toolCallId: modifiedToolCall.id,
          result: truncatedResult,
          duration,
        });

        // 构建工具结果消息
        return {
          id: generateId(),
          role: "tool",
          content: truncatedResult,
          tool_call_id: modifiedToolCall.id,
          timestamp: Date.now(),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        // 发出工具错误事件
        this.emit({
          type: "toolresult",
          toolCallId: modifiedToolCall.id,
          result: null,
          error: errorMessage,
        });

        // 构建错误结果消息
        return {
          id: generateId(),
          role: "tool",
          content: `Error: ${errorMessage}`,
          tool_call_id: modifiedToolCall.id,
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

    // 将工具结果添加到内部消息历史并发射 add 事件
    // UI 中 ChatMessage 组件会过滤掉 role="tool" 的消息，不会显示
    // 但 tool result 消息必须保存到 conversation 中，以便下次对话时发送给 LLM
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
