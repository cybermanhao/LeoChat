import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getChatStorageAdapter } from "../lib/chat-persistence";
import type { ChatState } from "./chat-types";
import { createSettingsSlice } from "./chat-settings";
import { createConversationsSlice } from "./chat-conversations";
import { createGenerationSlice } from "./chat-generation";

// Re-export public types for consumers
export type { LLMProvider, ChatState, Conversation } from "./chat-types";

/** 持久化的只有设置和当前会话 id；会话内容由本地 server 的 JSONL 日志保存 */
const PERSIST_VERSION = 2;
const PERSISTED_KEYS = [
  "currentConversationId",
  "providerKeys",
  "currentProvider",
  "currentModel",
  "enableMarkdown",
  "webSearch",
  "permission",
  "maxEpochs",
  "unlimitedEpochs",
  "contextLevel",
  "uiMode",
  "temperature",
] as const;

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      ...createSettingsSlice(set, get),
      ...createConversationsSlice(set, get),
      ...createGenerationSlice(set, get),
    }),
    {
      name: "ai-chatbox-chat",
      version: PERSIST_VERSION,
      storage: createJSONStorage(() => getChatStorageAdapter()),
      partialize: (state) => Object.fromEntries(PERSISTED_KEYS.map((k) => [k, state[k]])) as Partial<ChatState>,
      // v1 把整份会话（displayMessages / contextMessages / internalMessages）存在浏览器里。
      // GUI 迁移第二步改由 server 保存，按用户决定旧会话直接丢弃，只保留设置
      migrate: (persisted, version) => {
        const data = (persisted ?? {}) as Record<string, unknown>;
        if (version < 2) {
          const { conversations: _c, currentConversationId: _id, ...settings } = data;
          return settings as Partial<ChatState>;
        }
        return data as Partial<ChatState>;
      },
      merge: (persisted, current) => {
        const data = (persisted ?? {}) as Record<string, unknown>;
        const picked = Object.fromEntries(PERSISTED_KEYS.filter((k) => k in data).map((k) => [k, data[k]]));
        return { ...current, ...picked };
      },
    }
  )
);
