import { Minus, X, Maximize2 } from "lucide-react";
import { Button } from "@ai-chatbox/ui";
import { QuickAccess } from "../QuickAccess";

interface TitleBarProps {
  title?: string;
}

export function TitleBar({ title = "LeoChat" }: TitleBarProps) {
  // 检测是否在 Electron 环境中
  const isElectron = typeof window !== "undefined" && (window as any).electron;

  const handleMinimize = () => {
    if (isElectron) {
      (window as any).electron.minimize();
    }
  };

  const handleMaximize = () => {
    if (isElectron) {
      (window as any).electron.maximize();
    }
  };

  const handleClose = () => {
    if (isElectron) {
      (window as any).electron.close();
    }
  };

  return (
    <div className="h-8 bg-card flex items-center justify-between px-2 select-none border-b">
      {/* 左侧：应用标题 */}
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 rounded bg-primary/20 flex items-center justify-center">
          <span className="text-[10px] font-bold text-primary">L</span>
        </div>
        <span className="text-xs text-foreground/90 font-medium">{title}</span>
      </div>

      {/* 中间：拖拽区域 */}
      <div className="flex-1 h-full" style={{ WebkitAppRegion: "drag" } as any} />

      {/* 右侧：快捷访问 + 窗口控制 */}
      <div className="flex items-center" style={{ WebkitAppRegion: "no-drag" } as any}>
        {/* 快捷访问按钮 */}
        <QuickAccess />

        {/* 窗口控制按钮（仅在 Electron 中显示） */}
        {isElectron && (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-muted text-muted-foreground hover:text-foreground rounded-none"
              onClick={handleMinimize}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-muted text-muted-foreground hover:text-foreground rounded-none"
              onClick={handleMaximize}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground text-muted-foreground rounded-none"
              onClick={handleClose}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
