import type { AgentEvent, Goal, Message, RunResult } from "@leochat/core";
import { appendUserMessage, reduce } from "@leochat/core/view";
import { processToolResultForUICommands, executeUICommand } from "../lib/ui-commands";
import type { CommandName } from "../lib/ui-commands";
import { LEO_ACTION_EVENT } from "../lib/card-events";
import { handleApiError } from "../lib/api-error";
import { agentApi, type GoalAction, type RunSettings } from "../lib/agent-api";
import { showToast } from "./toast";
import { chatApi } from "../lib/api";
import { sendOSNotification } from "../lib/os-notification";
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

const localId = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

const KNOWN_COMMANDS: ReadonlySet<string> = new Set<CommandName>([
  "update_theme", "show_notification", "show_confirm",
  "open_panel", "close_panel", "copy_to_clipboard",
  "open_url", "scroll_to_message", "set_input", "send_message", "resize_window",
]);

/** 只走副作用、不进视图的 custom 事件 */
const NON_VIEW_CUSTOM = new Set(["goal", "goal_round", "ui_command", "ping"]);
/** watch 断线后多久重连 */
const WATCH_RETRY_MS = 3_000;

/** 从当前设置组装运行设置（普通运行和目标运行共用） */
function runSettings(s: ChatState, systemPrompt?: string): RunSettings {
  return {
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(s.currentModel ? { model: s.currentModel } : {}),
    provider: s.currentProvider,
    maxSteps: s.unlimitedEpochs ? 1000 : s.maxEpochs,
    temperature: s.temperature,
    tools: s.mcpTools.map((t) => t.name),
    ...(s.webSearch ? { webSearch: true } : {}),
    host: isElectron() ? "electron" : "web",
  };
}

