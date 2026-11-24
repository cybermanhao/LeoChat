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
  /** 右栏宽度（用户拖过之后的像素值）；按 dsh 是整个窗口共用的临时偏好，刷新后回到默认，不持久化 */
  dockWidth: number | null;
  setDockWidth: (px: number | null) => void;
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      setSidebarCollapsed: (value) => set({ sidebarCollapsed: value }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      drawerOpen: false,
      setDrawerOpen: (open) => set({ drawerOpen: open }),
      dockWidth: null,
      setDockWidth: (px) => set({ dockWidth: px }),
    }),
    {
      name: "leochat-layout-storage",
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
