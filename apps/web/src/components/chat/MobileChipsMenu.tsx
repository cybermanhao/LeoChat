/**
 * 手机上输入框下方的控件（模型、联网、权限……）收进一个"⋯"按钮（重设计计划 §7）。
 * 点开后竖着列出，并显示文字标签（桌面上 sm 以下隐藏的 .chip-label 在这里强制显示）。
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@ai-chatbox/ui";

export function MobileChipsMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative py-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="输入选项"
        aria-expanded={open}
        className={cn(
          "inline-flex h-7 items-center gap-1 rounded-full border border-border px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
          open && "bg-muted text-foreground",
        )}
        data-testid="mobile-chips-menu"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 flex min-w-[12rem] flex-col items-stretch gap-1 rounded-lg border border-border bg-card p-1.5 shadow-lg [&_.chip-label]:inline [&>*]:justify-start">
          {children}
        </div>
      )}
    </div>
  );
}
