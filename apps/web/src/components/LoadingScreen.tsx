import { Minus, Maximize2, X } from "lucide-react";

export function LoadingScreen() {
  const electronAPI = typeof window !== "undefined"
    ? (window as unknown as { electronAPI?: { minimize?: () => void; maximize?: () => void; close?: () => void } }).electronAPI
    : undefined;

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-background">
      {/* Title bar — mirrors TitleBar.tsx so there's no layout shift on mount */}
      <div className="h-8 bg-card flex items-center justify-between px-2 select-none border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-primary/20 flex items-center justify-center">
            <span className="text-[10px] font-bold text-primary">L</span>
          </div>
          <span className="text-xs text-foreground/90 font-medium">LeoChat</span>
        </div>

        <div className="flex-1 h-full" style={{ WebkitAppRegion: "drag" } as React.CSSProperties} />

        {electronAPI && (
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => electronAPI.minimize?.()}
              className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded-none"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => electronAPI.maximize?.()}
              className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors rounded-none"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => electronAPI.close?.()}
              className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-destructive-foreground hover:bg-destructive transition-colors rounded-none"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Loading body */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5">
        {/* Animated logo */}
        <div className="relative flex items-center justify-center">
          {/* Outer ring */}
          <div className="absolute w-20 h-20 rounded-2xl border-2 border-primary/10 animate-ping" style={{ animationDuration: "2s" }} />
          {/* Logo card */}
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center shadow-sm">
            <span className="text-3xl font-bold text-primary select-none">L</span>
          </div>
        </div>

        {/* Text */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-base font-semibold text-foreground tracking-wide">LeoChat</span>
          <span className="text-xs text-muted-foreground">正在启动服务...</span>
        </div>

        {/* Bouncing dots */}
        <div className="flex items-center gap-1.5">
          {[0, 150, 300].map((delay) => (
            <div
              key={delay}
              className="w-1.5 h-1.5 rounded-full bg-primary/50 animate-bounce"
              style={{ animationDelay: `${delay}ms`, animationDuration: "1s" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
