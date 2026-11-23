/**
 * 一个回合（重设计 P2，参考 dsh / Codex）：
 *   用户消息：右侧浅色气泡
 *   过程：运行时展开的时间线，结束后收成一行（ProcessTimeline）
 *   工具给用户看的卡片：始终可见
 *   最终回答：无底卡、全宽；来源是末尾一排编号小标签
 *   操作（复制……）：悬停时出现
 */
import { memo, useMemo, useState, type ReactNode } from "react";
import { AlarmClock, Check, Copy, Paperclip, PencilLine, Target } from "lucide-react";
import { LeoCardView, cn } from "@ai-chatbox/ui";
import { normalizeLeoCard, type LeoCard, type LeoCardAction } from "@ai-chatbox/shared";
import type { CardsHint, Citation } from "@leochat/core";
import type { ViewMessage, ViewPart } from "@leochat/core/view";
import { toolOutputText } from "../../../stores/chat-generation";
import { ProcessTimeline } from "./ProcessTimeline";
import { answerText, goalRoundOf, reminderOf, splitTurn, type ToolPart, type Turn } from "./group";

export interface TurnViewProps {
  turn: Turn;
  /** 这个回合是否还在进行 */
  running: boolean;
  detailed: boolean;
  /** 最后一个回合非正常结束时的说明（已停止 / 出错） */
  endLabel?: string;
  renderText: (text: string, streaming: boolean) => ReactNode;
  onCardAction?: (a: LeoCardAction) => void;
  /** 把用户消息放回输入框（编辑后重发） */
  onEditUser?: (text: string) => void;
}

export const TurnView = memo(function TurnView({ turn, running, detailed, endLabel, renderText, onCardAction, onEditUser }: TurnViewProps) {
  const split = useMemo(() => splitTurn(turn.assistant), [turn.assistant]);
  const artifacts = useMemo(
    () => split.process.flatMap((i) => (i.type === "tool" && i.part.state === "output-available" ? [i.part] : [])),
    [split.process],
  );
  const hasAnswer = split.answer.some((p) => (p.type === "text" ? p.text.length > 0 : true));
  const text = answerText(split);
  const showAssistant = turn.assistant.length > 0 || running;

  return (
    <div className="space-y-3" data-turn={turn.key}>
      {turn.user && <UserMessage message={turn.user} onEdit={running ? undefined : onEditUser} />}
      {showAssistant && (
        <div className="group/turn" {...(turn.assistant[0] ? { "data-message-id": turn.assistant[0].id } : {})}>
          <ProcessTimeline items={split.process} running={running} detailed={detailed} endLabel={endLabel} renderNote={renderText} />
          {artifacts.map((p) => (
            <ToolArtifact key={p.callId} part={p} onCardAction={onCardAction} />
          ))}
          {split.answer.map((p, i) => (
            <AnswerPart key={i} part={p} renderText={renderText} streaming={running} />
          ))}
          {!hasAnswer && running && !split.process.length && (
            <span className="inline-block h-4 w-2 animate-pulse bg-foreground/30" aria-label="正在生成" />
          )}
          {split.citations.length > 0 && <Sources items={split.citations} />}
          {!running && text && (
            <div className="mt-1 flex h-7 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/turn:opacity-100">
              <CopyButton text={text} />
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function AnswerPart({ part, renderText, streaming }: { part: ViewPart; renderText: TurnViewProps["renderText"]; streaming: boolean }) {
  switch (part.type) {
    case "text":
      return part.text ? <div className="text-sm leading-relaxed">{renderText(part.text, streaming && part.streaming)}</div> : null;
    case "image":
      return part.block.source.kind === "file_id" ? (
        <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground"><Paperclip className="h-3 w-3" />图片</div>
      ) : (
        <img
          alt=""
          className="my-2 max-h-64 rounded"
          src={part.block.source.kind === "url" ? part.block.source.value : `data:${part.block.source.mediaType ?? "image/png"};base64,${part.block.source.value}`}
        />
      );
    case "file":
      return (
        <div className="flex items-center gap-1.5 py-1 text-xs text-muted-foreground">
          <Paperclip className="h-3 w-3" />
          {part.block.filename ?? part.block.fileId}
        </div>
      );
    default:
      return null;
  }
}

function UserMessage({ message, onEdit }: { message: ViewMessage; onEdit?: (text: string) => void }) {
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
  const text = message.parts.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("\n\n");
  const reminder = reminderOf(text);
  return (
    <div className="group/user flex flex-col items-end gap-1" data-message-id={message.id}>
      <div className="max-w-[85%] rounded-2xl bg-muted px-4 py-2 text-sm text-foreground">
        {reminder ? (
          <div data-reminder>
            <div className="mb-1 inline-flex items-center gap-1 rounded bg-background/60 px-1.5 py-0.5 text-xs text-muted-foreground">
              <AlarmClock className="h-3 w-3" />
              定时提醒
            </div>
            <div className="whitespace-pre-wrap">{reminder.prompt}</div>
          </div>
        ) : (
          text && <div className="whitespace-pre-wrap break-words">{text}</div>
        )}
        {message.parts.map((p, i) =>
          p.type === "image" || p.type === "file" ? (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3" />
              {p.type === "file" ? (p.block.filename ?? p.block.fileId) : "图片"}
            </div>
          ) : null,
        )}
      </div>
      {!reminder && text && (
        <div className="flex h-6 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/user:opacity-100">
          <CopyButton text={text} />
          {onEdit && (
            <ActionButton label="编辑后重发" onClick={() => onEdit(text)}>
              <PencilLine className="h-3.5 w-3.5" />
            </ActionButton>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ActionButton
      label={copied ? "已复制" : "复制"}
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </ActionButton>
  );
}

/** 来源：正文末尾一排编号小标签，悬停显示标题和域名 */
function Sources({ items }: { items: Citation[] }) {
  const unique = items.filter((c, i) => items.findIndex((d) => d.url === c.url) === i);
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {unique.map((c, i) => {
        const host = hostOf(c.url);
        return (
          <a
            key={c.url}
            href={c.url}
            target="_blank"
            rel="noreferrer"
            title={c.title ? `${c.title}\n${host}` : c.url}
            className="inline-flex max-w-[12rem] items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <span className="text-primary">{i + 1}</span>
            <span className="truncate">{host}</span>
          </a>
        );
      })}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// ── 工具给用户看的卡片（旧 MCP 服务的 LeoCard、core 的 cards 提示） ─────────────────

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

const ToolArtifact = memo(function ToolArtifact({ part, onCardAction }: { part: ToolPart; onCardAction?: (a: LeoCardAction) => void }) {
  const card = useMemo(() => leoCardFrom(toolOutputText(part.output)), [part.output]);
  if (!card && part.ui?.type !== "cards") return null;
  return (
    <div className="mb-2">
      {card && <LeoCardView card={card} onAction={onCardAction} />}
      {part.ui?.type === "cards" && <CardsHintView hint={part.ui} />}
    </div>
  );
});

/** core 的声明式卡片（UiHint "cards"） */
function CardsHintView({ hint }: { hint: CardsHint }) {
  return (
    <div className="space-y-2">
      {hint.label && <p className="text-xs text-muted-foreground">{hint.label}</p>}
      {hint.cards.map((c, i) => (
        <div key={c.id ?? i} className={cn("rounded-lg border border-border bg-card p-3 text-card-foreground")}>
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
