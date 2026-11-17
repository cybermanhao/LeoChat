import { initialViewState } from "@leochat/core/view";
import { agentApi } from "../lib/agent-api";
import type { ConversationsSlice, SliceCreator } from "./chat-types";

/**
 * 会话列表与当前会话。会话内容由本地 server 保存（每个会话一份 JSONL 日志），
 * 切换会话时从 server 读取 transcript，再用 core 的 initialViewState() 生成视图。
 */
export const createConversationsSlice: SliceCreator<ConversationsSlice> = (set, get) => {
  /** 防止快速切换时，较早的加载结果覆盖较晚的 */
  let loadSeq = 0;

  return {
    conversations: [],
    currentConversationId: null,
    view: initialViewState(),
    loadingConversation: false,
    goal: null,
    input: "",

    setInput: (input) => set({ input }),

    loadConversations: async () => {
      try {
        const conversations = await agentApi.listConversations();
        set({ conversations });
        const current = get().currentConversationId;
        if (current && conversations.some((c) => c.id === current)) {
          if (get().view.messages.length === 0) await get().setCurrentConversation(current);
        } else if (current) {
          set({ currentConversationId: null, view: initialViewState() });
        }
      } catch (e) {
        console.warn("[conversations] load failed", e);
      }
    },

    createConversation: async () => {
      get().leaveConversation();
      const meta = await agentApi.createConversation();
      loadSeq++;
      set((s) => ({
        conversations: [meta, ...s.conversations.filter((c) => c.id !== meta.id)],
        currentConversationId: meta.id,
        view: initialViewState(),
        loadingConversation: false,
        goal: null,
      }));
      return meta.id;
    },

    setCurrentConversation: async (id) => {
      get().leaveConversation();
      const seq = ++loadSeq;
      set({ currentConversationId: id, view: initialViewState(), loadingConversation: id !== null, goal: null });
      if (!id) return;
      try {
        const { meta, transcript, goal, goalRunning } = await agentApi.loadConversation(id);
        if (seq !== loadSeq) return;
        set((s) => ({
          view: initialViewState(transcript),
          loadingConversation: false,
          goal: goal ?? null,
          conversations: s.conversations.map((c) => (c.id === id ? meta : c)),
        }));
        // 目标正在 server 上推进：连上，继续显示进度
        if (goalRunning) void get().attachGoal();
      } catch (e) {
        if (seq !== loadSeq) return;
        console.warn("[conversations] open failed", e);
        set((s) => ({
          loadingConversation: false,
          currentConversationId: null,
          conversations: s.conversations.filter((c) => c.id !== id),
        }));
      }
    },

    deleteConversation: async (id) => {
      const wasCurrent = get().currentConversationId === id;
      if (wasCurrent) get().leaveConversation();
      await agentApi.deleteConversation(id).catch((e) => console.warn("[conversations] delete failed", e));
      const remaining = get().conversations.filter((c) => c.id !== id);
      set({ conversations: remaining });
      if (wasCurrent) await get().setCurrentConversation(remaining[0]?.id ?? null);
    },

    clearAllConversations: async () => {
      get().leaveConversation();
      const ids = get().conversations.map((c) => c.id);
      await Promise.all(ids.map((id) => agentApi.deleteConversation(id).catch(() => {})));
      loadSeq++;
      set({ conversations: [], currentConversationId: null, view: initialViewState(), loadingConversation: false, goal: null });
    },

    clearCurrentConversation: async () => {
      const id = get().currentConversationId;
      if (!id) return;
      get().leaveConversation();
      await agentApi.deleteConversation(id).catch(() => {});
      loadSeq++;
      set((s) => ({
        conversations: s.conversations.filter((c) => c.id !== id),
        currentConversationId: null,
        view: initialViewState(),
        loadingConversation: false,
        goal: null,
      }));
    },
  };
};
