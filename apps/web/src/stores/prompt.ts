import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CustomPrompt {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export type ActivePrompt =
  | { type: "custom"; id: string }
  | null;

interface PromptState {
  customPrompts: CustomPrompt[];
  activePrompt: ActivePrompt;
  /** MCP 提示词内容缓存，key: "${serverId}:${promptName}"，不持久化（session 级） */
  mcpPromptCache: Record<string, string>;

  // Actions
  addCustomPrompt: (name: string, content: string) => string;
  updateCustomPrompt: (id: string, name: string, content: string) => void;
  deleteCustomPrompt: (id: string) => void;
  setActiveCustomPrompt: (id: string) => void;
  clearActivePrompt: () => void;
  getActiveContent: () => string | null;
  cachePromptContent: (serverId: string, promptName: string, content: string) => void;
}

export const usePromptStore = create<PromptState>()(
  persist(
    (set, get) => ({
      customPrompts: [],
      activePrompt: null,
      mcpPromptCache: {},

      addCustomPrompt: (name, content) => {
        const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const now = Date.now();
        set((s) => ({
          customPrompts: [
            ...s.customPrompts,
            { id, name, content, createdAt: now, updatedAt: now },
          ],
        }));
        return id;
      },

      updateCustomPrompt: (id, name, content) => {
        set((s) => ({
          customPrompts: s.customPrompts.map((p) =>
            p.id === id ? { ...p, name, content, updatedAt: Date.now() } : p
          ),
        }));
      },

      deleteCustomPrompt: (id) => {
        set((s) => ({
          customPrompts: s.customPrompts.filter((p) => p.id !== id),
          activePrompt:
            s.activePrompt?.type === "custom" && s.activePrompt.id === id
              ? null
              : s.activePrompt,
        }));
      },

      setActiveCustomPrompt: (id) => {
        set({ activePrompt: { type: "custom", id } });
      },

      clearActivePrompt: () => {
        set({ activePrompt: null });
      },

      getActiveContent: () => {
        const { activePrompt, customPrompts } = get();
        if (!activePrompt) return null;
        const found = customPrompts.find((p) => p.id === activePrompt.id);
        return found?.content ?? null;
      },

      cachePromptContent: (serverId, promptName, content) => {
        const key = `${serverId}:${promptName}`;
        set((s) => ({ mcpPromptCache: { ...s.mcpPromptCache, [key]: content } }));
      },
    }),
    {
      name: "leochat-prompts",
      partialize: (s) => ({
        customPrompts: s.customPrompts,
        activePrompt: s.activePrompt,
        // mcpPromptCache 不持久化，每次启动重新拉取
      }),
    }
  )
);
