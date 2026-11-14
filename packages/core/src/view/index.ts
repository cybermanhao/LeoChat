/**
 * @leochat/core/view —— 把事实事件投影成 UI 状态（设计文档 §7）。
 * reduce() 是纯函数、结构共享，GUI 的 zustand store、博客页、会展页都可以直接用：
 *   set((s) => reduce(s, event))
 * tool part 的状态机参考 Vercel AI SDK UI，并加上审批相关的状态。
 */
import type {
  Block,
  Citation,
  FileBlock,
  ImageBlock,
  Message,
  Role,
  SearchResult,
  ServerToolResultBlock,
  ToolResultBlock,
} from "../blocks";
import type { AgentEvent, PendingApproval, RunEndReason } from "../events";
import type { ToolOutput } from "../tool";
import type { UiHint } from "../ui/types";
import { addUsage, emptyUsage, type Usage } from "../usage";

export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "awaiting-approval"
  | "running"
  | "output-available"
  | "output-error"
  | "denied";

export type ViewPart =
  | { type: "text"; text: string; citations?: Citation[]; streaming: boolean; blockIndex?: number }
  | { type: "reasoning"; text: string; streaming: boolean; blockIndex?: number }
  | {
      type: "tool";
      callId: string;
      name: string;
      state: ToolPartState;
      inputText?: string;
      input?: unknown;
      output?: ToolOutput;
      ui?: UiHint;
      ms?: number;
      progress?: unknown;
      approvalId?: string;
      approvalReason?: string;
      blockIndex?: number;
    }
  | { type: "server_tool"; callId: string; name: string; input?: unknown; results?: SearchResult[]; blockIndex?: number }
  | { type: "image"; block: ImageBlock }
  | { type: "file"; block: FileBlock }
  | { type: "custom"; name: string; data: unknown };

export interface ViewMessage {
  id: string;
  role: Role;
  parts: ViewPart[];
}

export type RunViewStatus =
  | "idle"
  | "connecting"
  | "reasoning"
  | "generating"
  | "tool_running"
  | "awaiting_approval"
  | "done"
  | "error"
  | "aborted";

export interface RunViewState {
  status: RunViewStatus;
  messages: ViewMessage[];
  usage: Usage;
  costUsd?: number;
  error?: { kind: string; message: string };
  retry?: { attempt: number; delayMs: number };
  endReason?: RunEndReason;
  pending?: PendingApproval[];
  queued: { steering: Message[]; followUp: Message[] };
  runId?: string;
  /** 内部：运行是否进行中 */
  active: boolean;
}

// ── transcript → 初始状态 ─────────────────────────────────────────────────

function toolResultOutput(r: ToolResultBlock): ToolOutput {
  return {
    content: r.content,
    ...(r.isError ? { isError: true } : {}),
    ...(r.data !== undefined ? { data: r.data } : {}),
    ...(r.ui !== undefined ? { ui: r.ui } : {}),
  };
}

function partFromBlock(b: Block, results: Map<string, ToolResultBlock>, serverResults: Map<string, ServerToolResultBlock>): ViewPart | null {
  switch (b.type) {
    case "text":
      return { type: "text", text: b.text, streaming: false, ...(b.citations?.length ? { citations: b.citations } : {}) };
    case "thinking":
      return { type: "reasoning", text: b.text, streaming: false };
    case "tool_use": {
      const r = results.get(b.id);
      return {
        type: "tool",
        callId: b.id,
        name: b.name,
        inputText: b.arguments,
        ...(b.input !== undefined ? { input: b.input } : {}),
        state: r ? (r.isError ? "output-error" : "output-available") : "input-available",
        ...(r ? { output: toolResultOutput(r) } : {}),
        ...(r?.ui !== undefined ? { ui: r.ui } : {}),
      };
    }
    case "server_tool_use": {
      const r = serverResults.get(b.id);
      return { type: "server_tool", callId: b.id, name: b.name, input: b.input, ...(r ? { results: r.results } : {}) };
    }
    case "server_tool_result":
      return null; // 已并入对应的 server_tool part
    case "image":
      return { type: "image", block: b };
    case "file":
      return { type: "file", block: b };
    case "tool_result":
      return null;
  }
}

/** 从 transcript 构建初始视图状态。tool 角色的消息不单独显示，而是并入对应的 tool part */
export function initialViewState(transcript: Message[] = []): RunViewState {
  const results = new Map<string, ToolResultBlock>();
  const serverResults = new Map<string, ServerToolResultBlock>();
  for (const m of transcript) {
    for (const b of m.content) {
      if (b.type === "tool_result") results.set(b.toolUseId, b);
      if (b.type === "server_tool_result") serverResults.set(b.toolUseId, b);
    }
  }
  const messages: ViewMessage[] = [];
  for (const m of transcript) {
    if (m.role === "tool" || m.role === "system") continue;
    const parts = m.content.map((b) => partFromBlock(b, results, serverResults)).filter((p): p is ViewPart => p !== null);
    messages.push({ id: m.id, role: m.role, parts });
  }
  return { status: "idle", messages, usage: emptyUsage(), queued: { steering: [], followUp: [] }, active: false };
}

