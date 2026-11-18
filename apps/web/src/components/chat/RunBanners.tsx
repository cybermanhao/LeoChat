/**
 * 运行中的横幅：工具审批、排队中的消息。数据都来自 core 的视图状态（RunViewState）。
 */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { InboxView } from "../../lib/agent-api";
import type { ViewPart } from "@leochat/core/view";
import { useChatStore } from "../../stores/chat";

type ToolPart = Extract<ViewPart, { type: "tool" }>;

/** server 端超时自动拒绝的时间（core-bridge 的 pendingApprovalAnswerer） */
const APPROVAL_TIMEOUT_S = 60;

function approvalPreview(part: ToolPart): string {
  const input = part.input as { command?: unknown } | undefined;
  if (input && typeof input.command === "string") return input.command;
  if (part.input !== undefined) return JSON.stringify(part.input, null, 2);
  return part.inputText ?? "";
}

export function ApprovalBanner({ part }: { part: ToolPart }) {
  const respond = useChatStore((s) => s.respondApproval);
  const answered = useChatStore((s) => s.answeredApprovals.has(part.callId));
  const [secondsLeft, setSecondsLeft] = useState(APPROVAL_TIMEOUT_S);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [secondsLeft]);

  const btn =
    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex-shrink-0 border-t border-primary/30 bg-primary/5 px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">
            AI 请求执行 <span className="font-mono">{part.name}</span>
          </p>
          <pre className="mt-1.5 max-h-32 overflow-y-auto whitespace-pre-wrap break-all rounded bg-muted px-3 py-2 font-mono text-xs text-foreground">
            {approvalPreview(part)}
          </pre>
          {part.approvalReason && <p className="mt-1 text-xs text-muted-foreground">{part.approvalReason}</p>}
          <p className="mt-1 text-xs text-muted-foreground">超时自动拒绝（剩余 {secondsLeft}s）</p>
        </div>
        <div className="mt-0.5 flex flex-shrink-0 gap-2">
          <button
            disabled={answered}
            onClick={() => respond(part.callId, part.name, false)}
            className={`${btn} border border-border text-muted-foreground hover:bg-muted hover:text-foreground`}
          >
            拒绝
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
            onClick={() => respond(part.callId, part.name, true)}
            className={`${btn} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            {answered ? "..." : "允许"}
          </button>
        </div>
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
    <div className="flex-shrink-0 border-t border-border bg-card px-4 py-2" data-testid="inbox-bar">
      <div className="mx-auto max-w-3xl space-y-1">
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
    </div>
  );
}
