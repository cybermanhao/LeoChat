/**
 * 运行中的提示：工具审批面板（接管输入框）、排队中的消息。数据都来自 core 的视图状态（RunViewState）。
 */
import { useEffect, useRef } from "react";
import { ShieldAlert, X } from "lucide-react";
import type { InboxView } from "../../lib/agent-api";
import type { ViewPart } from "@leochat/core/view";
import { useChatStore } from "../../stores/chat";

type ToolPart = Extract<ViewPart, { type: "tool" }>;


function approvalPreview(part: ToolPart): string {
  const input = part.input as { command?: unknown } | undefined;
  if (input && typeof input.command === "string") return input.command;
  if (part.input !== undefined) return JSON.stringify(part.input, null, 2);
  return part.inputText ?? "";
}

/**
 * 等待审批的工具调用（按 dsh 的 ui-approval）：接管输入框的位置，原输入框留在下面（草稿不丢）。
 * 审批详情获得焦点后 Enter 允许、Esc 拒绝；同一个请求只接受一次回答。
 * 和 dsh 的不同：多一个"本次会话允许"——dsh 的长期权限在宿主的权限包里，LeoChat 没有，只能放这里。
 */
export function ApprovalPanel({ part, more }: { part: ToolPart; more: number }) {
  const respond = useChatStore((s) => s.respondApproval);
  const answered = useChatStore((s) => s.answeredApprovals.has(part.callId));
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    detailRef.current?.focus();
  }, [part.callId]);

  const allow = () => !answered && respond(part.callId, part.name, true);
  const reject = () => !answered && respond(part.callId, part.name, false);
  const btn =
    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="rounded-lg border border-primary/40 bg-card p-3" data-approval-id={part.callId} data-testid="approval-panel">
      <div
        ref={detailRef}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === "Enter") {
            e.preventDefault();
            allow();
          } else if (e.key === "Escape") {
            e.preventDefault();
            reject();
          }
        }}
        className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`AI 请求执行 ${part.name}：Enter 允许，Esc 拒绝`}
      >
        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
          <ShieldAlert className="h-4 w-4 text-primary" />
          AI 请求执行 <span className="font-mono">{part.name}</span>
          {more > 0 && <span className="ml-auto text-xs font-normal text-muted-foreground">还有 {more} 个等待确认</span>}
        </p>
        <pre className="mt-1.5 max-h-40 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted px-3 py-2 font-mono text-xs text-foreground">
          {approvalPreview(part)}
        </pre>
        {part.approvalReason && <p className="mt-1 text-xs text-muted-foreground">{part.approvalReason}</p>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button disabled={answered} onClick={allow} className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}>
          {answered ? "..." : "允许"}
        </button>
        <button
          disabled={answered}
          onClick={() => respond(part.callId, part.name, true, true)}
          className={`${btn} border border-primary/50 text-primary hover:bg-primary/10`}
        >
          本次会话允许
        </button>
        <button
          disabled={answered}
          onClick={reject}
          className={`${btn} border border-border text-muted-foreground hover:bg-muted hover:text-foreground`}
        >
          拒绝
        </button>
        <span className="text-xs text-muted-foreground">Enter 允许 · Esc 拒绝</span>
      </div>
    </div>
  );
}

const SOURCE_LABEL = { user: "排队", reminder: "定时提醒", goal: "目标" } as const;

/** 收件箱：还没处理的输入（插话在下一步送达；排队项在这一轮结束后处理），可撤回 */
export function QueuedBar({ inbox }: { inbox: InboxView }) {
  const withdraw = useChatStore((s) => s.withdraw);
  const rows = [
    ...inbox.nextStep.map((x) => ({ ...x, label: "插话" })),
    ...inbox.nextTurn.map((x) => ({ ...x, label: SOURCE_LABEL[x.source] })),
  ];
  if (!rows.length) return null;
  return (
    <div className="space-y-1 px-3 py-1.5" data-testid="inbox-bar">
        {rows.map((x) => (
          <div key={x.id} className="flex items-center gap-2 text-xs">
            <span className="shrink-0 rounded bg-accent px-1.5 py-0.5 text-accent-foreground">{x.label}</span>
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{x.text}</span>
            <button
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => void withdraw(x.id)}
              aria-label={`撤回：${x.text}`}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
    </div>
  );
}
