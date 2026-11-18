/**
 * 生成相关的状态（harness 第三期：会话收件箱）。
 * 输入都发到 server 的会话收件箱（立即返回），server 上每个会话一个处理者按顺序跑；
 * 每个打开的会话一条事件流：reset（重建视图）、agent（运行状态）、inbox、goal，以及运行事件（交给 core 的 reduce()）。
 */
import type { AgentEvent, Message } from "@leochat/core";
import { initialViewState, reduce } from "@leochat/core/view";
import { processToolResultForUICommands, executeUICommand } from "../lib/ui-commands";
import type { CommandName } from "../lib/ui-commands";
import { LEO_ACTION_EVENT } from "../lib/card-events";
import { handleApiError } from "../lib/api-error";
import { agentApi, type GoalAction, type GoalView, type InboxView, type RunSettings } from "../lib/agent-api";
import { chatApi } from "../lib/api";
import { sendOSNotification } from "../lib/os-notification";
import { showToast } from "./toast";
import type { ChatState, GenerationSlice, SliceCreator } from "./chat-types";

/** 工具输出里的文字（UI 命令、卡片都从这里解析） */
export function toolOutputText(output: { content?: unknown } | undefined): string {
  const content = output?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b): b is { type: "text"; text: string } => !!b && typeof b === "object" && (b as { type?: unknown }).type === "text")
    .map((b) => b.text)
    .join("");
}

const isElectron = () => typeof window !== "undefined" && !!(window as unknown as { electronAPI?: unknown }).electronAPI;

const KNOWN_COMMANDS: ReadonlySet<string> = new Set<CommandName>([
  "update_theme", "show_notification", "show_confirm",
  "open_panel", "close_panel", "copy_to_clipboard",
  "open_url", "scroll_to_message", "set_input", "send_message", "resize_window",
]);

/** 事件流断线后多久重连 */
const RECONNECT_MS = 2_000;
export const EMPTY_INBOX: InboxView = { nextTurn: [], nextStep: [] };

/** 从当前设置组装运行设置（发消息、目标、定时提醒共用） */
export function runSettings(s: ChatState, systemPrompt?: string): RunSettings {
  return {
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(s.currentModel ? { model: s.currentModel } : {}),
    provider: s.currentProvider,
    maxSteps: s.unlimitedEpochs ? 1000 : s.maxEpochs,
    temperature: s.temperature,
    tools: s.mcpTools.map((t) => t.name),
    ...(s.webSearch ? { webSearch: true } : {}),
    host: isElectron() ? "electron" : "web",
    ...(s.permission === "full" ? { permission: "full" as const } : {}),
  };
}

