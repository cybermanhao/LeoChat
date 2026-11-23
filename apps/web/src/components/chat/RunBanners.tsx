/**
 * 运行中的提示：工具审批卡片、排队中的消息。数据都来自 core 的视图状态（RunViewState）。
 */
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

/** 等待审批的工具调用：在回合的过程时间线里就地显示（重设计 P2，取代输入框上方的横幅） */
export function ApprovalCard({ part }: { part: ToolPart }) {
  const respond = useChatStore((s) => s.respondApproval);
  const answered = useChatStore((s) => s.answeredApprovals.has(part.callId));

  const btn =
    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="my-1.5 rounded-lg border border-primary/40 bg-primary/5 p-3" data-approval-id={part.callId}>
      <p className="text-sm font-medium text-foreground">
        AI 请求执行 <span className="font-mono">{part.name}</span>
      </p>
      <pre className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted px-3 py-2 font-mono text-xs text-foreground">
        {approvalPreview(part)}
      </pre>
      {part.approvalReason && <p className="mt-1 text-xs text-muted-foreground">{part.approvalReason}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          disabled={answered}
          onClick={() => respond(part.callId, part.name, true)}
          className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}
        >
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
          onClick={() => respond(part.callId, part.name, false)}
          className={`${btn} border border-border text-muted-foreground hover:bg-muted hover:text-foreground`}
        >
          拒绝
        </button>
        <span className="text-xs text-muted-foreground">不想执行就拒绝，点停止会取消这一轮</span>
      </div>
    </div>
  );
}

/** 输入框上方的提示：有操作等待确认，点一下滚到对应的审批卡片 */
export function PendingApprovalHint({ callIds }: { callIds: string[] }) {
  if (!callIds.length) return null;
  const jump = () =>
    document.querySelector(`[data-approval-id="${CSS.escape(callIds[0]!)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  return (
    <button
      type="button"
      onClick={jump}
      className="flex w-full items-center gap-2 bg-primary/5 px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-primary/10"
      data-testid="approval-hint"
    >
      <ShieldAlert className="h-3.5 w-3.5 text-primary" />
      有 {callIds.length} 个操作等待你确认
      <span className="ml-auto text-muted-foreground">查看</span>
    </button>
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
