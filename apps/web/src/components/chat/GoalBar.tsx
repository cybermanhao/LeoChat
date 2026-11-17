/**
 * 目标条（/goal）：显示当前目标、状态、第几轮，以及暂停 / 继续 / 完成 / 清除。
 * 数据来自 store 的 goal（server 推送的 custom goal 事件）。
 */
import { useState } from "react";
import { Target, Pause, Play, Check, X, Loader2 } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import type { Goal } from "@leochat/core";
import { useChatStore } from "../../stores/chat";

const PHASE_LABEL: Record<Goal["phase"], string> = {
  active: "进行中",
  paused: "已暂停",
  blocked: "卡住了",
  complete: "已完成",
};

/** 轮数用完后"继续"时追加的轮数 */
const EXTRA_ROUNDS = 20;

export function GoalBar({ systemPrompt }: { systemPrompt?: string }) {
  const goal = useChatStore((s) => s.goal);
  const attached = useChatStore((s) => s.goalAttached);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const pauseGoal = useChatStore((s) => s.pauseGoal);
  const resumeGoal = useChatStore((s) => s.resumeGoal);
  const completeGoal = useChatStore((s) => s.completeGoal);
  const clearGoal = useChatStore((s) => s.clearGoal);
  const [busy, setBusy] = useState(false);
  if (!goal) return null;

  const act = (fn: () => Promise<void>) => async () => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const roundsLeft = goal.maxRounds - goal.roundsStarted;
  const running = attached && goal.phase === "active";
  // active 但没有驱动在跑：进程重启后不会自己继续（dsh 的规则），要用户点继续
  const canContinue = !isGenerating && goal.phase !== "complete";
  const btn =
    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex-shrink-0 border-t border-border bg-card px-4 py-2" data-testid="goal-bar">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <Target className={cn("h-4 w-4 shrink-0", goal.phase === "complete" ? "text-muted-foreground" : "text-primary")} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={cn(
                "rounded px-1.5 py-0.5 font-medium",
                goal.phase === "active" && "bg-primary/10 text-primary",
                goal.phase === "blocked" && "bg-accent text-accent-foreground",
                (goal.phase === "paused" || goal.phase === "complete") && "bg-muted text-muted-foreground",
              )}
            >
              {running ? (
                <span className="inline-flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {PHASE_LABEL.active}
                </span>
              ) : goal.phase === "active" ? (
                "待继续"
              ) : (
                PHASE_LABEL[goal.phase]
              )}
            </span>
            <span className="text-muted-foreground">
              第 {goal.roundsStarted}/{goal.maxRounds} 轮
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm text-foreground" title={goal.objective}>
            {goal.objective}
          </p>
          {goal.blocker && <p className="mt-0.5 truncate text-xs text-muted-foreground" title={goal.blocker.reason}>{goal.blocker.reason}</p>}
        </div>
        <div className="flex shrink-0 gap-1">
          {running && (
            <button className={cn(btn, "border border-border text-muted-foreground hover:bg-muted hover:text-foreground")} disabled={busy} onClick={act(pauseGoal)}>
              <Pause className="h-3 w-3" />
              暂停
            </button>
          )}
          {canContinue && (
            <button
              className={cn(btn, "bg-primary text-primary-foreground hover:bg-primary/90")}
              disabled={busy}
              onClick={act(() => resumeGoal({ ...(roundsLeft <= 0 ? { extraRounds: EXTRA_ROUNDS } : {}), ...(systemPrompt ? { systemPrompt } : {}) }))}
              title={roundsLeft <= 0 ? `轮数已用完，继续会再加 ${EXTRA_ROUNDS} 轮` : undefined}
            >
              <Play className="h-3 w-3" />
              {roundsLeft <= 0 ? `再给 ${EXTRA_ROUNDS} 轮` : "继续"}
            </button>
          )}
          {goal.phase !== "complete" && !running && (
            <button className={cn(btn, "border border-border text-muted-foreground hover:bg-muted hover:text-foreground")} disabled={busy} onClick={act(completeGoal)} title="手动标记为已完成">
              <Check className="h-3 w-3" />
              完成
            </button>
          )}
          {!running && (
            <button className={cn(btn, "text-muted-foreground hover:bg-muted hover:text-foreground")} disabled={busy} onClick={act(clearGoal)} title="清除目标（对话记录保留）">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
