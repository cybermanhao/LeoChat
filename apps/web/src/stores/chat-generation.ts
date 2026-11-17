import type { AgentEvent, Message, RunResult } from "@leochat/core";
import { appendUserMessage, reduce } from "@leochat/core/view";
import { processToolResultForUICommands, executeUICommand } from "../lib/ui-commands";
import type { CommandName } from "../lib/ui-commands";
import { LEO_ACTION_EVENT } from "../lib/card-events";
import { handleApiError } from "../lib/api-error";
import { agentApi } from "../lib/agent-api";
import { chatApi } from "../lib/api";
import { sendOSNotification } from "../lib/os-notification";
import type { GenerationSlice, SliceCreator } from "./chat-types";

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

export const createGenerationSlice: SliceCreator<GenerationSlice> = (set, get) => {
  /** 当前运行的标识：切换会话或取消后，旧运行剩下的事件一律丢弃 */
  let runToken = 0;
  let controller: AbortController | null = null;
  /** 运行已经开始、但还没收到 run_start（不知道 runId）时的插话，拿到 runId 后再送 */
  let earlySteers: string[] = [];

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
        // server 的进程内界面工具（主题、通知、剪贴板……）
        if (e.name === "ui_command") {
          const { command, payload } = (e.data ?? {}) as { command?: string; payload?: Record<string, unknown> };
          if (command && KNOWN_COMMANDS.has(command)) {
            Promise.resolve(
              executeUICommand({ __ui_command__: true, command: command as CommandName, payload: (payload ?? {}) as never }),
            ).catch((err) => console.warn("[UICommand]", err));
          }
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
        if (e.result.reason === "completed") sendOSNotification("LeoChat", "AI 回复完成");
        break;
    }
  };

  return {
    isGenerating: false,
    activeRunId: null,
    sessionAllowedTools: new Set<string>(),
    answeredApprovals: new Set<string>(),

    sendMessage: async (content, systemPrompt) => {
      const text = content.trim();
      if (!text) return;

      // 运行中：作为插话送进当前运行（在下一个 step 边界生效）
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

      let convId = get().currentConversationId;
      try {
        // 不能用 createConversation()：它会先取消进行中的运行，而这里已经把自己标成了生成中
        if (!convId) {
          const meta = await agentApi.createConversation();
          convId = meta.id;
          set((s) => ({ conversations: [meta, ...s.conversations], currentConversationId: meta.id }));
        }
        if (token !== runToken) return; // 建会话期间被取消
      } catch (e) {
        console.error("[chat-generation] create conversation failed", e);
        set({ isGenerating: false });
        handleApiError(e instanceof Error ? e.message : String(e), get().currentProvider);
        return;
      }

      const userMsg: Message = { id: localId("msg_local_"), role: "user", content: [{ type: "text", text: content }] };
      set((s) => ({
        input: "",
        view: appendUserMessage(s.view, userMsg),
        answeredApprovals: new Set(),
        conversations: s.conversations.map((c) =>
          c.id === convId ? { ...c, title: c.title || text.replace(/\s+/g, " ").slice(0, 40), updatedAt: Date.now() } : c,
        ),
      }));

      const { currentProvider, currentModel, maxEpochs, unlimitedEpochs, temperature, mcpTools, webSearch } = get();
      controller = new AbortController();
      const own = controller;
      let leftover: string[] = [];
      try {
        const events = agentApi.run(
          convId,
          {
            text: content,
            ...(systemPrompt ? { system: systemPrompt } : {}),
            ...(currentModel ? { model: currentModel } : {}),
            provider: currentProvider,
            maxSteps: unlimitedEpochs ? 1000 : maxEpochs,
            temperature,
            tools: mcpTools.map((t) => t.name),
            ...(webSearch ? { webSearch: true } : {}),
            host: isElectron() ? "electron" : "web",
          },
          own.signal,
        );
        for await (const e of events) {
          if (token !== runToken) break;
          set((s) => ({ view: reduce(s.view, e) }));
          sideEffects(e);
        }
      } catch (e) {
        if (token === runToken && !own.signal.aborted) {
          console.error("[chat-generation] run failed", e);
          handleApiError(e instanceof Error ? e.message : String(e), get().currentProvider);
        }
      } finally {
        leftover = earlySteers;
        earlySteers = [];
        if (token === runToken) {
          set({ isGenerating: false, activeRunId: null });
          controller = null;
        }
        // 会话按最近更新排序
        set((s) => {
          const conv = s.conversations.find((c) => c.id === convId);
          if (!conv) return {};
          return { conversations: [{ ...conv, updatedAt: Date.now() }, ...s.conversations.filter((c) => c.id !== convId)] };
        });
      }
      // 运行没能开始（例如出错）时，之前的插话作为新消息发出，不丢
      if (leftover.length && token === runToken) await get().sendMessage(leftover.join("\n"));
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
      earlySteers = [];
      const runId = get().activeRunId;
      runToken++;
      if (runId) agentApi.abort(runId).catch(() => {});
      controller?.abort();
      controller = null;
      // 本地收尾：断开后收不到 run_end，用一个合成的 run_end 结束视图里的流式状态
      set((s) => {
        const result: RunResult = { runId: runId ?? "", reason: "aborted", transcript: [], usage: s.view.usage };
        return { isGenerating: false, activeRunId: null, view: s.view.active ? reduce(s.view, { type: "run_end", result }) : s.view };
      });
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
