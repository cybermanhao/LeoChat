/**
 * 渲染 core 的 ViewMessage（@leochat/core/view）：按 parts 顺序显示文字 / 推理 / 工具 / 联网搜索 / 图片 / 文件。
 * 取代旧的 contentItems 渲染。
 */
import { memo, useMemo, useState, type ReactNode } from "react";
import { ChevronRight, Globe, Loader2, Paperclip, ExternalLink, Target, AlarmClock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage, LeoCardView, ToolCallBlock, cn, type ToolCallStatus } from "@ai-chatbox/ui";
import { normalizeLeoCard, type LeoCard, type LeoCardAction } from "@ai-chatbox/shared";
import type { ToolPartState, ViewMessage, ViewPart } from "@leochat/core/view";
import type { CardsHint, Citation } from "@leochat/core";
import { toolOutputText } from "../../stores/chat-generation";

type ToolPart = Extract<ViewPart, { type: "tool" }>;

const TOOL_STATUS: Record<ToolPartState, ToolCallStatus> = {
  "input-streaming": "pending",
  "input-available": "pending",
  "awaiting-approval": "pending",
  running: "running",
  "output-available": "success",
  "output-error": "error",
  denied: "error",
};

/** 工具参数：优先用解析好的 input，否则尝试解析原始字符串 */
function toolArgs(p: ToolPart): Record<string, unknown> | undefined {
  if (p.input && typeof p.input === "object") return p.input as Record<string, unknown>;
  if (!p.inputText) return undefined;
  try {
    const v = JSON.parse(p.inputText) as unknown;
    return v && typeof v === "object" ? (v as Record<string, unknown>) : { raw: p.inputText };
  } catch {
    return { raw: p.inputText };
  }
}

/** 旧 MCP 服务返回的 LeoCard（JSON 文本或 MCP content[] 包装） */
function leoCardFrom(text: string): LeoCard | null {
  if (!text || !text.trimStart().startsWith("{")) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const direct = normalizeLeoCard(value);
  if (direct) return direct;
  const content = (value as { content?: unknown }).content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === "object" && (item as { type?: unknown }).type === "text") {
        const inner = normalizeLeoCard((item as { text: string }).text);
        if (inner) return inner;
      }
    }
  }
  return null;
}

const ToolPartView = memo(function ToolPartView({ part, onCardAction }: { part: ToolPart; onCardAction?: (a: LeoCardAction) => void }) {
  const text = useMemo(() => toolOutputText(part.output), [part.output]);
  const card = useMemo(() => (part.state === "output-available" ? leoCardFrom(text) : null), [part.state, text]);
  const args = useMemo(() => toolArgs(part), [part.input, part.inputText]);
  const status = TOOL_STATUS[part.state];
  return (
    <>
      <div className="px-2 py-1">
        <ToolCallBlock
          id={part.callId}
          name={part.name}
          status={status}
          arguments={args}
          result={status === "success" ? text : undefined}
          error={part.state === "denied" ? "已拒绝" : status === "error" ? text || "Tool execution failed" : undefined}
          duration={part.ms}
        />
      </div>
      {card && (
        <div className="px-4 py-2">
          <LeoCardView card={card} onAction={onCardAction} />
        </div>
      )}
      {part.ui?.type === "cards" && <CardsHintView hint={part.ui} />}
    </>
  );
});

/** core 的声明式卡片（UiHint "cards"） */
function CardsHintView({ hint }: { hint: CardsHint }) {
  return (
    <div className="space-y-2 px-4 py-2">
      {hint.label && <p className="text-xs text-muted-foreground">{hint.label}</p>}
      {hint.cards.map((c, i) => (
        <div key={c.id ?? i} className="rounded-lg border border-border bg-card p-3 text-card-foreground">
          <div className="text-sm font-medium">{c.href ? <a href={c.href} target="_blank" rel="noreferrer" className="hover:underline">{c.title}</a> : c.title}</div>
          {c.subtitle && <div className="text-xs text-muted-foreground">{c.subtitle}</div>}
          {c.lines?.map((l, j) => (
            <div key={j} className="mt-1 text-xs text-muted-foreground">{l}</div>
          ))}
          {c.note && <div className="mt-1 text-xs italic text-muted-foreground">{c.note}</div>}
        </div>
      ))}
    </div>
  );
}

function ReasoningView({ text, streaming }: { text: string; streaming: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-4 pt-2">
      <div className="-mx-2">
        <button
          onClick={() => setOpen(!open)}
          className="flex w-full items-center gap-1.5 rounded px-2 py-1 transition-colors hover:bg-accent"
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
          <span className="text-xs opacity-60">思考过程</span>
          <span className="flex-1" />
          {streaming ? <Loader2 className="h-3 w-3 animate-spin opacity-50" /> : <span className="text-[10px] opacity-50">思考完成</span>}
        </button>
        {open && <div className="mt-1 whitespace-pre-wrap rounded bg-background/50 px-2 py-2 text-xs opacity-70">{text}</div>}
      </div>
    </div>
  );
}

function Sources({ items }: { items: Array<{ url: string; title?: string }> }) {
  const unique = items.filter((c, i) => items.findIndex((d) => d.url === c.url) === i);
  if (!unique.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 px-4 pb-2">
      {unique.map((c, i) => (
        <a
          key={c.url}
          href={c.url}
          target="_blank"
          rel="noreferrer"
          title={c.url}
          className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded border border-border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <span className="text-primary">{i + 1}</span>
          <span className="truncate">{c.title || new URL(c.url).hostname}</span>
          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
        </a>
      ))}
    </div>
  );
}

