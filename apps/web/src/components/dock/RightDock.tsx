/**
 * 右栏（重设计 P4，按 dsh 的 ui-sidebar-right）：
 * - 每个会话一个，默认收起；会话顶栏右上角的"任务"按钮打开（有事时亮起并显示数量）；
 * - 宽屏时对话区让出位置（dsh 的 push），窄屏时覆盖在对话上方；
 * - 标签：任务（待确认、目标、收件箱、定时提醒）和工具（本会话的工具调用，选中看完整输入输出）。
 */
import { useEffect, useMemo } from "react";
import { ListTodo, PanelRightClose, ShieldAlert, Wrench, X } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import type { ViewPart } from "@leochat/core/view";
import { useChatStore } from "../../stores/chat";
import { useIsMobile, useMediaQuery } from "../../lib/use-media";
import { useDockEntry, useDockStore, type DockTab } from "../../stores/dock";
import { GoalBar } from "../chat/GoalBar";
import { QueuedBar } from "../chat/RunBanners";
import { ScheduleBar } from "../chat/ScheduleBar";
import { ToolsPanel } from "./ToolsPanel";

type ToolPart = Extract<ViewPart, { type: "tool" }>;

/** 宽度不足时右栏改为覆盖（计划：1100px） */
const OVERLAY_BELOW = 1100;
export const DOCK_WIDTH = 360;

export const useIsNarrow = () => useMediaQuery(`(max-width: ${OVERLAY_BELOW - 1}px)`);

/** 等待审批的工具调用 */
function useAwaitingApproval(): ToolPart[] {
  const messages = useChatStore((s) => s.view.messages);
  return useMemo(
    () => messages.flatMap((m) => m.parts).filter((p): p is ToolPart => p.type === "tool" && p.state === "awaiting-approval"),
    [messages],
  );
}

/** "任务"按钮上的数量：待确认 + 进行中的目标 + 收件箱 + 定时提醒 */
export function useTaskCount(): number {
  const approvals = useAwaitingApproval().length;
  const goal = useChatStore((s) => (s.goal && s.goal.phase !== "complete" ? 1 : 0));
  const inbox = useChatStore((s) => s.inbox.nextStep.length + s.inbox.nextTurn.length);
  const schedules = useChatStore((s) => s.schedules.length);
  return approvals + goal + inbox + schedules;
}

export function RightDock({ conversationId, systemPrompt }: { conversationId: string; systemPrompt?: string }) {
  const entry = useDockEntry(conversationId);
  const setTab = useDockStore((s) => s.setTab);
  const closeDock = useDockStore((s) => s.closeDock);
  const narrow = useIsNarrow();
  const mobile = useIsMobile();
  const open = entry.open;

  // 窄屏覆盖时按 Esc 关闭
  useEffect(() => {
    if (!open || !narrow) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDock(conversationId);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, narrow, conversationId, closeDock]);

  const tabs: Array<{ id: DockTab; label: string; icon: typeof ListTodo }> = [
    { id: "tasks", label: "任务", icon: ListTodo },
    { id: "tools", label: "工具", icon: Wrench },
  ];

  const panel = (
    <aside
      className={cn(
        "flex h-full flex-col border-l border-border bg-background",
        narrow && "absolute inset-y-0 right-0 z-40 shadow-xl",
        mobile && "border-l-0 shadow-none",
      )}
      // 手机上全屏（dsh：768px 以下全屏显示）
      style={{ width: mobile ? "100%" : DOCK_WIDTH }}
      data-testid="right-dock"
      aria-label="右栏"
    >
      <div className="flex h-11 flex-none items-center gap-1 border-b border-border px-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={entry.tab === id}
            onClick={() => setTab(conversationId, id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm transition-colors",
              entry.tab === id ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => closeDock(conversationId)}
          title="收起右栏"
          aria-label="收起右栏"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {narrow ? <X className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entry.tab === "tasks" ? <TasksPanel {...(systemPrompt ? { systemPrompt } : {})} /> : <ToolsPanel />}
      </div>
    </aside>
  );

  if (narrow) {
    if (!open) return null;
    return (
      <>
        <div className="absolute inset-0 z-30 bg-background/60" onClick={() => closeDock(conversationId)} aria-hidden />
        {panel}
      </>
    );
  }
  // 宽屏：对话区让出位置；宽度过渡用和侧边栏一样的缓动
  return (
    <div
      className="h-full flex-none overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{ width: open ? DOCK_WIDTH : 0 }}
      aria-hidden={!open}
    >
      {open && panel}
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="border-b border-border py-2">
      <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">
        {title}
        {count !== undefined && count > 0 && <span className="ml-1">({count})</span>}
      </h3>
      {children}
    </section>
  );
}

/** 任务标签：这个会话里所有在等待或在进行的事 */
function TasksPanel({ systemPrompt }: { systemPrompt?: string }) {
  const approvals = useAwaitingApproval();
  const goal = useChatStore((s) => s.goal);
  const inbox = useChatStore((s) => s.inbox);
  const schedules = useChatStore((s) => s.schedules.length);
  const inboxCount = inbox.nextStep.length + inbox.nextTurn.length;
  const empty = !approvals.length && !goal && !inboxCount && !schedules;

  if (empty) {
    return (
      <div className="px-4 py-10 text-center text-sm text-muted-foreground" data-testid="dock-tasks-empty">
        这个会话没有进行中的任务。
        <div className="mt-2 text-xs">用 /goal 设定目标，或用 /loop 设定提醒。</div>
      </div>
    );
  }
  const jump = (callId: string) =>
    document.querySelector(`[data-approval-id="${CSS.escape(callId)}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <div data-testid="dock-tasks">
      {approvals.length > 0 && (
        <Section title="等待你确认" count={approvals.length}>
          {approvals.map((p) => (
            <button
              key={p.callId}
              type="button"
              onClick={() => jump(p.callId)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-muted"
            >
              <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate font-mono text-xs">{approvalSummary(p)}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">查看</span>
            </button>
          ))}
        </Section>
      )}
      {goal && (
        <Section title="目标">
          <GoalBar {...(systemPrompt ? { systemPrompt } : {})} />
        </Section>
      )}
      {inboxCount > 0 && (
        <Section title="收件箱" count={inboxCount}>
          <QueuedBar inbox={inbox} />
        </Section>
      )}
      {schedules > 0 && (
        <Section title="定时提醒" count={schedules}>
          <ScheduleBar />
        </Section>
      )}
    </div>
  );
}

function approvalSummary(p: ToolPart): string {
  const input = p.input as { command?: unknown } | undefined;
  return typeof input?.command === "string" ? `${p.name}: ${input.command}` : p.name;
}
