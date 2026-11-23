/**
 * 右栏（重设计 P4，按 dsh 的 ui-sidebar-right）：每个会话一个停靠面板，默认收起；
 * 手动打开后按会话记住开关和当前标签（localStorage）。选中的工具调用不持久化。
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DockTab = "tasks" | "tools";

interface DockEntry {
  open: boolean;
  tab: DockTab;
  /** 最近一次改动，用来裁剪太旧的记录 */
  at: number;
}

interface DockState {
  byConversation: Record<string, DockEntry>;
  /** 工具标签里选中的工具调用（callId） */
  selectedCallId: string | null;
  openDock: (conversationId: string, tab?: DockTab, callId?: string) => void;
  closeDock: (conversationId: string) => void;
  toggleDock: (conversationId: string) => void;
  setTab: (conversationId: string, tab: DockTab) => void;
  selectCall: (callId: string | null) => void;
}

const MAX_ENTRIES = 200;
const DEFAULT: DockEntry = { open: false, tab: "tasks", at: 0 };

function put(state: DockState, id: string, patch: Partial<DockEntry>): Pick<DockState, "byConversation"> {
  const next = { ...state.byConversation, [id]: { ...(state.byConversation[id] ?? DEFAULT), ...patch, at: Date.now() } };
  const keys = Object.keys(next);
  if (keys.length > MAX_ENTRIES) {
    keys
      .sort((a, b) => next[a]!.at - next[b]!.at)
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete next[k]);
  }
  return { byConversation: next };
}

export const useDockStore = create<DockState>()(
  persist(
    (set) => ({
      byConversation: {},
      selectedCallId: null,
      openDock: (id, tab, callId) =>
        set((s) => ({ ...put(s, id, { open: true, ...(tab ? { tab } : {}) }), ...(callId ? { selectedCallId: callId } : {}) })),
      closeDock: (id) => set((s) => put(s, id, { open: false })),
      toggleDock: (id) => set((s) => put(s, id, { open: !(s.byConversation[id]?.open ?? false) })),
      setTab: (id, tab) => set((s) => put(s, id, { tab })),
      selectCall: (callId) => set({ selectedCallId: callId }),
    }),
    {
      name: "leochat-dock-storage",
      partialize: (s) => ({ byConversation: s.byConversation }),
    },
  ),
);

/** 某个会话的右栏状态（没有记录时是默认：收起、任务标签） */
export function useDockEntry(conversationId: string | null): DockEntry {
  return useDockStore((s) => (conversationId ? (s.byConversation[conversationId] ?? DEFAULT) : DEFAULT));
}