/** GUI 发送前先把用户消息放进视图（乐观显示） */
export function appendUserMessage(state: RunViewState, message: Message): RunViewState {
  return { ...state, messages: [...state.messages, ...initialViewState([message]).messages] };
}

// ── 不可变更新的小工具 ─────────────────────────────────────────────────────

function updateMessage(state: RunViewState, id: string, fn: (m: ViewMessage) => ViewMessage): RunViewState {
  const i = state.messages.findIndex((m) => m.id === id);
  if (i < 0) return state;
  const messages = state.messages.slice();
  messages[i] = fn(messages[i]!);
  return { ...state, messages };
}

function updatePart(m: ViewMessage, pred: (p: ViewPart) => boolean, fn: (p: ViewPart) => ViewPart): ViewMessage {
  const i = m.parts.findIndex(pred);
  if (i < 0) return m;
  const parts = m.parts.slice();
  parts[i] = fn(parts[i]!);
  return { ...m, parts };
}

/** 在所有消息里（从后往前）找 callId 对应的 tool part 并更新 */
function updateToolPart(state: RunViewState, callId: string, fn: (p: Extract<ViewPart, { type: "tool" }>) => ViewPart): RunViewState {
  for (let i = state.messages.length - 1; i >= 0; i--) {
    const m = state.messages[i]!;
    if (m.parts.some((p) => p.type === "tool" && p.callId === callId)) {
      return updateMessage(state, m.id, (mm) =>
        updatePart(mm, (p) => p.type === "tool" && p.callId === callId, (p) => fn(p as Extract<ViewPart, { type: "tool" }>)),
      );
    }
  }
  return state;
}

const byBlockIndex = (index: number) => (p: ViewPart) => "blockIndex" in p && p.blockIndex === index;

// ── 状态推导 ─────────────────────────────────────────────────────────────

const END_STATUS: Record<RunEndReason, RunViewStatus> = {
  completed: "done",
  max_steps: "done",
  stop_condition: "done",
  refusal: "done",
  aborted: "aborted",
  error: "error",
  awaiting_approval: "awaiting_approval",
};

/** 由当前状态推导出 status（不需要引擎手动设置 cardStatus） */
export function deriveStatus(state: RunViewState): RunViewStatus {
  if (!state.active) return state.endReason ? END_STATUS[state.endReason] : "idle";
  const parts = state.messages.flatMap((m) => m.parts);
  if (parts.some((p) => p.type === "tool" && p.state === "awaiting-approval")) return "awaiting_approval";
  if (parts.some((p) => p.type === "tool" && p.state === "running")) return "tool_running";
  const last = state.messages.at(-1);
  if (last?.role === "assistant") {
    const streaming = [...last.parts].reverse().find(
      (p) => ((p.type === "text" || p.type === "reasoning") && p.streaming) || (p.type === "tool" && p.state === "input-streaming"),
    );
    if (streaming?.type === "reasoning") return "reasoning";
    if (streaming) return "generating";
  }
  return "connecting";
}

function finalizeStreaming(m: ViewMessage): ViewMessage {
  if (!m.parts.some((p) => (p.type === "text" || p.type === "reasoning") && p.streaming)) return m;
  return { ...m, parts: m.parts.map((p) => ((p.type === "text" || p.type === "reasoning") && p.streaming ? { ...p, streaming: false } : p)) };
}

// ── reducer ──────────────────────────────────────────────────────────────

export function reduce(state: RunViewState, event: AgentEvent): RunViewState {
  const next = apply(state, event);
  const status = deriveStatus(next);
  return status === next.status ? next : { ...next, status };
}

