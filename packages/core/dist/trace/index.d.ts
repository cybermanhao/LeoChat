import { c as AgentEvent } from '../events-Db5KJiTB.js';
import { U as Usage } from '../provider-CmTkRKQo.js';
import 'zod';

/**
 * @leochat/core/trace —— 把事件流转换成 OpenTelemetry GenAI 语义约定风格的 span（设计文档 §6）。
 * 用法：const t = createTraceCollector({ system: 'deepseek' }); for await (const e of handle) t.push(e); t.finish()
 * 不依赖任何遥测 SDK；输出是普通 JSON，应用可以自己发到 Langfuse / OTLP / 自己的面板。
 */

declare const GENAI: {
    readonly OP: "gen_ai.operation.name";
    readonly SYSTEM: "gen_ai.system";
    readonly MODEL: "gen_ai.request.model";
    readonly TOOL: "gen_ai.tool.name";
    readonly CALL_ID: "gen_ai.tool.call.id";
    readonly IN: "gen_ai.usage.input_tokens";
    readonly OUT: "gen_ai.usage.output_tokens";
    readonly CACHE_HIT: "gen_ai.usage.cache_read_input_tokens";
    readonly FINISH: "gen_ai.response.finish_reasons";
};
type SpanKind = "agent" | "chat" | "tool";
type SpanAttr = string | number | boolean;
interface TraceSpan {
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
interface RunTraceData {
    runId?: string;
    spans: TraceSpan[];
    usage: Usage;
    costUsd?: number;
    /** 第一个 chat span 的首字时间 */
    ttftMs: number | null;
    durationMs: number | null;
}
interface TraceCollector {
    push(e: AgentEvent): void;
    finish(): RunTraceData;
}
declare function createTraceCollector(opts: {
    system: string;
    model?: string;
    agentName?: string;
    now?: () => number;
}): TraceCollector;

export { GENAI, type RunTraceData, type SpanAttr, type SpanKind, type TraceCollector, type TraceSpan, createTraceCollector };
