/**
 * 上下文条（重设计 P3，按 dsh 的 ui-goal；用户在视觉伴侣里选定"顶上一条提示"）：
 * 输入框上方只留一条，显示最重要的一项，优先级：等待审批 > 目标进行中 > 收件箱 > 定时提醒 > 已完成的目标。
 * 其余几项收在"+N"里，点开右栏的"任务"标签（P4）。
 */
import type { ReactNode } from "react";
import type { InboxView } from "../../lib/agent-api";
import { useChatStore } from "../../stores/chat";
import { useDockStore } from "../../stores/dock";
import { GoalBar } from "./GoalBar";
import { PendingApprovalHint, QueuedBar } from "./RunBanners";
import { ScheduleBar } from "./ScheduleBar";

export interface ContextStripProps {
  /** 等待审批的工具调用 id */
  approvals: string[];
  inbox: InboxView;
  /** 继续目标时用的系统提示 */
  systemPrompt?: string;
}

export function ContextStrip({ approvals, inbox, systemPrompt }: ContextStripProps) {
  const goal = useChatStore((s) => s.goal);
  const hasSchedules = useChatStore((s) => s.schedules.length > 0);
  const conversationId = useChatStore((s) => s.currentConversationId);
  const openDock = useDockStore((s) => s.openDock);

  const goalNode = <GoalBar {...(systemPrompt ? { systemPrompt } : {})} />;
  const items: Array<{ key: string; node: ReactNode }> = [];
  if (approvals.length) items.push({ key: "approval", node: <PendingApprovalHint callIds={approvals} /> });
  if (goal && goal.phase !== "complete") items.push({ key: "goal", node: goalNode });
  if (inbox.nextStep.length + inbox.nextTurn.length > 0) items.push({ key: "inbox", node: <QueuedBar inbox={inbox} /> });
  if (hasSchedules) items.push({ key: "schedule", node: <ScheduleBar /> });
  if (goal && goal.phase === "complete") items.push({ key: "goal", node: goalNode });
  if (!items.length) return null;

  const [first, ...rest] = items;
  return (
    <div className="flex-shrink-0 px-4 pt-2" data-testid="context-strip">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center">
          <div className="min-w-0 flex-1">{first!.node}</div>
          {rest.length > 0 && conversationId && (
            <button
              type="button"
              onClick={() => openDock(conversationId, "tasks")}
              title={`还有 ${rest.length} 项，在右栏"任务"里查看`}
              className="mr-1.5 shrink-0 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              +{rest.length}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