export const createGenerationSlice: SliceCreator<GenerationSlice> = (set, get) => {
  /** 当前连接的标识：切换会话或取消后，旧连接剩下的事件一律丢弃 */
  let runToken = 0;
  let controller: AbortController | null = null;
  /** 运行已经开始、但还没收到 run_start（不知道 runId）时的插话，拿到 runId 后再送 */
  let earlySteers: string[] = [];
  /** watch 长连接（server 发起的运行：定时提醒） */
  let watchCtl: AbortController | null = null;
  /** 当前的生成状态来自 watch（server 发起的运行），而不是自己发起的 */
  let watchRun = false;

  /** 事件带来的副作用（视图之外的部分） */
  const sideEffects = (e: AgentEvent) => {
    switch (e.type) {
      case "run_start": {
        set({ activeRunId: e.runId });
        const pending = earlySteers;
        earlySteers = [];
        for (const t of pending) agentApi.steer(e.runId, t).catch((err) => console.warn("[steer]", err));
        break;
      }
      case "approval_request":
        if (get().sessionAllowedTools.has(e.toolName)) {
          chatApi.approveToolCall(e.callId, true).catch((err) => console.warn("[sessionAllow]", err));
        }
        break;
      case "custom":
        if (e.name === "ui_command") {
          // server 的进程内界面工具（主题、通知、剪贴板……）
          const { command, payload } = (e.data ?? {}) as { command?: string; payload?: Record<string, unknown> };
          if (command && KNOWN_COMMANDS.has(command)) {
            Promise.resolve(
              executeUICommand({ __ui_command__: true, command: command as CommandName, payload: (payload ?? {}) as never }),
            ).catch((err) => console.warn("[UICommand]", err));
          }
        } else if (e.name === "goal") {
          const goal = (e.data ?? null) as Goal | null;
          const prev = get().goal;
          set({ goal });
          if (goal && prev?.phase !== goal.phase && (goal.phase === "complete" || goal.phase === "blocked")) {
            sendOSNotification("LeoChat", goal.phase === "complete" ? "目标已完成" : "目标卡住了，需要你处理");
          }
        } else if (e.name === "goal_round") {
          // 目标的新一轮：提示消息由 server 写进会话，这里同步进视图
          const { message } = (e.data ?? {}) as { message?: Message };
          if (message) set((s) => ({ view: appendUserMessage(s.view, message), answeredApprovals: new Set() }));
        }
        break;
      case "tool_end":
        // 第三方 MCP 服务仍可能在工具结果里返回 __ui_command__ JSON
        if (e.ok) {
          processToolResultForUICommands(toolOutputText(e.output)).catch((err) => console.warn("[UICommand]", err));
        }
        break;
      case "error":
        handleApiError(e.error.message, get().currentProvider);
        break;
      case "run_end":
        if (e.result.reason === "completed" && !get().goalAttached) sendOSNotification("LeoChat", "AI 回复完成");
        // 模型可能用 schedule_create / schedule_delete 改了提醒，一次性提醒也可能已结束
        void get().refreshSchedules();
        break;
    }
  };

  /** 消费一条事件流（一次运行，或连上的目标驱动），直到结束、被取消或切走 */
  async function consume(token: number, own: AbortController, events: AsyncIterable<AgentEvent>, convId: string): Promise<string[]> {
    let leftover: string[] = [];
    try {
      for await (const e of events) {
        if (token !== runToken) break;
        if (!(e.type === "custom" && NON_VIEW_CUSTOM.has(e.name))) set((s) => ({ view: reduce(s.view, e) }));
        sideEffects(e);
      }
    } catch (e) {
      if (token === runToken && !own.signal.aborted) {
        console.error("[chat-generation] stream failed", e);
        handleApiError(e instanceof Error ? e.message : String(e), get().currentProvider);
      }
    } finally {
      leftover = earlySteers;
      earlySteers = [];
      if (token === runToken) {
        set({ isGenerating: false, activeRunId: null, goalAttached: false });
        controller = null;
      }
      // 会话按最近更新排序
      set((s) => {
        const conv = s.conversations.find((c) => c.id === convId);
        if (!conv) return {};
        return { conversations: [{ ...conv, updatedAt: Date.now() }, ...s.conversations.filter((c) => c.id !== convId)] };
      });
    }
    return token === runToken ? leftover : [];
  }

  /** 确保有当前会话（没有就在 server 上新建）；调用前已经把自己标成生成中 */
  async function ensureConversation(token: number): Promise<string | null> {
    let convId = get().currentConversationId;
    try {
      // 不能用 createConversation()：它会先离开进行中的运行，而这里已经把自己标成了生成中
      if (!convId) {
        const meta = await agentApi.createConversation();
        convId = meta.id;
        set((s) => ({ conversations: [meta, ...s.conversations], currentConversationId: meta.id }));
        get().watchConversation(meta.id);
      }
      return token === runToken ? convId : null;
    } catch (e) {
      console.error("[chat-generation] create conversation failed", e);
      if (token === runToken) set({ isGenerating: false });
      handleApiError(e instanceof Error ? e.message : String(e), get().currentProvider);
      return null;
    }
  }

  /** 断开当前事件流（不通知 server） */
  function detach() {
    earlySteers = [];
    runToken++;
    controller?.abort();
    controller = null;
  }

  /** 修改目标（用户操作）；返回新目标，失败时提示并返回 undefined */
  async function updateGoal(action: GoalAction, extra: { maxRounds?: number } = {}): Promise<Goal | null | undefined> {
    const id = get().currentConversationId;
    const goal = get().goal;
    if (!id || !goal) return undefined;
    try {
      const r = await agentApi.updateGoal(id, { action, revision: goal.revision, ...extra });
      if (get().currentConversationId === id) set({ goal: r.goal });
      return r.goal;
    } catch (e) {
      console.warn("[goal]", e);
      // 多半是目标已被别处改动（revision 过期）：重新读一次
      const fresh = await agentApi.getGoal(id).catch(() => null);
      if (fresh && get().currentConversationId === id) set({ goal: fresh.goal });
      return undefined;
    }
  }

  return {
    isGenerating: false,
    activeRunId: null,
    sessionAllowedTools: new Set<string>(),
    answeredApprovals: new Set<string>(),
    goalAttached: false,

    sendMessage: async (content, systemPrompt) => {
      const text = content.trim();
      if (!text) return;

      // 运行中（包括目标的某一轮）：作为插话送进当前运行（在下一个 step 边界生效）
      if (get().isGenerating) {
        const runId = get().activeRunId;
        set({ input: "" });
        if (!runId) {
          earlySteers.push(text);
          return;
        }
        await agentApi.steer(runId, text).catch((e) => console.warn("[steer]", e));
        return;
      }

      // 同步置位，防止双击发送起两个运行
      set({ isGenerating: true });
      const token = ++runToken;
      const convId = await ensureConversation(token);
      if (!convId) return;

      const userMsg: Message = { id: localId("msg_local_"), role: "user", content: [{ type: "text", text: content }] };
      set((s) => ({
        input: "",
        view: appendUserMessage(s.view, userMsg),
        answeredApprovals: new Set(),
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, title: c.title || text.replace(/\s+/g, " ").slice(0, 40), updatedAt: Date.now() } : c,
        ),
      }));

      controller = new AbortController();
      const own = controller;
      const leftover = await consume(token, own, agentApi.run(convId, { text: content, ...runSettings(get(), systemPrompt) }, own.signal), convId);
      // 运行没能开始（例如出错）时，之前的插话作为新消息发出，不丢
      if (leftover.length) await get().sendMessage(leftover.join("\n"));
    },

    queueFollowUp: async (content) => {
      const text = content.trim();
      const runId = get().activeRunId;
      if (!text) return;
      if (!runId) {
        await get().sendMessage(text);
        return;
      }
      set({ input: "" });
      await agentApi.followUp(runId, text).catch((e) => console.warn("[followUp]", e));
    },

    cancelGeneration: () => {
      if (!get().isGenerating) return;
      // 目标模式：停止 = 暂停目标（server 会中止当前轮），事件流随驱动结束自然关闭
      if (get().goalAttached) {
        void get().pauseGoal();
        return;
      }
      const runId = get().activeRunId;
      detach();
      if (runId) agentApi.abort(runId).catch(() => {});
      // 本地收尾：断开后收不到 run_end，用一个合成的 run_end 结束视图里的流式状态
      set((s) => {
        const result: RunResult = { runId: runId ?? "", reason: "aborted", transcript: [], usage: s.view.usage };
        return { isGenerating: false, activeRunId: null, view: s.view.active ? reduce(s.view, { type: "run_end", result }) : s.view };
      });
    },

    leaveConversation: () => {
      get().watchConversation(null);
      if (!get().isGenerating) return;
      if (get().goalAttached) {
        // 目标在 server 上继续推进，回到这个会话时会自动连上
        detach();
        set({ isGenerating: false, activeRunId: null, goalAttached: false });
        return;
      }
      get().cancelGeneration();
    },

    startGoal: async (objective, opts = {}) => {
      const text = objective.trim();
      if (!text || get().isGenerating) return;
      set({ isGenerating: true });
      const token = ++runToken;
      const convId = await ensureConversation(token);
      if (!convId) return;
      try {
        const { goal } = await agentApi.createGoal(convId, { objective: text, ...(opts.maxRounds ? { maxRounds: opts.maxRounds } : {}) });
        if (token !== runToken) return;
        set((s) => ({
          goal,
          input: "",
          conversations: s.conversations.map((c) => (c.id === convId && !c.title ? { ...c, title: `目标：${text.slice(0, 36)}` } : c)),
        }));
      } catch (e) {
        console.warn("[goal] create failed", e);
        if (token === runToken) set({ isGenerating: false });
        handleApiError("已有未完成的目标：先完成、暂停或清除它", get().currentProvider);
        return;
      }
      set({ isGenerating: false });
      await get().attachGoal(opts.systemPrompt);
    },

    attachGoal: async (systemPrompt) => {
      const convId = get().currentConversationId;
      if (!convId || get().isGenerating) return;
      set({ isGenerating: true, goalAttached: true, answeredApprovals: new Set() });
      const token = ++runToken;
      controller = new AbortController();
      const own = controller;
      await consume(token, own, agentApi.runGoal(convId, runSettings(get(), systemPrompt), own.signal), convId);
    },

    pauseGoal: async () => {
      await updateGoal("pause");
    },

    resumeGoal: async (opts = {}) => {
      const goal = get().goal;
      if (!goal || get().isGenerating) return;
      if (opts.extraRounds) {
        const edited = await updateGoal("edit", { maxRounds: Math.max(goal.maxRounds, goal.roundsStarted) + opts.extraRounds });
        if (!edited) return;
      }
      if (get().goal?.phase !== "active") {
        const resumed = await updateGoal("resume");
        if (!resumed) return;
      }
      await get().attachGoal(opts.systemPrompt);
    },

    completeGoal: async () => {
      await updateGoal("complete");
    },

    clearGoal: async () => {
      await updateGoal("clear");
    },

    watchConversation: (id) => {
      watchCtl?.abort();
      watchCtl = null;
      if (watchRun) {
        watchRun = false;
        set({ isGenerating: false, activeRunId: null });
      }
      if (!id) return;
      const ctl = new AbortController();
      watchCtl = ctl;
      void (async () => {
        while (!ctl.signal.aborted) {
          try {
            for await (const e of agentApi.watch(id, ctl.signal)) {
              if (ctl.signal.aborted || get().currentConversationId !== id) return;
              if (e.type === "run_start" && !get().isGenerating) {
                // server 自己发起了一次运行（定时提醒到期）：像自己的运行一样显示，可以插话、停止
                watchRun = true;
                set({ isGenerating: true, answeredApprovals: new Set() });
              }
              if (!(e.type === "custom" && NON_VIEW_CUSTOM.has(e.name))) set((s) => ({ view: reduce(s.view, e) }));
              sideEffects(e);
              if (e.type === "run_end" && watchRun) {
                watchRun = false;
                set({ isGenerating: false, activeRunId: null });
              }
            }
          } catch {
            /* 断线：稍后重连 */
          }
          if (ctl.signal.aborted) return;
          await new Promise((r) => setTimeout(r, WATCH_RETRY_MS));
        }
      })();
    },

    createSchedule: async (prompt, rule, systemPrompt) => {
      let convId = get().currentConversationId;
      try {
        if (!convId) convId = await get().createConversation();
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
