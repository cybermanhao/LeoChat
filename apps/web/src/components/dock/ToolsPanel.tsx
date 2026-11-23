/**
 * 右栏"工具"标签：本会话的工具调用（最新的在上），选中一个看完整的输入和输出。
 * 过程时间线里的"在右栏查看"会打开这里并选中对应的调用。
 */
import { useEffect, useMemo, useRef } from "react";
import { Check, Loader2, ShieldQuestion, X } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import type { ViewPart } from "@leochat/core/view";
import { useChatStore } from "../../stores/chat";
import { useDockStore } from "../../stores/dock";
import { toolOutputText } from "../../stores/chat-generation";
import { displayOutput, toolView } from "../chat/turn/tool-views";
import { formatMs } from "../chat/turn/group";

type ToolPart = Extract<ViewPart, { type: "tool" }>;

function argsOf(p: ToolPart): Record<string, unknown> {
  if (p.input && typeof p.input === "object") return p.input as Record<string, unknown>;
  try {
    const v = JSON.parse(p.inputText ?? "") as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function StatusIcon({ state }: { state: ToolPart["state"] }) {
  if (state === "output-available") return <Check className="h-3 w-3 shrink-0 text-primary" />;
  if (state === "output-error" || state === "denied") return <X className="h-3 w-3 shrink-0 text-destructive" />;
  if (state === "awaiting-approval") return <ShieldQuestion className="h-3 w-3 shrink-0 text-primary" />;
  return <Loader2 className="h-3 w-3 shrink-0 animate-spin" />;
}

export function ToolsPanel() {
  const messages = useChatStore((s) => s.view.messages);
  const selected = useDockStore((s) => s.selectedCallId);
  const select = useDockStore((s) => s.selectCall);
  const calls = useMemo(
    () => messages.flatMap((m) => m.parts).filter((p): p is ToolPart => p.type === "tool").reverse(),
    [messages],
  );
  const current = calls.find((c) => c.callId === selected) ?? calls[0];
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 });
  }, [current?.callId]);

  if (!calls.length) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground" data-testid="dock-tools-empty">
        这个会话还没有调用过工具。
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="dock-tools">
      <ul className="max-h-[40%] flex-none overflow-y-auto border-b border-border py-1">
        {calls.map((c) => {
          const view = toolView(c.name);
          const Icon = view.icon;
          const desc = view.describe(argsOf(c));
          return (
            <li key={c.callId}>
              <button
                type="button"
                onClick={() => select(c.callId)}
                aria-current={c.callId === current?.callId}
                className={cn(
                  "flex w-full min-w-0 items-center gap-1.5 px-3 py-1 text-left text-xs transition-colors",
                  c.callId === current?.callId ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="h-3 w-3 shrink-0" />
                <span className={cn("truncate", view.kind === "command" && "font-mono")}>{desc ?? c.name}</span>
                <span className="ml-auto pl-2">
                  <StatusIcon state={c.state} />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {current && <ToolCallDetail part={current} ref_={detailRef} />}
    </div>
  );
}

function ToolCallDetail({ part, ref_ }: { part: ToolPart; ref_: React.RefObject<HTMLDivElement | null> }) {
  const args = useMemo(() => argsOf(part), [part.input, part.inputText]);
  const output = useMemo(() => displayOutput(toolOutputText(part.output)), [part.output]);
  const input = typeof args.command === "string" ? args.command : Object.keys(args).length ? JSON.stringify(args, null, 2) : (part.inputText ?? "");
  const pre = "whitespace-pre-wrap break-all rounded bg-muted px-2.5 py-2 font-mono text-[11px] text-foreground";
  return (
    <div ref={ref_} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3" data-testid="dock-tool-detail">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono text-foreground">{part.name}</span>
        <StatusIcon state={part.state} />
        {part.ms !== undefined && <span className="text-xs text-muted-foreground">{formatMs(part.ms)}</span>}
      </div>
      <div>
        <div className="mb-1 text-xs text-muted-foreground">输入</div>
        <pre className={pre}>{input || "（无参数）"}</pre>
      </div>
      <div>
        <div className="mb-1 text-xs text-muted-foreground">输出</div>
        {part.state === "denied" ? (
          <p className="text-xs text-destructive">已拒绝执行</p>
        ) : part.state === "awaiting-approval" ? (
          <p className="text-xs text-muted-foreground">等你确认后执行</p>
        ) : output ? (
          <pre className={cn(pre, part.state === "output-error" && "text-destructive")}>{output}</pre>
        ) : part.state === "output-error" ? (
          <p className="text-xs text-destructive">工具执行失败</p>
        ) : part.state === "output-available" ? (
          <p className="text-xs text-muted-foreground">（没有输出）</p>
        ) : (
          <p className="text-xs text-muted-foreground">运行中…</p>
        )}
      </div>
    </div>
  );
}
