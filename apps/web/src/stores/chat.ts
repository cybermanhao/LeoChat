import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ChatMessage,
  CardStatus,
  TaskLoopEvent,
  ToolCall,
  LLMConfig,
  MCPTool,
  DisplayMessage,
  ContextMessage,
  MessageContentItem,
} from "@ai-chatbox/shared";
import { generateId, LLM_PROVIDERS } from "@ai-chatbox/shared";
import { processToolResultForUICommands } from "../lib/ui-commands";

export type LLMProvider = "deepseek" | "openrouter" | "openai";

// TaskLoop 懒加载，避免构建顺序问题
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let TaskLoopConstructor: any = null;
async function getTaskLoop() {
  if (!TaskLoopConstructor) {
    // @ts-ignore - mcp-core 在运行时可用
    const mod = await import("@ai-chatbox/mcp-core");
    TaskLoopConstructor = mod.TaskLoop;
  }
  return TaskLoopConstructor;
}

interface Conversation {
  id: string;
  title: string;
  displayMessages: DisplayMessage[];  // UI 显示用的消息
  contextMessages: ContextMessage[];  // 用于LLM上下文的消息
  internalMessages?: ChatMessage[];  // 完整的内部历史（用于发送给 LLM）
  createdAt: number;
  updatedAt: number;
}

export type ToolCallStatusType = "pending" | "running" | "success" | "error";

export interface ToolCallState {
  id: string;
  name: string;
  status: ToolCallStatusType;
  arguments?: Record<string, unknown>;
  result?: string;
  error?: string;
  uiCommandExecuted?: boolean;
  startTime: number;
  endTime?: number;
  /** Tool execution duration in ms (from TaskLoop) */
  duration?: number;
}

// TaskLoop 实例接口（最小化，避免导入依赖）
interface TaskLoopInstance {
  abort: () => void;
  start: (content: string) => Promise<void>;
  subscribe: (listener: (event: TaskLoopEvent) => void) => () => void;
}

interface ChatState {
  // 持久化状态
  conversations: Conversation[];
  currentConversationId: string | null;
  providerKeys: Record<LLMProvider, string>;
  currentProvider: LLMProvider;
  currentModel: string;
  enableMarkdown: boolean;

  // 运行时状态（不持久化）
  input: string;
  isGenerating: boolean;
  cardStatus: CardStatus;
  toolCallStates: Record<string, ToolCallState>;
  activeTaskLoop: TaskLoopInstance | null;

  // LLM 配置
  llmConfig: LLMConfig | null;
  mcpTools: MCPTool[];

  // Getters
  displayMessages: DisplayMessage[];
  contextMessages: ContextMessage[];

  // Actions
  setInput: (input: string) => void;
  createConversation: () => string;
  setCurrentConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  sendMessage: (content: string, systemPrompt?: string) => Promise<void>;
  cancelGeneration: () => void;
  executeAction: (actionName: string, attributes: Record<string, string>) => void;

  // 配置
  setLLMConfig: (config: LLMConfig) => void;
  setMCPTools: (tools: MCPTool[]) => void;
  setProviderKey: (provider: LLMProvider, key: string) => void;
  setCurrentProvider: (provider: LLMProvider) => void;
  setCurrentModel: (model: string) => void;
  setEnableMarkdown: (enable: boolean) => void;
  initFromBackendConfig: (config: { availableProviders: string[]; defaultProvider: string }) => void;

  // 内部方法
  _handleTaskLoopEvent: (chatId: string, event: TaskLoopEvent) => void;
  _addMessage: (chatId: string, message: DisplayMessage, contextMessage: ContextMessage) => void;
  _updateMessage: (chatId: string, messageId: string, patch: Partial<DisplayMessage>) => void;
  _patchLastAssistantMessage: (
    chatId: string,
    delta: { content_delta?: string; reasoning_delta?: string; tool_calls?: ToolCall[] }
  ) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // 持久化状态
      conversations: [],
      currentConversationId: null,
      providerKeys: {
        deepseek: "",
        openrouter: "",
        openai: "",
      },
      currentProvider: "deepseek" as LLMProvider,
      currentModel: "deepseek-chat",
      enableMarkdown: true,

      // 运行时状态
      input: "",
      isGenerating: false,
      cardStatus: "stable" as CardStatus,
      toolCallStates: {},
      activeTaskLoop: null,

      // 配置
      llmConfig: null,
      mcpTools: [],

