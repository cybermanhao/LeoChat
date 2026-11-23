/**
 * 回合的过程（重设计 P2，用户在视觉伴侣里选定 B）：
 * 运行时展开成时间线（思考、每一步工具调用、状态、耗时，当前步骤转圈）；
 * 回合结束后收成一行"已完成 · 思考 · 1 条命令 · 3.2 秒"，点开可再看全部步骤。
 */
import { memo, useMemo, useState, type ReactNode } from "react";
import { Brain, Check, ChevronRight, Globe, Loader2, ShieldQuestion, X } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import { toolOutputText } from "../../../stores/chat-generation";
import { ApprovalCard } from "../RunBanners";
import { formatMs, summarize, summaryText, type ProcessItem, type ServerToolPart, type ToolPart } from "./group";
import { displayOutput, serverToolDescribe, toolView } from "./tool-views";

export interface ProcessTimelineProps {
  items: ProcessItem[];
  /** 回合是否还在进行 */
  running: boolean;
  /** 已完成的回合默认是否展开（工作细节 = 详细） */
  detailed: boolean;
  /** 回合结束的原因不是正常完成时（停止、出错）显示 */
  endLabel?: string;
  renderNote: (text: string, streaming: boolean) => ReactNode;
}

export const ProcessTimeline = memo(function ProcessTimeline({ items, running, detailed, endLabel, renderNote }: ProcessTimelineProps) {
  const [override, setOverride] = useState<boolean | null>(null);
  const awaiting = items.some((i) => i.type === "tool" && i.part.state === "awaiting-approval");
  // 运行中和等待审批时始终展开；结束后按工作细节模式，用户点过就按用户的
  const open = awaiting || running || (override ?? detailed);
  const summary = useMemo(() => summaryText(summarize(items)), [items]);
  if (!items.length) return null;

  const current = items[items.length - 1]!;
  const head = awaiting ? "等待你确认" : running ? runningLabel(current) : (endLabel ?? "已完成");

  return (
    <div className="mb-2" data-process>
      <button
        type="button"
        onClick={() => setOverride(!open)}
        disabled={running || awaiting}
        aria-expanded={open}
        className="flex max-w-full items-center gap-1.5 rounded px-1 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:hover:bg-transparent"
      >
        {running && !awaiting ? (
          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
        ) : (
          <ChevronRight className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-90")} />
        )}
        <span className="shrink-0 text-foreground/80">{head}</span>
        {summary && <span className="truncate">· {summary}</span>}
      </button>
      {open && (
        <div className="ml-[0.6rem] mt-1 space-y-0.5 border-l border-border pl-3">
          {items.map((item, i) => (
            <ProcessRow key={item.key} item={item} active={running && i === items.length - 1} renderNote={renderNote} />
          ))}
        </div>
      )}
    </div>
  );
});

function runningLabel(item: ProcessItem): string {
  switch (item.type) {
    case "reasoning":
      return "正在思考";
    case "note":
      return "正在处理";
    case "server_tool":
      return item.part.results ? "正在处理" : "正在联网搜索";
    case "tool":
      return item.part.state === "output-available" || item.part.state === "output-error" || item.part.state === "denied" ? "正在处理" : "正在运行工具";
  }
}

function ProcessRow({ item, active, renderNote }: { item: ProcessItem; active: boolean; renderNote: ProcessTimelineProps["renderNote"] }) {
  switch (item.type) {
    case "reasoning":
      return <ReasoningRow text={item.text} streaming={item.streaming && active} />;
    case "note":
      return <div className="py-1 text-sm text-muted-foreground [&_p]:my-0">{renderNote(item.text, item.streaming && active)}</div>;
    case "tool":
      return <ToolRow part={item.part} />;
    case "server_tool":
      return <ServerToolRow part={item.part} />;
  }
}

const rowButton =
  "flex w-full min-w-0 items-center gap-1.5 rounded px-1 py-0.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

function ReasoningRow({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  const firstLine = text.trim().split("\n")[0] ?? "";
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className={rowButton} aria-expanded={open}>
        {streaming ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <Brain className="h-3 w-3 shrink-0" />}
        <span className="shrink-0">思考</span>
        {!open && firstLine && <span className="truncate opacity-70">{firstLine}</span>}
      </button>
      {open && <div className="ml-5 mt-0.5 whitespace-pre-wrap pb-1 text-xs text-muted-foreground">{text}</div>}
    </div>
  );
}

