/**
 * / 命令菜单：输入框上方的弹出层，按组列出命令。键盘由 ChatInput 的 interceptKey 转过来（见 useSlashMenu）。
 */
import { useEffect, useState, type KeyboardEvent } from "react";
import { cn } from "@ai-chatbox/ui";
import { matchSlash, type SlashCommand } from "../../lib/slash-commands";

export function useSlashMenu(input: string, onPick: (c: SlashCommand) => void) {
  const items = matchSlash(input);
  const [index, setIndex] = useState(0);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  useEffect(() => setIndex(0), [input]);
  const open = !!items && dismissedFor !== input;

  const interceptKey = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open || !items) return false;
    switch (e.key) {
      case "ArrowDown":
        setIndex((i) => (i + 1) % items.length);
        return true;
      case "ArrowUp":
        setIndex((i) => (i - 1 + items.length) % items.length);
        return true;
      case "Tab":
        onPick(items[index]!);
        return true;
      case "Enter":
        if (e.shiftKey) return false;
        onPick(items[index]!);
        return true;
      case "Escape":
        setDismissedFor(input);
        return true;
      default:
        return false;
    }
  };

  return { open, items: items ?? [], index, setIndex, interceptKey };
}

export function SlashMenu({
  items,
  index,
  onHover,
  onPick,
}: {
  items: SlashCommand[];
  index: number;
  onHover: (i: number) => void;
  onPick: (c: SlashCommand) => void;
}) {
  const groups = [...new Set(items.map((c) => c.group))];
  return (
    <div
      className="absolute bottom-full left-0 right-0 z-50 mb-1 overflow-hidden rounded-lg border border-border bg-card py-1 shadow-lg"
      role="listbox"
      aria-label="命令"
      data-testid="slash-menu"
    >
      {groups.map((g) => (
        <div key={g}>
          <div className="px-3 pb-0.5 pt-1.5 text-[11px] text-muted-foreground">{g}</div>
          {items.map((c, i) =>
            c.group === g ? (
              <button
                key={c.name}
                type="button"
                role="option"
                aria-selected={i === index}
                onMouseEnter={() => onHover(i)}
                // mousedown 而不是 click：不让输入框先失去焦点
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(c);
                }}
                className={cn(
                  "flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                  i === index ? "bg-accent text-foreground" : "text-foreground hover:bg-accent/50",
                )}
              >
                <span className="font-mono">/{c.name}</span>
                {c.args && <span className="font-mono text-xs text-muted-foreground">{c.args}</span>}
                <span className="ml-auto truncate pl-3 text-xs text-muted-foreground">{c.desc}</span>
              </button>
            ) : null,
          )}
        </div>
      ))}
      <div className="border-t border-border px-3 pt-1 text-[11px] text-muted-foreground">↑↓ 选择 · Enter / Tab 确认 · Esc 关闭</div>
    </div>
  );
}
