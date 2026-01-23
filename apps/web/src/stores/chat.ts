import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ChatMessage,
  CardStatus,
  TaskLoopEvent,
  ToolCall,
  LLMConfig,
  MCPTool,
} from "@ai-chatbox/shared";
import { generateId, LLM_PROVIDERS } from "@ai-chatbox/shared";

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
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ToolCallState {
  id: string;
  name: string;
  status: "calling" | "success" | "error";
  result?: string;
  error?: string;
  timestamp: number;
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
  messages: ChatMessage[];

  // Actions
  setInput: (input: string) => void;
  createConversation: () => string;
  setCurrentConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  sendMessage: (content: string) => Promise<void>;
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
  _addMessage: (chatId: string, message: ChatMessage) => void;
  _updateMessage: (chatId: string, messageId: string, patch: Partial<ChatMessage>) => void;
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

      get messages() {
        const { conversations, currentConversationId } = get();
        const current = conversations.find((c) => c.id === currentConversationId);
        return current?.messages || [];
      },

      setInput: (input) => set({ input }),

      createConversation: () => {
        const id = generateId();
        const conversation: Conversation = {
          id,
          title: "New Chat",
          messages: [],
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

      sendMessage: async (content) => {
        const { currentConversationId, currentProvider, currentModel, providerKeys, mcpTools } = get();

        // 创建会话（如果需要）
        const convId = currentConversationId || get().createConversation();

        // 获取历史消息
        const history = get().conversations.find((c) => c.id === convId)?.messages || [];

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
          toolCallStates: {},
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

      setProviderKey: (provider, key) =>
        set((state) => ({
          providerKeys: { ...state.providerKeys, [provider]: key },
        })),

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
            get()._addMessage(chatId, event.message);
            if (event.cardStatus) {
              set({ cardStatus: event.cardStatus });
            }
            break;

          case "update":
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

          case "toolcall":
            set((state) => ({
              toolCallStates: {
                ...state.toolCallStates,
                [event.toolCall.id]: {
                  id: event.toolCall.id,
                  name: event.toolCall.name,
                  status: "calling",
                  timestamp: Date.now(),
                },
              },
            }));
            break;

          case "toolresult":
            set((state) => ({
              toolCallStates: {
                ...state.toolCallStates,
                [event.toolCallId]: {
                  ...state.toolCallStates[event.toolCallId],
                  status: event.error ? "error" : "success",
                  result: event.error ? undefined : String(event.result),
                  error: event.error,
                },
              },
            }));
            break;

          case "error":
            set({ cardStatus: "stable", isGenerating: false });
            // 可以添加错误提示
            break;

          case "done":
            set({ cardStatus: "stable", isGenerating: false });
            break;

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

      _addMessage: (chatId, message) => {
        set((state) => ({
          conversations: state.conversations.map((c) =>
            c.id === chatId
              ? {
                  ...c,
                  messages: [...c.messages, message],
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
                  messages: c.messages.map((m) =>
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

          // 找到最后一条 assistant 消息
          const lastIndex = conv.messages.length - 1;
          const lastMsg = conv.messages[lastIndex];
          if (!lastMsg || lastMsg.role !== "assistant") return state;

          const updatedMsg = { ...lastMsg };

          // 增量更新 content
          if (delta.content_delta) {
            updatedMsg.content = (updatedMsg.content || "") + delta.content_delta;
          }

          // 增量更新 reasoning_content（作为普通文本，不做特殊处理）
          if (delta.reasoning_delta) {
            updatedMsg.reasoning_content =
              (updatedMsg.reasoning_content || "") + delta.reasoning_delta;
          }

          // 更新 tool_calls
          if (delta.tool_calls) {
            updatedMsg.tool_calls = delta.tool_calls;
          }

          return {
            conversations: state.conversations.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    messages: c.messages.map((m, i) =>
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
    }
  )
);
