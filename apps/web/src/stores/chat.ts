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
const PERSIST_VERSION = 3;
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
        let out = data;
        if (version < 2) {
          const { conversations: _c, currentConversationId: _id, ...settings } = data;
          out = settings;
        }
        // v3（2026-11-22）：联网搜索改为默认开启；旧版本保存的 false 是旧默认值，统一打开一次
        if (version < 3) out = { ...out, webSearch: true };
        return out as Partial<ChatState>;
      },
      merge: (persisted, current) => {
        const data = (persisted ?? {}) as Record<string, unknown>;
        const picked = Object.fromEntries(PERSISTED_KEYS.filter((k) => k in data).map((k) => [k, data[k]]));
        return { ...current, ...picked };
      },
    }
  )
);
