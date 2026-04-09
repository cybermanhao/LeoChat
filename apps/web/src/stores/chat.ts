import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CardStatus } from "@ai-chatbox/shared";
import { getChatStorageAdapter } from "../lib/chat-persistence";
import type { ChatState, Conversation } from "./chat-types";
import { createSettingsSlice } from "./chat-settings";
import { createConversationsSlice } from "./chat-conversations";
import { createGenerationSlice } from "./chat-generation";

// Re-export public types for consumers
export type { LLMProvider, ChatState, Conversation, ToolCallStatusType, ToolCallState } from "./chat-types";

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      ...createSettingsSlice(set, get),
      ...createConversationsSlice(set, get),
      ...createGenerationSlice(set, get),
    }),
    {
      name: "ai-chatbox-chat",
      storage: createJSONStorage(() => getChatStorageAdapter()),
      partialize: (state) => ({
        conversations: state.conversations,
        currentConversationId: state.currentConversationId,
        providerKeys: state.providerKeys,
        currentProvider: state.currentProvider,
        currentModel: state.currentModel,
        enableMarkdown: state.enableMarkdown,
        maxEpochs: state.maxEpochs,
        contextLevel: state.contextLevel,
        uiMode: state.uiMode,
        temperature: state.temperature,
      }),
      merge: (persisted, current) => {
        const data = persisted as Record<string, unknown>;
        const conversations = (data.conversations || []) as Conversation[];

        // 清理 conversations 中卡在 running/pending 状态的 tool-call 项
        const cleanedConversations = conversations.map((conv) => ({
          ...conv,
          displayMessages: (conv.displayMessages || []).map((msg) => ({
            ...msg,
            contentItems: (msg.contentItems || []).map((item) => {
              if (item.type === "tool-call" && (item.status === "running" || item.status === "pending")) {
                return { ...item, status: "error" as const };
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
