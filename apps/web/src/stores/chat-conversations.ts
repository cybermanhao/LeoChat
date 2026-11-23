import { initialViewState } from "@leochat/core/view";
import { agentApi } from "../lib/agent-api";
import { EMPTY_INBOX } from "./chat-generation";
import type { ConversationsSlice, SliceCreator } from "./chat-types";

/**
 * 会话列表与当前会话。会话内容由本地 server 保存（每个会话一份 JSONL 日志）。
 * 打开会话时先读一次（列表元数据、目标），再连上会话事件流：流里的 reset 事件会用 transcript 重建视图，
 * 之后的事件实时更新；离开会话只断开连接，server 上进行中的工作（目标、提醒）照常继续。
 */
export const createConversationsSlice: SliceCreator<ConversationsSlice> = (set, get) => {
  /** 防止快速切换时，较早的加载结果覆盖较晚的 */
  let loadSeq = 0;
  /** 正在新建的会话：同一时间只建一个，"新对话"之后马上发送的消息等它建好、发进同一个会话 */
  let creating: Promise<string> | null = null;
  const blank = { view: initialViewState(), loadingConversation: false, goal: null, schedules: [], inbox: EMPTY_INBOX };

  return {
    conversations: [],
    currentConversationId: null,
    ...blank,
    input: "",

    setInput: (input) => set({ input }),

    loadConversations: async () => {
      // 记下请求开始时的当前会话：列表返回前用户可能已经新建 / 切换了会话（启动时很快发出第一条消息）
      const startedWith = get().currentConversationId;
      const startSeq = loadSeq;
      try {
        const data: unknown = await agentApi.listConversations();
        // 响应形状不对时按空列表处理：会话列表现在在全局侧边栏里，坏数据会让整个应用崩溃
        const conversations = Array.isArray(data) ? (data as Awaited<ReturnType<typeof agentApi.listConversations>>) : [];
        if (get().currentConversationId !== startedWith || loadSeq !== startSeq) {
          // 这期间换过会话：只合并列表（保留这期间新建、列表里还没有的），不动当前会话
          // 否则会把刚建的会话当成"已不存在"清掉，页面随之断开事件流（2026-11-23 e2e 现场确认）
          set((s) => ({ conversations: [...s.conversations.filter((c) => !conversations.some((x) => x.id === c.id)), ...conversations] }));
          return;
        }
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

    createConversation: () => {
      if (creating) return creating;
      // 立刻显示空白会话；server 建好后再切过去（这期间用户切到别的会话就不切）
      get().connect(null);
      const seq = ++loadSeq;
      set({ currentConversationId: null, ...blank });
      creating = (async () => {
        const meta = await agentApi.createConversation();
        const stillHere = seq === loadSeq;
        set((s) => ({
          conversations: [meta, ...s.conversations.filter((c) => c.id !== meta.id)],
          ...(stillHere ? { currentConversationId: meta.id } : {}),
        }));
        if (stillHere) get().connect(meta.id);
        return meta.id;
      })().finally(() => {
        creating = null;
      });
      return creating;
    },

    setCurrentConversation: async (id) => {
      get().connect(null);
      const seq = ++loadSeq;
      set({ currentConversationId: id, ...blank, loadingConversation: id !== null });
      if (!id) return;
      try {
        const { meta, transcript, goal, goalArmed } = await agentApi.loadConversation(id);
        if (seq !== loadSeq) return;
        set((s) => ({
          view: initialViewState(transcript),
          loadingConversation: false,
          goal: goal ? { ...goal, armed: goalArmed } : null,
          conversations: s.conversations.map((c) => (c.id === id ? meta : c)),
        }));
        void get().refreshSchedules();
        get().connect(id);
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
      if (wasCurrent) get().connect(null);
      await agentApi.deleteConversation(id).catch((e) => console.warn("[conversations] delete failed", e));
      const remaining = get().conversations.filter((c) => c.id !== id);
      set({ conversations: remaining });
      if (wasCurrent) await get().setCurrentConversation(remaining[0]?.id ?? null);
    },

    renameConversation: async (id, title) => {
      const name = title.trim().slice(0, 200);
      const before = get().conversations.find((c) => c.id === id)?.title ?? "";
      if (!name || name === before) return;
      set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, title: name } : c)) }));
      try {
        await agentApi.renameConversation(id, name);
      } catch (e) {
        console.warn("[conversations] rename failed", e);
        set((s) => ({ conversations: s.conversations.map((c) => (c.id === id ? { ...c, title: before } : c)) }));
      }
    },

    clearAllConversations: async () => {
      get().connect(null);
      const ids = get().conversations.map((c) => c.id);
      await Promise.all(ids.map((id) => agentApi.deleteConversation(id).catch(() => {})));
      loadSeq++;
      set({ conversations: [], currentConversationId: null, ...blank });
    },

    clearCurrentConversation: async () => {
      const id = get().currentConversationId;
      if (!id) return;
      get().connect(null);
      await agentApi.deleteConversation(id).catch(() => {});
      loadSeq++;
      set((s) => ({ conversations: s.conversations.filter((c) => c.id !== id), currentConversationId: null, ...blank }));
    },
  };
};
