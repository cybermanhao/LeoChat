/**
 * @leochat/core/trace —— 把事件流转换成 OpenTelemetry GenAI 语义约定风格的 span（设计文档 §6）。
 * 用法：const t = createTraceCollector({ system: 'deepseek' }); for await (const e of handle) t.push(e); t.finish()
 * 不依赖任何遥测 SDK；输出是普通 JSON，应用可以自己发到 Langfuse / OTLP / 自己的面板。
 */
import type { AgentEvent } from "../events";
import { addUsage, emptyUsage, type Usage } from "../usage";

export const GENAI = {
  OP: "gen_ai.operation.name",
  SYSTEM: "gen_ai.system",
  MODEL: "gen_ai.request.model",
  TOOL: "gen_ai.tool.name",
  CALL_ID: "gen_ai.tool.call.id",
  IN: "gen_ai.usage.input_tokens",
  OUT: "gen_ai.usage.output_tokens",
  CACHE_HIT: "gen_ai.usage.cache_read_input_tokens",
  FINISH: "gen_ai.response.finish_reasons",
} as const;

export type SpanKind = "agent" | "chat" | "tool";
export type SpanAttr = string | number | boolean;

export interface TraceSpan {
  id: string;
  parentId: string | null;
  kind: SpanKind;
  name: string;
  /** 相对运行开始的毫秒数 */
  startMs: number;
  endMs: number | null;
  /** chat span：第一个可见文字增量的时间；其他 span 为 null */
  firstTokenMs: number | null;
  status: "ok" | "error";
  attributes: Record<string, SpanAttr>;
}

export interface RunTraceData {
  runId?: string;
  spans: TraceSpan[];
  usage: Usage;
  costUsd?: number;
  /** 第一个 chat span 的首字时间 */
  ttftMs: number | null;
  durationMs: number | null;
}

export interface TraceCollector {
  push(e: AgentEvent): void;
  finish(): RunTraceData;
}

export function createTraceCollector(opts: { system: string; model?: string; agentName?: string; now?: () => number }): TraceCollector {
  const now = opts.now ?? Date.now;
  const t0 = now();
  const rel = () => now() - t0;
  const spans: TraceSpan[] = [];
  const byId = new Map<string, TraceSpan>();
  let usage = emptyUsage();
  let costUsd: number | undefined;
  let runId: string | undefined;
  let agent: TraceSpan | null = null;
  let chat: TraceSpan | null = null;
  let stepFailed = false;
  const tools = new Map<string, TraceSpan>();
  const toolNames = new Map<string, string>();

  const open = (kind: SpanKind, name: string, parent: TraceSpan | null, attributes: Record<string, SpanAttr>): TraceSpan => {
    const s: TraceSpan = { id: `${kind}_${spans.length + 1}`, parentId: parent?.id ?? null, kind, name, startMs: rel(), endMs: null, firstTokenMs: null, status: "ok", attributes };
    spans.push(s);
    byId.set(s.id, s);
    return s;
  };
  const close = (s: TraceSpan | null, status: "ok" | "error" = "ok", attrs: Record<string, SpanAttr> = {}) => {
    if (!s || s.endMs !== null) return;
    s.endMs = rel();
    s.status = status;
    Object.assign(s.attributes, attrs);
  };
  const toolSpan = (callId: string) => {
    let s = tools.get(callId);
    if (!s) {
      const name = toolNames.get(callId) ?? "unknown";
      s = open("tool", `execute_tool ${name}`, chat ?? agent, { [GENAI.OP]: "execute_tool", [GENAI.TOOL]: name, [GENAI.CALL_ID]: callId });
      tools.set(callId, s);
    }
    return s;
  };

  return {
    push(e) {
      switch (e.type) {
        case "run_start":
          runId = e.runId;
          agent = open("agent", `invoke_agent ${opts.agentName ?? "agent"}`, null, {
            [GENAI.OP]: "invoke_agent",
            [GENAI.SYSTEM]: opts.system,
            ...(opts.model ? { [GENAI.MODEL]: opts.model } : {}),
          });
          break;
        case "step_start":
          stepFailed = false;
          chat = open("chat", `chat ${opts.model ?? ""}`.trim(), agent, {
            [GENAI.OP]: "chat",
            [GENAI.SYSTEM]: opts.system,
            ...(opts.model ? { [GENAI.MODEL]: opts.model } : {}),
          });
          break;
        case "block_delta":
          if (chat && chat.firstTokenMs === null && e.delta.kind === "text") chat.firstTokenMs = rel();
          break;
        case "block_end":
          if (e.block.type === "tool_use") toolNames.set(e.block.id, e.block.name);
          break;
        case "error":
          stepFailed = true;
          break;
        case "step_end":
          usage = addUsage(usage, e.usage);
          close(chat, stepFailed ? "error" : "ok", {
            [GENAI.IN]: e.usage.inputTokens,
            [GENAI.OUT]: e.usage.outputTokens,
            ...(e.usage.cacheHitTokens !== undefined ? { [GENAI.CACHE_HIT]: e.usage.cacheHitTokens } : {}),
            [GENAI.FINISH]: e.finish,
          });
          break;
        case "tool_start":
          toolSpan(e.callId);
          break;
        case "tool_end":
          close(toolSpan(e.callId), e.ok ? "ok" : "error");
          break;
        case "run_end":
          usage = e.result.usage;
          if (e.result.costUsd !== undefined) costUsd = e.result.costUsd;
          for (const s of spans) if (s.kind !== "agent") close(s, s.endMs === null ? "error" : s.status);
          close(agent, "ok");
          break;
      }
    },
    finish() {
      const firstChat = spans.find((s) => s.kind === "chat");
      const agentSpan = spans.find((s) => s.kind === "agent");
      return {
        ...(runId ? { runId } : {}),
        spans: spans.map((s) => ({ ...s, attributes: { ...s.attributes } })),
        usage,
        ...(costUsd !== undefined ? { costUsd } : {}),
        ttftMs: firstChat?.firstTokenMs ?? null,
        durationMs: agentSpan?.endMs ?? null,
      };
    },
  };
}
