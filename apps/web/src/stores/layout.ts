import { create } from "zustand";
import { persist } from "zustand/middleware";

/** 窗口布局：侧边栏是否收成窄条（按 dsh 的 ui-sidebar，收起后宽 56px） */
interface LayoutState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
  toggleSidebar: () => void;
  /** 手机上侧边栏是抽屉：是否打开（不持久化） */
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      drawerOpen: false,
      setDrawerOpen: (open) => set({ drawerOpen: open }),
    }),
    {
      name: "leochat-layout-storage",
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
