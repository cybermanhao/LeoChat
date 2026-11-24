/**
 * 右栏（重设计 P4，按 dsh 的 ui-sidebar-right）：
 * - 每个会话一个，默认收起；会话顶栏右上角的"任务"按钮打开（有事时亮起并显示数量）；
 * - 宽屏时对话区让出位置（dsh 的 push），窄屏时覆盖在对话上方；
 * - 标签：任务（待确认、目标、收件箱、定时提醒）和工具（本会话的工具调用，选中看完整输入输出）。
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ListTodo, PanelRightClose, ShieldAlert, Wrench, X } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import type { ViewPart } from "@leochat/core/view";
import { useChatStore } from "../../stores/chat";
import { useIsMobile } from "../../lib/use-media";
import { useLayoutStore } from "../../stores/layout";
import { useDockEntry, useDockStore, type DockTab } from "../../stores/dock";
import { GoalBar } from "../chat/GoalBar";
import { QueuedBar } from "../chat/RunBanners";
import { ScheduleBar } from "../chat/ScheduleBar";
import { ToolsPanel } from "./ToolsPanel";

type ToolPart = Extract<ViewPart, { type: "tool" }>;

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

/**
 * 右栏宽度（按 dsh 的 ui-layout）：首次打开占视口 45%，之后用用户拖出来的宽度，上限 70%；
 * 给对话区至少留 400px：先把右栏缩到 300px，还不够就收起右栏。返回 null 表示放不下。
 */
export function dockWidthFor(viewport: number, row: number, preferred: number | null): number | null {
  const wanted = Math.min(Math.max(preferred ?? viewport * 0.45, MIN_DOCK), viewport * 0.7);
  const room = row - MIN_CENTER;
  if (room < MIN_DOCK) return null;
  return Math.round(Math.min(wanted, room));
}
const MIN_DOCK = 300;
const MIN_CENTER = 400;

export function RightDock({ conversationId, systemPrompt }: { conversationId: string; systemPrompt?: string }) {
  const entry = useDockEntry(conversationId);
  const setTab = useDockStore((s) => s.setTab);
  const closeDock = useDockStore((s) => s.closeDock);
  const mobile = useIsMobile();
  const open = entry.open;
  const preferred = useLayoutStore((s) => s.dockWidth);
  const setPreferred = useLayoutStore((s) => s.setDockWidth);

  // 量右栏所在这一行（对话区 + 右栏）的宽度和视口宽度
  const slotRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ viewport: number; row: number } | null>(null);
  useLayoutEffect(() => {
    const row = slotRef.current?.parentElement;
    if (!row) return;
    const measure = () => setSize({ viewport: window.innerWidth, row: row.getBoundingClientRect().width });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, []);
  const width = size ? dockWidthFor(size.viewport, size.row, preferred) : null;

  // 放不下（对话区会不足 400px）：按 dsh 收起右栏。
  // 先等一下：打开右栏会让窄屏时手动展开的侧边栏收回去（300ms 动画），收完之后多半就放得下了
  useEffect(() => {
    if (!open || mobile || !size || width !== null) return;
    const t = setTimeout(() => closeDock(conversationId), 400);
    return () => clearTimeout(t);
  }, [open, mobile, size, width, conversationId, closeDock]);

  // 手机全屏时按 Esc 关闭
  useEffect(() => {
    if (!open || !mobile) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeDock(conversationId);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, mobile, conversationId, closeDock]);

  // 拖左边缘调宽（拖动时不做过渡动画，dsh 同样）
  const [dragging, setDragging] = useState(false);
  const startDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!size || width === null) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    setDragging(true);
    const move = (ev: PointerEvent) => setPreferred(Math.round(startW + (startX - ev.clientX)));
    const up = () => {
      setDragging(false);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const tabs: Array<{ id: DockTab; label: string; icon: typeof ListTodo }> = [
    { id: "tasks", label: "任务", icon: ListTodo },
    { id: "tools", label: "工具", icon: Wrench },
  ];

  const panel = (
    <aside
      className={cn("relative flex h-full flex-col border-l border-border bg-background", mobile && "absolute inset-0 z-40 border-l-0")}
      // 手机上全屏（dsh：768px 以下全屏显示）
      style={{ width: mobile ? "100%" : (width ?? MIN_DOCK) }}
      data-testid="right-dock"
      aria-label="右栏"
    >
      {!mobile && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="调整右栏宽度"
          onPointerDown={startDrag}
          className={cn("absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize hover:bg-primary/20", dragging && "bg-primary/30")}
          data-testid="dock-resize"
        />
      )}
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
          {mobile ? <X className="h-4 w-4" /> : <PanelRightClose className="h-4 w-4" />}
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entry.tab === "tasks" ? <TasksPanel {...(systemPrompt ? { systemPrompt } : {})} /> : <ToolsPanel />}
      </div>
    </aside>
  );

  if (mobile) {
    return (
      <div ref={slotRef} className="contents">
        {open && panel}
      </div>
    );
  }
  // 对话区让出位置（dsh 的 push）；开合用和侧边栏一样的缓动，拖动时不做过渡
  const shown = open && width !== null;
  return (
    <div
      ref={slotRef}
      className={cn("h-full flex-none overflow-visible", !dragging && "transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]")}
      style={{ width: shown ? width : 0 }}
      aria-hidden={!shown}
    >
      {shown && panel}
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
