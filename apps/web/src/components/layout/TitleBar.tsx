import { Minus, X, Maximize2 } from "lucide-react";
import { Button, cn } from "@ai-chatbox/ui";
import { QuickAccess } from "../QuickAccess";
import { useChatStore } from "../../stores/chat";
import { useT } from "../../i18n";

interface TitleBarProps {
  title?: string;
}

export function TitleBar({ title = "LeoChat" }: TitleBarProps) {
  const electronAPI = typeof window !== "undefined" && (window as any).electronAPI;
  const isElectron = !!electronAPI;
  const { t } = useT();
  const uiMode = useChatStore((s) => s.uiMode);
  const setUiMode = useChatStore((s) => s.setUiMode);

  const handleMinimize = () => electronAPI?.minimize();
  const handleMaximize = () => electronAPI?.maximize();
  const handleClose = () => electronAPI?.close();

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
        {/* 简洁/专业模式切换 */}
        <div className="flex items-center h-5 rounded-md border border-border overflow-hidden mr-2">
          <button
            onClick={() => setUiMode('simple')}
            className={cn(
              "px-2 text-[11px] h-full transition-colors",
              uiMode === 'simple'
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("ui.simpleMode")}
          </button>
          <button
            onClick={() => setUiMode('professional')}
            className={cn(
              "px-2 text-[11px] h-full transition-colors",
              uiMode === 'professional'
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t("ui.professionalMode")}
          </button>
        </div>

        {/* 快捷访问按钮 */}
        <QuickAccess />

        {/* 窗口控制按钮（仅在 Electron 中显示） */}
        {isElectron && (
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-muted active:bg-muted/70 text-muted-foreground hover:text-foreground active:scale-90 rounded-none transition-all duration-150"
              onClick={handleMinimize}
            >
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-muted active:bg-muted/70 text-muted-foreground hover:text-foreground active:scale-90 rounded-none transition-all duration-150"
              onClick={handleMaximize}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-destructive active:bg-destructive/70 hover:text-destructive-foreground active:scale-90 text-muted-foreground rounded-none transition-all duration-150"
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