function apply(s: RunViewState, e: AgentEvent): RunViewState {
  switch (e.type) {
    case "run_start": {
      const { error: _e, retry: _r, endReason: _x, pending: _p, ...rest } = s;
      return { ...rest, active: true, runId: e.runId };
    }
    case "step_start": {
      const { retry: _r, ...rest } = s;
      return rest;
    }
    case "message_start":
      return { ...s, messages: [...s.messages, { id: e.messageId, role: e.role, parts: [] }] };

    case "block_start": {
      const b = e.block;
      let part: ViewPart | null = null;
      if (b.type === "text") part = { type: "text", text: "", streaming: true, blockIndex: e.index };
      else if (b.type === "thinking") part = { type: "reasoning", text: "", streaming: true, blockIndex: e.index };
      else if (b.type === "tool_use")
        part = { type: "tool", callId: String(b.id), name: String(b.name), state: "input-streaming", inputText: "", blockIndex: e.index };
      else if (b.type === "server_tool_use")
        part = { type: "server_tool", callId: String(b.id), name: String(b.name), blockIndex: e.index };
      if (!part) return s;
      const p = part;
      return updateMessage(s, e.messageId, (m) => ({ ...m, parts: [...m.parts, p] }));
    }

    case "block_delta":
      return updateMessage(s, e.messageId, (m) =>
        updatePart(m, byBlockIndex(e.index), (p) => {
          const d = e.delta;
          if (p.type === "text" && d.kind === "text") return { ...p, text: p.text + d.text };
          if (p.type === "text" && d.kind === "citation") return { ...p, citations: [...(p.citations ?? []), d.citation] };
          if (p.type === "reasoning" && d.kind === "thinking") return { ...p, text: p.text + d.text };
          if (p.type === "tool" && d.kind === "input_json") return { ...p, inputText: (p.inputText ?? "") + d.partial };
          return p;
        }),
      );

    case "block_end": {
      const b = e.block;
      if (b.type === "server_tool_result") {
        return updateMessage(s, e.messageId, (m) =>
          updatePart(m, (p) => p.type === "server_tool" && p.callId === b.toolUseId, (p) => ({ ...p, results: b.results }) as ViewPart),
        );
      }
      if (b.type === "image" || b.type === "file") {
        const part: ViewPart = b.type === "image" ? { type: "image", block: b } : { type: "file", block: b };
        return updateMessage(s, e.messageId, (m) => ({ ...m, parts: [...m.parts, part] }));
      }
      return updateMessage(s, e.messageId, (m) =>
        updatePart(m, byBlockIndex(e.index), (p) => {
          if (p.type === "text" && b.type === "text")
            return { ...p, text: b.text, streaming: false, ...(b.citations?.length ? { citations: b.citations } : {}) };
          if (p.type === "reasoning" && b.type === "thinking") return { ...p, text: b.text, streaming: false };
          if (p.type === "tool" && b.type === "tool_use")
            return { ...p, inputText: b.arguments, ...(b.input !== undefined ? { input: b.input } : {}), state: "input-available" };
          if (p.type === "server_tool" && b.type === "server_tool_use") return { ...p, input: b.input };
          return p;
        }),
      );
    }

    case "step_end": {
      const last = s.messages.at(-1);
      const base = last?.role === "assistant" ? updateMessage(s, last.id, finalizeStreaming) : s;
      return { ...base, usage: addUsage(base.usage, e.usage) };
    }

    case "tool_start":
      return updateToolPart(s, e.callId, (p) => ({ ...p, state: "running", input: e.input }));
    case "tool_progress":
      return updateToolPart(s, e.callId, (p) => ({ ...p, progress: e.progress }));
    case "approval_request":
      return updateToolPart(s, e.callId, (p) => ({
        ...p,
        state: "awaiting-approval",
        approvalId: e.approvalId,
        ...(e.displayReason ?? e.reason ? { approvalReason: e.displayReason ?? e.reason } : {}),
      }));
    case "approval_resolved":
      return updateToolPart(s, e.callId, (p) => {
        if (e.outcome === "allowed-once") return { ...p, state: "input-available" };
        if (e.outcome === "deferred") return { ...p, state: "awaiting-approval", approvalId: e.approvalId };
        return { ...p, state: "denied" };
      });
    case "tool_end":
      return updateToolPart(s, e.callId, (p) => ({
        ...p,
        state: p.state === "denied" ? "denied" : e.ok ? "output-available" : "output-error",
        output: e.output,
        ms: e.ms,
        ...(e.output.ui !== undefined ? { ui: e.output.ui } : {}),
      }));

    case "retry":
      return { ...s, retry: { attempt: e.attempt, delayMs: e.delayMs } };
    case "compaction":
      return s;
    case "custom": {
      const last = [...s.messages].reverse().find((m) => m.role === "assistant");
      if (!last) return s;
      return updateMessage(s, last.id, (m) => ({ ...m, parts: [...m.parts, { type: "custom", name: e.name, data: e.data }] }));
    }
    case "queued":
      return { ...s, queued: { ...s.queued, [e.kind]: [...s.queued[e.kind], e.message] } };
    case "user_message": {
      const key = e.via === "steer" ? "steering" : "followUp";
      return {
        ...appendUserMessage(s, e.message),
        queued: { ...s.queued, [key]: s.queued[key].filter((m) => m.id !== e.message.id) },
      };
    }
    case "error":
      return { ...s, error: { kind: e.error.kind, message: e.error.message } };
    case "run_end": {
      const r = e.result;
      const messages = s.messages.map(finalizeStreaming);
      return {
        ...s,
        messages,
        active: false,
        endReason: r.reason,
        usage: r.usage,
        ...(r.costUsd !== undefined ? { costUsd: r.costUsd } : {}),
        ...(r.pending ? { pending: r.pending } : {}),
        ...(r.error ? { error: r.error } : {}),
      };
    }
  }
}