function toolArgs(p: ToolPart): Record<string, unknown> {
  if (p.input && typeof p.input === "object") return p.input as Record<string, unknown>;
  if (!p.inputText) return {};
  try {
    const v = JSON.parse(p.inputText) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function StatusIcon({ state }: { state: ToolPart["state"] }) {
  switch (state) {
    case "output-available":
      return <Check className="h-3 w-3 shrink-0 text-primary" />;
    case "output-error":
    case "denied":
      return <X className="h-3 w-3 shrink-0 text-destructive" />;
    case "awaiting-approval":
      return <ShieldQuestion className="h-3 w-3 shrink-0 text-primary" />;
    default:
      return <Loader2 className="h-3 w-3 shrink-0 animate-spin" />;
  }
}

const ToolRow = memo(function ToolRow({ part }: { part: ToolPart }) {
  const [open, setOpen] = useState(false);
  const args = useMemo(() => toolArgs(part), [part.input, part.inputText]);
  const view = toolView(part.name);
  const Icon = view.icon;
  const desc = view.describe(args);
  return (
    <div data-tool={part.name}>
      <button type="button" onClick={() => setOpen(!open)} className={rowButton} aria-expanded={open} title={part.name}>
        <Icon className="h-3 w-3 shrink-0" />
        {desc ? (
          <span className={cn("truncate text-foreground/80", view.kind === "command" && "font-mono")}>{desc}</span>
        ) : (
          <span className="truncate font-mono text-foreground/80">{part.name}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5 pl-2">
          {part.state === "denied" && <span>已拒绝</span>}
          {part.ms !== undefined && part.state !== "awaiting-approval" && <span className="tabular-nums opacity-70">{formatMs(part.ms)}</span>}
          <StatusIcon state={part.state} />
        </span>
      </button>
      {part.state === "awaiting-approval" && <ApprovalCard part={part} />}
      {open && <ToolDetail part={part} args={args} />}
    </div>
  );
});

function ToolDetail({ part, args }: { part: ToolPart; args: Record<string, unknown> }) {
  const output = useMemo(() => displayOutput(toolOutputText(part.output)), [part.output]);
  const input = typeof args.command === "string" ? args.command : Object.keys(args).length ? JSON.stringify(args, null, 2) : (part.inputText ?? "");
  const pre = "max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted px-2.5 py-1.5 font-mono text-[11px] text-foreground";
  return (
    <div className="mb-1.5 ml-5 mt-0.5 space-y-1.5">
      <div className="text-[11px] text-muted-foreground">
        <span className="font-mono">{part.name}</span>
      </div>
      {input && <pre className={pre}>{input}</pre>}
      {part.state === "denied" ? (
        <p className="text-xs text-destructive">已拒绝执行</p>
      ) : output ? (
        <pre className={cn(pre, part.state === "output-error" && "text-destructive")}>{output}</pre>
      ) : part.state === "output-error" ? (
        <p className="text-xs text-destructive">工具执行失败</p>
      ) : null}
    </div>
  );
}

function ServerToolRow({ part }: { part: ServerToolPart }) {
  const [open, setOpen] = useState(false);
  const { kind, text } = serverToolDescribe(part.input);
  const results = part.results ?? [];
  return (
    <div>
      <button type="button" onClick={() => setOpen(!open)} className={rowButton} aria-expanded={open} disabled={!results.length}>
        {part.results ? <Globe className="h-3 w-3 shrink-0" /> : <Loader2 className="h-3 w-3 shrink-0 animate-spin" />}
        <span className="shrink-0">{kind === "page" ? "打开网页" : "联网搜索"}</span>
        {text && <span className="truncate text-foreground/80">{text}</span>}
        {part.results && <span className="ml-auto shrink-0 pl-2">{results.length} 条结果</span>}
      </button>
      {open && (
        <ul className="mb-1.5 ml-5 mt-0.5 space-y-0.5">
          {results.map((r, i) => (
            <li key={`${r.url}-${i}`} className="truncate text-xs">
              <a href={r.url} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground hover:underline" title={r.url}>
                {r.title || r.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
