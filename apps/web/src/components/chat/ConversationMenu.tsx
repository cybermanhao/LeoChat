/**
 * 会话的"⋯"菜单和可编辑标题（重设计计划 §3 / §5，按 dsh：会话顶栏有一个"更多"按钮）。
 * 菜单：重命名（标题就地变成输入框）、删除这个对话（不可逆，先确认；和 /clear 相同）。
 */
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, PencilLine, Trash2 } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import { useChatStore } from "../../stores/chat";
import { useT } from "../../i18n";

export function ConversationMenu({ onRename, className }: { onRename: () => void; className?: string }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const clearCurrentConversation = useChatStore((s) => s.clearCurrentConversation);

  // 点外面关闭（CLAUDE.md 的下拉菜单模式）
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent";
  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="更多"
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        data-testid="conversation-menu"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-md border border-border bg-card py-1 shadow-lg">
          <button
            type="button"
            role="menuitem"
            className={cn(item, "text-foreground")}
            onClick={() => {
              setOpen(false);
              onRename();
            }}
          >
            <PencilLine className="h-3.5 w-3.5 text-muted-foreground" />
            重命名
          </button>
          <button
            type="button"
            role="menuitem"
            className={cn(item, "text-destructive")}
            onClick={() => {
              setOpen(false);
              if (window.confirm(t("chat.confirmClear"))) void clearCurrentConversation();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            删除这个对话
          </button>
        </div>
      )}
    </div>
  );
}

/** 会话标题：平时是文字，编辑时是输入框（Enter 保存，Esc 取消，失焦保存） */
export function ConversationTitle({
  conversationId,
  editing,
  onDone,
  className,
}: {
  conversationId: string;
  editing: boolean;
  onDone: () => void;
  className?: string;
}) {
  const title = useChatStore((s) => s.conversations.find((c) => c.id === conversationId)?.title || "新对话");
  const rename = useChatStore((s) => s.renameConversation);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  /** 已经保存或取消：输入框移除时可能还会触发一次失焦，不能再保存 */
  const finished = useRef(false);
  useEffect(() => {
    if (editing) {
      finished.current = false;
      setDraft(title);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editing) {
    return (
      <h1 className={cn("min-w-0 flex-1 truncate text-sm font-medium text-foreground", className)} title={title}>
        {title}
      </h1>
    );
  }
  const save = () => {
    if (finished.current) return;
    finished.current = true;
    void rename(conversationId, draft);
    onDone();
  };
  const cancel = () => {
    finished.current = true;
    onDone();
  };
  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.nativeEvent.isComposing) return;
        if (e.key === "Enter") save();
        if (e.key === "Escape") cancel();
      }}
      maxLength={200}
      aria-label="会话标题"
      className={cn(
        "min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-0.5 text-sm font-medium text-foreground outline-none focus:border-primary",
        className,
      )}
    />
  );
}