export const createGenerationSlice: SliceCreator<GenerationSlice> = (set, get) => {
  /** 当前事件流连接 */
  let conn: { id: string; ctl: AbortController } | null = null;
  /** 当前这一轮是不是目标轮次（完成通知用） */
  let goalTurn = false;

  /** 处理事件流里的一条事件 */
  const handle = (e: AgentEvent) => {
    if (e.type === "custom") {
      switch (e.name) {
        case "reset":
          set({ view: initialViewState((e.data as { transcript: Message[] }).transcript) });
          return;
        case "agent": {
          const { running, source } = e.data as { running: boolean; source: string | null };
          const was = get().isGenerating;
          if (running) goalTurn = source === "goal";
          set({ isGenerating: running, ...(running && !was ? { answeredApprovals: new Set<string>() } : {}) });
          // 模型可能用 schedule_create / schedule_delete 改了提醒，一次性提醒也可能已结束
          if (was && !running) void get().refreshSchedules();
          return;
        }
        case "inbox":
          set({ inbox: e.data as InboxView });
          return;
        case "goal": {
          const goal = (e.data ?? null) as GoalView | null;
          const prev = get().goal;
          set({ goal });
          if (goal && prev && prev.id === goal.id && prev.phase !== goal.phase && (goal.phase === "complete" || goal.phase === "blocked")) {
            sendOSNotification("LeoChat", goal.phase === "complete" ? "目标已完成" : "目标卡住了，需要你处理");
          }
          return;
        }
        case "ui_command": {
          // server 的进程内界面工具（主题、通知、剪贴板……）
          const { command, payload } = (e.data ?? {}) as { command?: string; payload?: Record<string, unknown> };
          if (command && KNOWN_COMMANDS.has(command)) {
            Promise.resolve(
              executeUICommand({ __ui_command__: true, command: command as CommandName, payload: (payload ?? {}) as never }),
            ).catch((err) => console.warn("[UICommand]", err));
          }
          return;
        }
        case "goal_round":
        case "ping":
          return;
      }
    }
    set((s) => ({ view: reduce(s.view, e) }));
    switch (e.type) {
      case "approval_request":
        if (get().sessionAllowedTools.has(e.toolName)) {
          chatApi.approveToolCall(e.callId, true).catch((err) => console.warn("[sessionAllow]", err));
        }
        break;
      case "tool_end":
        // 第三方 MCP 服务仍可能在工具结果里返回 __ui_command__ JSON
        if (e.ok) processToolResultForUICommands(toolOutputText(e.output)).catch((err) => console.warn("[UICommand]", err));
        break;
      case "error":
        handleApiError(e.error.message, get().currentProvider);
        break;
      case "run_end":
        if (e.result.reason === "completed" && !goalTurn) sendOSNotification("LeoChat", "AI 回复完成");
        break;
    }
  };

  /** 确保有当前会话（没有就在 server 上新建并连上） */
  async function ensureConversation(): Promise<string | null> {
    const current = get().currentConversationId;
    if (current) return current;
    try {
      const meta = await agentApi.createConversation();
      set((s) => ({ conversations: [meta, ...s.conversations], currentConversationId: meta.id }));
      get().connect(meta.id);
      return meta.id;
    } catch (e) {
      console.error("[chat] create conversation failed", e);
      handleApiError(e instanceof Error ? e.message : String(e), get().currentProvider);
      return null;
    }
  }

  async function post(content: string, target: "next-turn" | "next-step", systemPrompt?: string) {
    const text = content.trim();
    if (!text) return;
    const id = await ensureConversation();
    if (!id) return;
    set((s) => ({
      input: "",
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title: c.title || text.replace(/\s+/g, " ").slice(0, 40), updatedAt: Date.now() } : c,
      ),
    }));
    try {
      await agentApi.sendMessage(id, { text: content, target, settings: runSettings(get(), systemPrompt) });
    } catch (e) {
      console.error("[chat] send failed", e);
      set({ input: content }); // 没送出去：放回输入框
      handleApiError(e instanceof Error ? e.message : String(e), get().currentProvider);
    }
  }

  /**
   * 修改目标（用户操作）。失败多半是 revision 过期（server 刚开始了新的一轮）：重新读一次；
   * 暂停 / 继续 / 完成 / 清除的意图不依赖旧状态，用新的 revision 再试一次；编辑（改数据）不重试
   */
  async function updateGoal(action: GoalAction, extra: { maxRounds?: number; systemPrompt?: string } = {}, retry = true): Promise<boolean> {
    const id = get().currentConversationId;
    const goal = get().goal;
    if (!id || !goal) return false;
    try {
      const r = await agentApi.updateGoal(id, {
        action,
        revision: goal.revision,
        ...(extra.maxRounds !== undefined ? { maxRounds: extra.maxRounds } : {}),
        ...(action === "resume" ? { settings: runSettings(get(), extra.systemPrompt) } : {}),
      });
      if (get().currentConversationId === id) set({ goal: r.goal ? { ...r.goal, armed: r.armed } : null });
      return true;
    } catch (e) {
      console.warn("[goal]", e);
      const fresh = await agentApi.getGoal(id).catch(() => null);
      if (!fresh || get().currentConversationId !== id) return false;
      set({ goal: fresh.goal ? { ...fresh.goal, armed: fresh.armed } : null });
      if (retry && action !== "edit" && fresh.goal && fresh.goal.revision !== goal.revision) return updateGoal(action, extra, false);
      return false;
    }
  }

  return {
    isGenerating: false,
    sessionAllowedTools: new Set<string>(),
    answeredApprovals: new Set<string>(),

    connect: (id) => {
      if (conn?.id === id && !conn.ctl.signal.aborted) return;
      conn?.ctl.abort();
      conn = null;
      set({ isGenerating: false, inbox: EMPTY_INBOX });
      if (!id) return;
      const ctl = new AbortController();
      conn = { id, ctl };
      void (async () => {
        while (!ctl.signal.aborted) {
          try {
            for await (const e of agentApi.events(id, ctl.signal)) {
              if (ctl.signal.aborted || get().currentConversationId !== id) return;
              handle(e);
            }
          } catch {
            /* 断线：稍后重连；重连时的 reset 会重建视图 */
          }
          if (ctl.signal.aborted) return;
          await new Promise((r) => setTimeout(r, RECONNECT_MS));
        }
      })();
    },

    sendMessage: (content, systemPrompt) => post(content, get().isGenerating ? "next-step" : "next-turn", systemPrompt),

    queueFollowUp: (content, systemPrompt) => post(content, "next-turn", systemPrompt),

    withdraw: async (itemId) => {
      const id = get().currentConversationId;
      if (id) await agentApi.withdraw(id, itemId).catch((e) => console.warn("[withdraw]", e));
    },

    cancelGeneration: () => {
      const id = get().currentConversationId;
      if (id) agentApi.stop(id).catch((e) => console.warn("[stop]", e));
    },

    startGoal: async (objective, opts = {}) => {
      const text = objective.trim();
      if (!text) return;
      const id = await ensureConversation();
      if (!id) return;
      try {
        const r = await agentApi.createGoal(id, {
          objective: text,
          ...(opts.maxRounds ? { maxRounds: opts.maxRounds } : {}),
          settings: runSettings(get(), opts.systemPrompt),
        });
        set((s) => ({
          goal: { ...r.goal, armed: r.armed },
          input: "",
          conversations: s.conversations.map((c) => (c.id === id && !c.title ? { ...c, title: `目标：${text.slice(0, 36)}` } : c)),
        }));
      } catch (e) {
        console.warn("[goal] create failed", e);
        showToast("已有未完成的目标：先完成、暂停或清除它", "destructive");
      }
    },

    pauseGoal: async () => {
      await updateGoal("pause");
    },

    resumeGoal: async (opts = {}) => {
      const goal = get().goal;
      if (!goal) return;
      if (opts.extraRounds && !(await updateGoal("edit", { maxRounds: Math.max(goal.maxRounds, goal.roundsStarted) + opts.extraRounds }))) return;
      await updateGoal("resume", opts.systemPrompt ? { systemPrompt: opts.systemPrompt } : {});
    },

    completeGoal: async () => {
      await updateGoal("complete");
    },

    clearGoal: async () => {
      await updateGoal("clear");
    },

    createSchedule: async (prompt, rule, systemPrompt) => {
      const convId = await ensureConversation();
      if (!convId) return false;
      try {
        const schedule = await agentApi.createSchedule(convId, {
          prompt,
          rule,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          settings: runSettings(get(), systemPrompt),
        });
        if (get().currentConversationId === convId) set((s) => ({ schedules: [...s.schedules, schedule], input: "" }));
        return true;
      } catch (e) {
        console.warn("[schedule] create failed", e);
        showToast("定时提醒创建失败，请检查时间格式", "destructive");
        return false;
      }
    },

    deleteSchedule: async (id) => {
      await agentApi.deleteSchedule(id).catch((e) => console.warn("[schedule] delete failed", e));
      set((s) => ({ schedules: s.schedules.filter((x) => x.id !== id) }));
    },

    refreshSchedules: async () => {
      const convId = get().currentConversationId;
      if (!convId) return;
      try {
        const schedules = await agentApi.listSchedules(convId);
        if (get().currentConversationId === convId) set({ schedules });
      } catch {
        /* 保留旧列表 */
      }
    },

    respondApproval: async (callId, toolName, approved, forSession) => {
      if (get().answeredApprovals.has(callId)) return;
      set((s) => ({
        answeredApprovals: new Set([...s.answeredApprovals, callId]),
        ...(forSession && approved ? { sessionAllowedTools: new Set([...s.sessionAllowedTools, toolName]) } : {}),
      }));
      try {
        await chatApi.approveToolCall(callId, approved);
      } catch (e) {
        // 404 常见于 server 的 60 秒超时刚好先自动拒绝了；视图会随 approval_resolved 更新
        console.warn("[approval]", e);
      }
    },

    executeAction: (actionName, attributes) => {
      // label 只用于显示，其余属性作为参数
      const { label: _label, ...payload } = attributes;
      const coerced: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(payload)) {
        if (v === "true") coerced[k] = true;
        else if (v === "false") coerced[k] = false;
        else if (v !== "" && !isNaN(Number(v))) coerced[k] = Number(v);
        else coerced[k] = v;
      }
      if (KNOWN_COMMANDS.has(actionName)) {
        Promise.resolve(
          executeUICommand({ __ui_command__: true, command: actionName as CommandName, payload: coerced as never }),
        ).catch((e) => console.warn("[executeAction]", e));
        return;
      }
      window.dispatchEvent(new CustomEvent(LEO_ACTION_EVENT, { detail: { name: actionName, attributes: coerced } }));
    },
  };
};
