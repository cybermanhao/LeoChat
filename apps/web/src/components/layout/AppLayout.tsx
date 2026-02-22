import { Outlet } from "react-router-dom";
import { TitleBar } from "./TitleBar";
import { ActivityBar } from "./ActivityBar";
import { Toaster } from "../Toaster";

export function AppLayout() {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      {/* Title Bar - 固定高度，横跨整个宽度 */}
      <TitleBar />

      {/* Main Layout: Activity Bar + Content - 占据剩余高度 */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar - 固定宽度，撑满剩余高度 */}
        <ActivityBar />

        {/* Main Content Area - 占据剩余宽度，页面内部控制滚动 */}
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </div>

      {/* Toaster 必须在有实体 DOM 容器内，避免成为 #root 直接子节点被 height:100% 撑开 */}
      <Toaster />
    </div>
  );
}