      get displayMessages() {
        const { conversations, currentConversationId } = get();
        const current = conversations.find((c) => c.id === currentConversationId);
        return current?.displayMessages || [];
      },

      get contextMessages() {
        const { conversations, currentConversationId } = get();
        const current = conversations.find((c) => c.id === currentConversationId);
        return current?.contextMessages || [];
      },

      setInput: (input) => set({ input }),

      createConversation: () => {
        const id = generateId();
        const conversation: Conversation = {
          id,
          title: "New Chat",
          displayMessages: [],
          contextMessages: [],
          internalMessages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          conversations: [conversation, ...state.conversations],
          currentConversationId: id,
        }));
        return id;
      },

      setCurrentConversation: (id) => {
        set({
          currentConversationId: id,
          cardStatus: "stable",
          toolCallStates: {},
        });
      },

      deleteConversation: (id) => {
        set((state) => {
          const filtered = state.conversations.filter((c) => c.id !== id);
          let newCurrentId = state.currentConversationId;
          if (state.currentConversationId === id) {
            newCurrentId = filtered[0]?.id || null;
          }
          return {
            conversations: filtered,
            currentConversationId: newCurrentId,
          };
        });
      },

      sendMessage: async (content, systemPrompt) => {
        const { currentConversationId, currentProvider, currentModel, providerKeys, mcpTools } = get();

        // 创建会话（如果需要）
        const convId = currentConversationId || get().createConversation();

        // 获取历史消息（使用contextMessages，保证消息格式正确）
        const conv = get().conversations.find((c) => c.id === convId);
        const history = conv?.contextMessages || [];

        // 构建 LLM 配置
        const providerConfig = LLM_PROVIDERS[currentProvider];
        const llmConfig: LLMConfig = {
          provider: currentProvider,
          model: currentModel,
          apiKey: providerKeys[currentProvider] || "",
          baseURL: providerConfig?.baseURL,
        };

        // 创建 TaskLoop（使用后端代理模式，无需前端 API 密钥）
        const TaskLoopClass = await getTaskLoop();
        const taskLoop = new TaskLoopClass({
          chatId: convId,
          history,
          llmConfig,
          mcpTools,
          parallelToolCalls: true,
          useBackendProxy: true,  // 使用后端代理
          backendURL: "http://localhost:3001",
          systemPrompt,  // 传递系统提示
          onToolCall: async (toolName: string, args: Record<string, unknown>) => {
            // TODO: 通过 MCP 调用工具
            console.log("Tool call:", toolName, args);
            throw new Error(`Tool ${toolName} not implemented`);
          },
        });

        // 订阅事件
        const unsubscribe = taskLoop.subscribe((event: TaskLoopEvent) => {
          get()._handleTaskLoopEvent(convId, event);
        });

        set({
          input: "",
          isGenerating: true,
          cardStatus: "connecting",
          // 不清空 toolCallStates，保留上一轮工具调用的状态
          // toolCallStates 只在 setCurrentConversation 时清空
          activeTaskLoop: taskLoop,
        });

        // 更新会话标题
        if (history.length === 0) {
          set((state) => ({
            conversations: state.conversations.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    title: content.slice(0, 30) + (content.length > 30 ? "..." : ""),
                    updatedAt: Date.now(),
                  }
                : c
            ),
          }));
        }

        try {
          await taskLoop.start(content);
        } catch (error) {
          console.error("TaskLoop error:", error);
        } finally {
          unsubscribe();
          set({
            isGenerating: false,
            activeTaskLoop: null,
          });
        }
      },

      cancelGeneration: () => {
        const { activeTaskLoop } = get();
        if (activeTaskLoop) {
          activeTaskLoop.abort();
        }
      },

      executeAction: (actionName, attributes) => {
        console.log("Executing action:", actionName, attributes);
        // TODO: 实现 action 执行
      },

      setLLMConfig: (config) => set({ llmConfig: config }),

      setMCPTools: (tools) => set({ mcpTools: tools }),

      setProviderKey: (provider, key) => {
        set((state) => ({
          providerKeys: { ...state.providerKeys, [provider]: key },
        }));
        // 同步 API key 到后端
        if (key && key !== "backend") {
          import("../lib/api").then(({ chatApi }) => {
            chatApi.setLLMConfig(provider, key).catch((err) => {
              console.warn("[Chat] Failed to sync API key to backend:", err);
            });
          });
        }
      },

      setCurrentProvider: (provider) => {
        const defaultModels: Record<LLMProvider, string> = {
          deepseek: "deepseek-chat",
          openrouter: "anthropic/claude-3.5-sonnet",
          openai: "gpt-4o",
        };
        set({
          currentProvider: provider,
          currentModel: defaultModels[provider],
        });
      },

      setCurrentModel: (model) => set({ currentModel: model }),

      setEnableMarkdown: (enable) => set({ enableMarkdown: enable }),

      initFromBackendConfig: (config) => {
        const { availableProviders, defaultProvider } = config;
        // 如果后端配置了 providers，则使用后端的默认 provider
        if (availableProviders.length > 0 && defaultProvider) {
          const provider = defaultProvider as LLMProvider;
          const defaultModels: Record<LLMProvider, string> = {
            deepseek: "deepseek-chat",
            openrouter: "anthropic/claude-3.5-sonnet",
            openai: "gpt-4o",
          };
          // 为后端配置的 providers 设置一个标记（使用 "backend" 作为占位符）
          const newProviderKeys: Record<LLMProvider, string> = { ...get().providerKeys };
          availableProviders.forEach((p) => {
            const prov = p as LLMProvider;
            if (!newProviderKeys[prov]) {
              newProviderKeys[prov] = "backend"; // 表示使用后端配置的 key
            }
          });
          set({
            currentProvider: provider,
            currentModel: defaultModels[provider],
            providerKeys: newProviderKeys,
          });
        }
      },

      // 事件处理器
      _handleTaskLoopEvent: (chatId, event) => {
        switch (event.type) {
          case "add":
            // 将消息转换为显示和上下文两种格式
            const displayMessage: DisplayMessage = {
              id: event.message.id,
              role: event.message.role,
              contentItems: event.message.contentItems || [{
                id: `${event.message.id}-text`,
                type: 'text',
                content: event.message.content || '',
                timestamp: event.message.timestamp,
              }],
              timestamp: event.message.timestamp,
              reasoning_content: event.message.reasoning_content,
              metadata: event.message.metadata,
            };

            const contextMessage: ContextMessage = {
              id: event.message.id,
              role: event.message.role,
              content: event.message.content || '',
              tool_calls: event.message.tool_calls,
              tool_call_id: event.message.tool_call_id,
              timestamp: event.message.timestamp,
              metadata: event.message.metadata,
            };

            get()._addMessage(chatId, displayMessage, contextMessage);
            if (event.cardStatus) {
              set({ cardStatus: event.cardStatus });
            }
            break;

          case "update":
            // 不再每个 chunk 输出日志，在 toolcall/done 时输出累积内容
            get()._patchLastAssistantMessage(chatId, event.delta);
            break;

          case "status":
            if (event.cardStatus) {
              set({ cardStatus: event.cardStatus });
            }
            if (event.status === "completed") {
              set({ isGenerating: false, cardStatus: "stable" });
            }
            break;

          case "toolcall": {
            // 使用事件携带的内容，避免查询可能被污染的前端状态
            if (event.contentBeforeToolCall) {
              console.log("[ToolCall] 工具调用前的内容:", event.contentBeforeToolCall.slice(0, 200) + (event.contentBeforeToolCall.length > 200 ? "..." : ""));
            }
            console.log("[ToolCall] 工具调用开始:", event.toolCall.name, "ID:", event.toolCall.id);
            set((state) => ({
              toolCallStates: {
                ...state.toolCallStates,
                [event.toolCall.id]: {
                  id: event.toolCall.id,
                  name: event.toolCall.name,
                  status: "running",
                  arguments: event.toolCall.arguments as Record<string, unknown>,
                  startTime: Date.now(),
                },
              },
            }));
            break;
          }

          case "toolresult": {
            // 解析并执行 UI 命令（如果有的话），但保留原始结果用于显示
            const rawResult = typeof event.result === "string"
              ? event.result
              : JSON.stringify(event.result, null, 2);
            const endTime = Date.now();

            console.log("[ToolResult] 工具调用完成:", event.toolCallId);
            console.log("[ToolResult] 结果:", rawResult.slice(0, 200) + (rawResult.length > 200 ? "..." : ""));
            if (event.error) {
              console.log("[ToolResult] 错误:", event.error);
            }

            // 同步立即更新状态，避免竞态条件导致状态丢失
            set((state) => {
              const prevState = state.toolCallStates[event.toolCallId];
              return {
                toolCallStates: {
                  ...state.toolCallStates,
                  [event.toolCallId]: {
                    ...prevState,
                    status: event.error ? "error" : "success",
                    result: event.error ? undefined : rawResult,
                    error: event.error,
                    endTime,
                    duration: event.duration,
                  },
                },
              };
            });

            // 异步处理 UI 命令（不影响状态显示）
            processToolResultForUICommands(event.result).then(({ uiCommandExecuted }) => {
              if (uiCommandExecuted) {
                set((state) => ({
                  toolCallStates: {
                    ...state.toolCallStates,
                    [event.toolCallId]: {
                      ...state.toolCallStates[event.toolCallId],
                      uiCommandExecuted: true,
                    },
                  },
                }));
              }
            });
            break;
          }

          case "error":
            set({ cardStatus: "stable", isGenerating: false });
            // 可以添加错误提示
            break;

          case "done": {
            console.log("[Done] 对话完成，轮次:", event.epochCount);
            if (event.internalMessages) {
              console.log("[Done] 内部消息历史数量:", event.internalMessages.length);
              console.log("[Done] 消息角色序列:", event.internalMessages.map(m => m.role).join(" -> "));
            }
            // 输出最终合并的消息内容
            const conv = get().conversations.find((c) => c.id === chatId);
            const lastMsg = conv?.displayMessages[conv.displayMessages.length - 1];
            if (lastMsg?.role === "assistant") {
              // 查找最后一条消息中的文本内容
              const textItem = lastMsg.contentItems.find(item => item.type === 'text');
              const content = textItem ? (textItem.content as string) : '';
              console.log("[Done] 合并后的内容:", content?.slice(0, 100) + (content && content.length > 100 ? "..." : ""));

              // 查找工具调用
              const toolCallItems = lastMsg.contentItems.filter(item => item.type === 'tool-call');
              if (toolCallItems.length > 0) {
                console.log("[Done] 工具调用:", toolCallItems.map(item => {
                  const toolCall = item.content as ToolCall;
                  return `${toolCall.name}(${toolCall.id})`;
                }));
              }
            }
            // 保存完整的内部消息历史（用于下次发送给 LLM）
            if (event.internalMessages) {
              set((state) => ({
                cardStatus: "stable",
                isGenerating: false,
                conversations: state.conversations.map((c) =>
                  c.id === chatId
                    ? {
                        ...c,
                        // 将内部消息转换为 contextMessages 格式
                        contextMessages: event.internalMessages.map(msg => ({
                          id: msg.id,
                          role: msg.role,
                          content: msg.content || '',
                          tool_calls: msg.tool_calls,
                          tool_call_id: msg.tool_call_id,
                          timestamp: msg.timestamp,
                          metadata: msg.metadata,
                        }))
                      }
                    : c
                ),
              }));
            } else {
              set({ cardStatus: "stable", isGenerating: false });
            }
            break;
          }

          case "retry":
            // 重试事件：可以用于显示重试提示
            console.log(
              `[Retry] Attempt ${event.attempt}/${event.maxAttempts}, ` +
              `delay: ${event.delayMs}ms, error: ${event.error.message}`
            );
            break;

          case "circuit_state_change":
            // 熔断器状态变化：可以用于显示服务状态
            console.log(
              `[Circuit] State: ${event.previousState} -> ${event.newState}, ` +
              `failures: ${event.failureCount}`
            );
            break;

          case "checkpoint_created":
            // 检查点创建：可以用于显示保存状态
            console.log(
              `[Checkpoint] Created: ${event.checkpointId}, reason: ${event.reason}`
            );
            break;
        }
      },

      _addMessage: (chatId, displayMessage, contextMessage) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  displayMessages: [...c.displayMessages, displayMessage],
                  contextMessages: [...c.contextMessages, contextMessage],
                  updatedAt: Date.now(),
                }
              : c
          ),
        }));
      },

      _updateMessage: (chatId, messageId, patch) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  displayMessages: c.displayMessages.map((m) =>
                    m.id === messageId ? { ...m, ...patch } : m
                  ),
                  contextMessages: c.contextMessages.map((m) =>
                    m.id === messageId ? { ...m, ...patch } : m
                  ),
                }
              : c
          ),
        }));
      },

      _patchLastAssistantMessage: (chatId, delta) => {
        set((state) => {
          const conv = state.conversations.find((c) => c.id === chatId);
          if (!conv) return state;

          // 找到最后一条 assistant 消息（在 displayMessages 中）
          const lastIndex = conv.displayMessages.length - 1;
          const lastMsg = conv.displayMessages[lastIndex];
          if (!lastMsg || lastMsg.role !== "assistant") return state;

          const updatedMsg = { ...lastMsg };

          // 增量更新 contentItems - 追加到最后一个文本项或创建新项
          if (delta.content_delta) {
            const lastItem = updatedMsg.contentItems[updatedMsg.contentItems.length - 1];
            if (lastItem && lastItem.type === 'text' && typeof lastItem.content === 'string') {
              // 最后一项是文本，直接追加
              lastItem.content += delta.content_delta;
              lastItem.timestamp = Date.now();
            } else {
              // 最后一项不是文本（可能是 tool-call），创建新的文本段
              updatedMsg.contentItems.push({
                id: generateId(),
                type: 'text',
                content: delta.content_delta,
                timestamp: Date.now(),
              });
            }
          }

          // 增量更新 reasoning_content（作为普通文本，不做特殊处理）
          if (delta.reasoning_delta) {
            updatedMsg.reasoning_content =
              (updatedMsg.reasoning_content || "") + delta.reasoning_delta;
          }

          // 更新 tool_calls（添加为新的内容项）
          if (delta.tool_calls) {
            // 获取现有的工具调用ID，避免重复
            const existingToolCallIds = new Set(
              updatedMsg.contentItems
                .filter(item => item.type === 'tool-call')
                .map(item => (item.content as ToolCall).id)
            );

            for (const toolCall of delta.tool_calls) {
              if (!existingToolCallIds.has(toolCall.id)) {
                updatedMsg.contentItems.push({
                  id: generateId(),
                  type: 'tool-call',
                  content: toolCall,
                  timestamp: Date.now(),
                  status: 'pending',
                });
              }
            }
          }

          // 同时更新 contextMessages 中对应的消息
          const contextConv = state.conversations.find((c) => c.id === chatId);
          if (contextConv) {
            const lastContextMsg = contextConv.contextMessages[contextConv.contextMessages.length - 1];
            if (lastContextMsg && lastContextMsg.role === 'assistant') {
              const updatedContextMsg = { ...lastContextMsg };

              // 更新 contextMessage 的内容
              if (delta.content_delta) {
                updatedContextMsg.content = (updatedContextMsg.content || "") + delta.content_delta;
              }

              if (delta.tool_calls) {
                const existingIds = new Set((updatedContextMsg.tool_calls || []).map(tc => tc.id));
                const newToolCalls = delta.tool_calls.filter(tc => !existingIds.has(tc.id));
                updatedContextMsg.tool_calls = [...(updatedContextMsg.tool_calls || []), ...newToolCalls];
              }

              return {
                conversations: state.conversations.map((c) =>
                  c.id === chatId
                    ? {
                        ...c,
                        displayMessages: c.displayMessages.map((m, i) =>
                          i === lastIndex ? updatedMsg : m
                        ),
                        contextMessages: c.contextMessages.map((m, i) =>
                          i === c.contextMessages.length - 1 ? updatedContextMsg : m
                        ),
                      }
                    : c
                ),
              };
            }
          }

          return {
            conversations: state.conversations.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    displayMessages: c.displayMessages.map((m, i) =>
                      i === lastIndex ? updatedMsg : m
                    ),
                  }
                : c
            ),
          };
        });
      },
    }),
    {
      name: "ai-chatbox-chat",
      partialize: (state) => ({
        conversations: state.conversations,
        currentConversationId: state.currentConversationId,
        providerKeys: state.providerKeys,
        currentProvider: state.currentProvider,
        currentModel: state.currentModel,
        enableMarkdown: state.enableMarkdown,
      }),
      merge: (persisted, current) => {
        const data = persisted as Record<string, unknown>;
        const conversations = (data.conversations || []) as Conversation[];

        // 清理 conversations 中卡在 running/pending 状态的 tool-call 项
        const cleanedConversations = conversations.map(conv => ({
          ...conv,
          displayMessages: (conv.displayMessages || []).map(msg => ({
            ...msg,
            contentItems: (msg.contentItems || []).map(item => {
              if (item.type === 'tool-call' && (item.status === 'running' || item.status === 'pending')) {
                return { ...item, status: 'error' as const };
              }
              return item;
            }),
          })),
        }));

        return {
          ...current,
          ...data,
          conversations: cleanedConversations,
          // 确保运行时状态不被恢复
          isGenerating: false,
          cardStatus: "stable" as CardStatus,
          toolCallStates: {},
          activeTaskLoop: null,
        };
      },
    }
  )
);
