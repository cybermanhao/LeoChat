import type { ToolCall } from "@ai-chatbox/shared";
import { generateId } from "@ai-chatbox/shared";
import type { Conversation, ConversationsSlice, SliceCreator } from "./chat-types";

export const createConversationsSlice: SliceCreator<ConversationsSlice> = (set, _get) => ({
  conversations: [],
  currentConversationId: null,
  input: "",

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

  clearAllConversations: () => set({ conversations: [], currentConversationId: null }),

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

      const lastIndex = conv.displayMessages.length - 1;
      const lastMsg = conv.displayMessages[lastIndex];
      if (!lastMsg || lastMsg.role !== "assistant") return state;

      const updatedMsg = { ...lastMsg };

      // 增量更新 contentItems
      if (delta.content_delta) {
        const lastItem = updatedMsg.contentItems[updatedMsg.contentItems.length - 1];
        if (lastItem && lastItem.type === "text" && typeof lastItem.content === "string") {
          lastItem.content += delta.content_delta;
          lastItem.timestamp = Date.now();
        } else {
          updatedMsg.contentItems.push({
            id: generateId(),
            type: "text",
            content: delta.content_delta,
            timestamp: Date.now(),
          });
        }
      }

      if (delta.reasoning_delta) {
        updatedMsg.reasoning_content =
          (updatedMsg.reasoning_content || "") + delta.reasoning_delta;
      }

      if (delta.tool_calls) {
        const existingToolCallIds = new Set(
          updatedMsg.contentItems
            .filter((item) => item.type === "tool-call")
            .map((item) => (item.content as ToolCall).id)
        );

        for (const toolCall of delta.tool_calls) {
          if (!existingToolCallIds.has(toolCall.id)) {
            updatedMsg.contentItems.push({
              id: generateId(),
              type: "tool-call",
              content: toolCall,
              timestamp: Date.now(),
              status: "pending",
            });
          }
        }
      }

      // 同时更新 contextMessages
      const lastContextMsg = conv.contextMessages[conv.contextMessages.length - 1];
      if (lastContextMsg && lastContextMsg.role === "assistant") {
        const updatedContextMsg = { ...lastContextMsg };

        if (delta.content_delta) {
          updatedContextMsg.content = (updatedContextMsg.content || "") + delta.content_delta;
        }

        if (delta.tool_calls) {
          const existingIds = new Set((updatedContextMsg.tool_calls || []).map((tc) => tc.id));
          const newToolCalls = delta.tool_calls.filter((tc) => !existingIds.has(tc.id));
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
});
