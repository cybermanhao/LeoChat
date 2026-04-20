import type {
  ChatMessage,
  CardStatus,
  TaskLoopEvent,
  ToolCall,
  LLMConfig,
  DisplayMessage,
  ContextMessage,
} from "@ai-chatbox/shared";
import type { TaskLoop } from "@ai-chatbox/mcp-core";
import { LLM_PROVIDERS, getModelContextLimit, CONTEXT_LEVEL_MAP, normalizeLeoCard } from "@ai-chatbox/shared";
import { processToolResultForUICommands, executeUICommand } from "../lib/ui-commands";
import type { CommandName } from "../lib/ui-commands";
import { LEO_ACTION_EVENT } from "../lib/card-events";
import { handleApiError } from "../lib/api-error";
import { sendOSNotification } from "../lib/os-notification";
import type { GenerationSlice, SliceCreator } from "./chat-types";

// TaskLoop 懒加载，避免构建顺序问题
let TaskLoopConstructor: typeof TaskLoop | null = null;
async function getTaskLoop() {
  if (!TaskLoopConstructor) {
    // @ts-ignore - mcp-core 在运行时可用
    const mod = await import("@ai-chatbox/mcp-core");
    TaskLoopConstructor = mod.TaskLoop;
  }
  return TaskLoopConstructor;
}

const BACKEND_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_BACKEND_URL) ||
  "http://localhost:3001";

export const createGenerationSlice: SliceCreator<GenerationSlice> = (set, get) => ({
  isGenerating: false,
  cardStatus: "stable" as CardStatus,
  toolCallStates: {},
  activeTaskLoop: null,

  sendMessage: async (content, systemPrompt) => {
    if (get().isGenerating) {
      console.warn("[chat-generation] Already generating, ignoring sendMessage");
      return;
    }

    const {
      currentConversationId,
      currentProvider,
      currentModel,
      providerKeys,
      mcpTools,
      maxEpochs,
      contextLevel,
      temperature,
    } = get();

    const convId = currentConversationId || get().createConversation();

    const conv = get().conversations.find((c) => c.id === convId);
    const history = conv?.contextMessages || [];
    const contextSnapshot = [...history];
    const displaySnapshot = [...(conv?.displayMessages || [])];
    const historyWithoutSystem = history.filter((m) => m.role !== "system");

    const providerConfig = LLM_PROVIDERS[currentProvider];
    const llmConfig: LLMConfig = {
      provider: currentProvider,
      model: currentModel,
      apiKey: providerKeys[currentProvider] || "",
      baseURL: providerConfig?.baseURL,
      temperature,
    };

    const contextLength = CONTEXT_LEVEL_MAP[contextLevel] ?? 30;
    const modelContextLimit = getModelContextLimit(currentModel);

    const TaskLoopClass = await getTaskLoop();
    const taskLoop = new TaskLoopClass({
      chatId: convId,
      history: historyWithoutSystem,
      llmConfig,
      mcpTools,
      maxEpochs,
      parallelToolCalls: true,
      useBackendProxy: true,
      backendURL: BACKEND_URL,
      systemPrompt,
      contextLength: contextLength > 0 ? contextLength : undefined,
      modelContextLimit: modelContextLimit > 0 ? modelContextLimit : undefined,
      onToolCall: async (toolName: string, _args: Record<string, unknown>) => {
        throw new Error(`Non-MCP tool call not supported in web context: ${toolName}`);
      },
    });

    const unsubscribe = taskLoop.subscribe((event: TaskLoopEvent) => {
      if (get().activeTaskLoop !== taskLoop) return;
      get()._handleTaskLoopEvent(convId, event);
    });

    set({
      input: "",
      isGenerating: true,
      cardStatus: "connecting",
      activeTaskLoop: taskLoop,
    });

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
      // abort/error 时回滚到本次生成前的快照，避免不完整消息污染下次上下文
      set((state) => ({
        conversations: state.conversations.map((c) => {
          if (c.id !== convId) return c;
          return {
            ...c,
            contextMessages: contextSnapshot,
            displayMessages: displaySnapshot,
          };
        }),
        toolCallStates: {},
      }));
    } finally {
      unsubscribe();
      if (get().activeTaskLoop === taskLoop) {
        set({
          isGenerating: false,
          activeTaskLoop: null,
        });
      }
    }
  },

  cancelGeneration: () => {
    const { activeTaskLoop } = get();
    if (activeTaskLoop) {
      activeTaskLoop.abort();
    }
  },

  executeAction: (actionName, attributes) => {
    // Strip display-only attribute; remaining keys become the payload
    const { label: _label, ...payload } = attributes;

    // Coerce string values: "true"/"false" → boolean, numeric strings → number
    const coercedPayload: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(payload)) {
      if (v === "true") coercedPayload[k] = true;
      else if (v === "false") coercedPayload[k] = false;
      else if (v !== "" && !isNaN(Number(v))) coercedPayload[k] = Number(v);
      else coercedPayload[k] = v;
    }

    // Known UI command → delegate to executeUICommand
    const KNOWN_COMMANDS: ReadonlySet<string> = new Set<CommandName>([
      "update_theme", "show_notification", "show_confirm",
      "open_panel", "close_panel", "copy_to_clipboard",
      "open_url", "scroll_to_message", "set_input", "send_message",
    ]);

    if (KNOWN_COMMANDS.has(actionName)) {
      Promise.resolve(
        executeUICommand({
          __ui_command__: true,
          command: actionName as CommandName,
          payload: coercedPayload as never,
        })
      ).catch((e) => console.warn("[executeAction]", e));
      return;
    }

    // Unknown command → dispatch custom event for external handlers
    window.dispatchEvent(
      new CustomEvent(LEO_ACTION_EVENT, {
        detail: { name: actionName, attributes: coercedPayload },
      })
    );
  },

  _handleTaskLoopEvent: (chatId, event) => {
    switch (event.type) {
      case "add": {
        const displayMessage: DisplayMessage = {
          id: event.message.id,
          role: event.message.role,
          contentItems: event.message.contentItems || [
            {
              id: `${event.message.id}-text`,
              type: "text",
              content: event.message.content || "",
              timestamp: event.message.timestamp,
            },
          ],
          timestamp: event.message.timestamp,
          reasoning_content: event.message.reasoning_content,
          metadata: event.message.metadata,
        };

        const contextMessage: ContextMessage = {
          id: event.message.id,
          role: event.message.role,
          content: event.message.content || "",
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
      }

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

      case "toolcall": {
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
        const rawResult =
          typeof event.result === "string" ? event.result : JSON.stringify(event.result, null, 2);
        const endTime = Date.now();
        const finalStatus = event.error ? "error" : "success";
        const contentItemStatus = event.error ? "error" : "completed";

        set((state) => {
          const prevState = state.toolCallStates[event.toolCallId];
          return {
            toolCallStates: {
              ...state.toolCallStates,
              [event.toolCallId]: {
                ...prevState,
                status: finalStatus,
                result: event.error ? undefined : rawResult,
                error: event.error,
                endTime,
                duration: event.duration,
              },
            },
            conversations: state.conversations.map((c) =>
              c.id !== chatId
                ? c
                : {
                    ...c,
                    displayMessages: c.displayMessages.map((msg) => ({
                      ...msg,
                      contentItems: msg.contentItems.map((item) =>
                        item.type === "tool-call" && (item.content as ToolCall).id === event.toolCallId
                          ? { ...item, status: contentItemStatus }
                          : item
                      ),
                    })),
                  }
            ),
          };
        });

        // 异步处理 UI 命令
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
        }).catch((e) => console.warn("[UICommand]", e));

        // 检测结构化卡片 payload 并追加 leo-card 内容项
        attachLeoCardIfPresent(set, chatId, event.toolCallId, event.result);
        break;
      }

      case "error":
        set({ cardStatus: "stable", isGenerating: false });
        handleApiError(event.error.message, get().currentProvider);
        break;

      case "done": {
        if (event.internalMessages) {
          set((state) => ({
            cardStatus: "stable",
            isGenerating: false,
            conversations: state.conversations.map((c) =>
              c.id === chatId
                ? {
                    ...c,
                    contextMessages: (event.internalMessages || []).map((msg: ChatMessage) => ({
                      id: msg.id,
                      role: msg.role,
                      content: msg.content || "",
                      tool_calls: msg.tool_calls,
                      tool_call_id: msg.tool_call_id,
                      timestamp: msg.timestamp,
                      metadata: msg.metadata,
                    })),
                  }
                : c
            ),
          }));
        } else {
          set({ cardStatus: "stable", isGenerating: false });
        }
        sendOSNotification("LeoChat", "AI 回复完成");
        break;
      }

      case "retry":
        console.log(
          `[Retry] Attempt ${event.attempt}/${event.maxAttempts}, ` +
            `delay: ${event.delayMs}ms, error: ${event.error.message}`
        );
        break;

      case "circuit_state_change":
        console.log(
          `[Circuit] State: ${event.previousState} -> ${event.newState}, ` +
            `failures: ${event.failureCount}`
        );
        break;

      case "checkpoint_created":
        console.log(`[Checkpoint] Created: ${event.checkpointId}, reason: ${event.reason}`);
        break;
    }
  },
});