function ServerToolView({ part }: { part: Extract<ViewPart, { type: "server_tool" }> }) {
  const query = (part.input as { query?: unknown } | undefined)?.query;
  return (
    <div className="px-4 py-1">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {part.results ? <Globe className="h-3 w-3" /> : <Loader2 className="h-3 w-3 animate-spin" />}
        <span>{part.name === "web_search" ? "联网搜索" : part.name}</span>
        {typeof query === "string" && <span className="truncate text-foreground">“{query}”</span>}
        {part.results && <span>· {part.results.length} 条结果</span>}
      </div>
    </div>
  );
}

/** 目标驱动生成的每轮提示（<goal_round>，见 core 的 renderGoalRoundPrompt），显示成"第 N 轮"而不是整段提示词 */
export function goalRoundOf(m: ViewMessage): { round: number; maxRounds: number } | null {
  if (m.role !== "user") return null;
  const first = m.parts[0];
  if (first?.type !== "text" || !first.text.startsWith("<goal_round>")) return null;
  const r = /Round: (\d+)\/(\d+)/.exec(first.text);
  return r ? { round: Number(r[1]), maxRounds: Number(r[2]) } : null;
}

/** 定时提醒消息（server 的 renderReminder）："[定时提醒]" 开头，正文在第一个空行之后 */
export function reminderOf(text: string): { prompt: string } | null {
  if (!text.startsWith("[定时提醒]")) return null;
  const i = text.indexOf("\n\n");
  return { prompt: i >= 0 ? text.slice(i + 2) : text.slice("[定时提醒]".length).trim() };
}

function UserText({ text }: { text: string }) {
  const reminder = reminderOf(text);
  if (!reminder) return <div className="whitespace-pre-wrap text-sm">{text}</div>;
  return (
    <div className="text-sm" data-reminder>
      <div className="mb-1 inline-flex items-center gap-1 rounded bg-primary-foreground/15 px-1.5 py-0.5 text-xs">
        <AlarmClock className="h-3 w-3" />
        定时提醒
      </div>
      <div className="whitespace-pre-wrap">{reminder.prompt}</div>
    </div>
  );
}

export interface ViewMessageItemProps {
  message: ViewMessage;
  /** 这条消息是否还在生成（显示占位光标） */
  isStreaming: boolean;
  renderText: (text: string, streaming: boolean) => ReactNode;
  actions?: ReactNode;
  onCardAction?: (a: LeoCardAction) => void;
}

/** 消息里所有文字（复制按钮用） */
export function messageText(m: ViewMessage): string {
  return m.parts
    .filter((p): p is Extract<ViewPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n\n");
}

export const ViewMessageItem = memo(function ViewMessageItem({ message, isStreaming, renderText, actions, onCardAction }: ViewMessageItemProps) {
  const isUser = message.role === "user";
  const goalRound = goalRoundOf(message);
  if (goalRound) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground" data-message-id={message.id} data-goal-round={goalRound.round}>
        <div className="h-px flex-1 bg-border" />
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5">
          <Target className="h-3 w-3 text-primary" />
          目标 · 第 {goalRound.round}/{goalRound.maxRounds} 轮
        </span>
        <div className="h-px flex-1 bg-border" />
      </div>
    );
  }
  const citations: Citation[] = message.parts.flatMap((p) => (p.type === "text" && p.citations ? p.citations : []));
  const hasVisible = message.parts.some((p) => (p.type === "text" ? p.text.length > 0 : true));

  return (
    <div className={cn("group flex gap-3 py-4", isUser && "flex-row-reverse")} data-message-id={message.id}>
      <Avatar className="h-8 w-8 shrink-0">
        {isUser ? (
          <>
            <AvatarImage src="/user-avatar.png" alt="User" />
            <AvatarFallback className="bg-primary text-xs text-primary-foreground">U</AvatarFallback>
          </>
        ) : (
          <>
            <AvatarImage src="/ai-avatar.png" alt="AI" />
            <AvatarFallback className="bg-secondary text-xs text-secondary-foreground">AI</AvatarFallback>
          </>
        )}
      </Avatar>

      <div className={cn("flex max-w-[80%] flex-col gap-2", isUser && "items-end")}>
        <div className={cn("overflow-hidden rounded-lg", isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
          {actions && !isUser && <div className="px-4 pt-2">{actions}</div>}

          {message.parts.map((p, i) => {
            switch (p.type) {
              case "text":
                if (!p.text) return null;
                return (
                  <div key={i} className="px-4 py-2">
                    {isUser ? <UserText text={p.text} /> : renderText(p.text, p.streaming)}
                  </div>
                );
              case "reasoning":
                return <ReasoningView key={i} text={p.text} streaming={p.streaming} />;
              case "tool":
                return <ToolPartView key={p.callId} part={p} onCardAction={onCardAction} />;
              case "server_tool":
                return <ServerToolView key={p.callId} part={p} />;
              case "image":
                return p.block.source.kind === "file_id" ? (
                  <div key={i} className="flex items-center gap-1.5 px-4 py-2 text-xs opacity-70"><Paperclip className="h-3 w-3" />图片</div>
                ) : (
                  <div key={i} className="px-4 py-2">
                    <img
                      alt=""
                      className="max-h-64 rounded"
                      src={p.block.source.kind === "url" ? p.block.source.value : `data:${p.block.source.mediaType ?? "image/png"};base64,${p.block.source.value}`}
                    />
                  </div>
                );
              case "file":
                return (
                  <div key={i} className="flex items-center gap-1.5 px-4 py-2 text-xs opacity-70">
                    <Paperclip className="h-3 w-3" />
                    {p.block.filename ?? p.block.fileId}
                  </div>
                );
              case "custom":
                return null;
            }
          })}

          {citations.length > 0 && <Sources items={citations} />}

          {!hasVisible && isStreaming && (
            <div className="px-4 py-2">
              <span className="inline-block h-4 w-2 animate-pulse bg-current/30" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
