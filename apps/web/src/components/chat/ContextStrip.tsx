/**
 * 上下文条（重设计 P3，按 dsh 的 ui-goal；用户在视觉伴侣里选定"顶上一条提示"）：
 * 输入框上方只留一条，显示最重要的一项，优先级：等待审批 > 目标进行中 > 收件箱 > 定时提醒 > 已完成的目标。
 * 其余几项收在"+N"里，点开就地展开（P4 的右栏"任务"标签做好后改为打开右栏）。
 */
import { useState, type ReactNode } from "react";
import type { InboxView } from "../../lib/agent-api";
import { useChatStore } from "../../stores/chat";
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
  const [expanded, setExpanded] = useState(false);

  const goalNode = <GoalBar {...(systemPrompt ? { systemPrompt } : {})} />;
  const items: Array<{ key: string; node: ReactNode }> = [];
  if (approvals.length) items.push({ key: "approval", node: <PendingApprovalHint callIds={approvals} /> });
  if (goal && goal.phase !== "complete") items.push({ key: "goal", node: goalNode });
  if (inbox.nextStep.length + inbox.nextTurn.length > 0) items.push({ key: "inbox", node: <QueuedBar inbox={inbox} /> });
  if (hasSchedules) items.push({ key: "schedule", node: <ScheduleBar /> });
  if (goal && goal.phase === "complete") items.push({ key: "goal", node: goalNode });
  if (!items.length) return null;

  const [first, ...rest] = items;
  const open = expanded && rest.length > 0;
  return (
    <div className="flex-shrink-0 px-4 pt-2" data-testid="context-strip">
      <div className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-border bg-card">
        {open &&
          rest.map((i) => (
            <div key={i.key} className="border-b border-border">
              {i.node}
            </div>
          ))}
        <div className="flex items-center">
          <div className="min-w-0 flex-1">{first!.node}</div>
          {rest.length > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(!open)}
              aria-expanded={open}
              title={open ? "收起" : `还有 ${rest.length} 项`}
              className="mr-1.5 shrink-0 rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {open ? "收起" : `+${rest.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