/**
 * 从工具结果中检测并追加 LeoCard 到最后一条 assistant 消息。
 * 抽出来避免 _handleTaskLoopEvent 过长。
 */
function attachLeoCardIfPresent(
  set: Parameters<SliceCreator<GenerationSlice>>[0],
  chatId: string,
  toolCallId: string,
  result: unknown
): void {
  let cardSource: unknown = result;

  if (typeof cardSource === "string") {
    try {
      cardSource = JSON.parse(cardSource);
    } catch {
      /* 非 JSON，忽略 */
    }
  }

  // 尝试从 MCP content[].text 格式中提取
  if (typeof cardSource === "object" && cardSource !== null && "content" in cardSource) {
    const mcpContent = (cardSource as { content: unknown[] }).content;
    if (Array.isArray(mcpContent)) {
      for (const item of mcpContent) {
        if (typeof item === "object" && item !== null && "type" in item && "text" in item) {
          const textItem = item as { type: string; text: string };
          if (textItem.type === "text") {
            const innerCard = normalizeLeoCard(textItem.text);
            if (innerCard) {
              cardSource = innerCard;
              break;
            }
          }
        }
      }
    }
  }

  const card = normalizeLeoCard(cardSource);
  if (!card) return;

  const cardItemId = `${toolCallId}-card-${card.id}`;
  set((state) => ({
    conversations: state.conversations.map((c) => {
      if (c.id !== chatId) return c;
      const lastAssistantIdx = c.displayMessages.reduce(
        (acc, m, i) => (m.role === "assistant" ? i : acc),
        -1
      );
      if (lastAssistantIdx === -1) return c;
      return {
        ...c,
        displayMessages: c.displayMessages.map((msg, i) => {
          if (i !== lastAssistantIdx) return msg;
          if (msg.contentItems.some((item) => item.id === cardItemId)) return msg;
          return {
            ...msg,
            contentItems: [
              ...msg.contentItems,
              {
                id: cardItemId,
                type: "leo-card" as const,
                content: card,
                timestamp: Date.now(),
              },
            ],
          };
        }),
      };
    }),
  }));
}
