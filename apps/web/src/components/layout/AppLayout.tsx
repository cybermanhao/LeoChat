import { Outlet } from "react-router-dom";
import { TitleBar } from "./TitleBar";
import { AppSidebar } from "./AppSidebar";
import { Toaster } from "../Toaster";

/**
 * 应用骨架（按 dsh 的 ui-layout）：一条侧边栏 + 主区域。
 * 标题栏只在 Electron 里出现（拖拽区域和窗口按钮）；浏览器里由侧边栏承担品牌。
 */
export function AppLayout() {
  const isElectron = typeof window !== "undefined" && !!window.electronAPI;
  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      {isElectron && <TitleBar />}

      <div className="flex-1 flex overflow-hidden">
        <AppSidebar />
        <div className="flex-1 min-w-0 overflow-hidden">
          <Outlet />
        </div>
      </div>

      {/* Toaster 必须在有实体 DOM 容器内，避免成为 #root 直接子节点被 height:100% 撑开 */}
      <Toaster />
    </div>
  );
}
