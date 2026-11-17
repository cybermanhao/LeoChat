import { J as JsonSchema, d as TextBlock, I as ImageBlock, v as UiHint, c as ToolDef, B as Block, e as BlockType, o as BlockDelta, l as FinishReason, U as Usage, M as Message } from './provider-CmTkRKQo.js';
import { z } from 'zod';

/**
 * 工具定义（设计文档 §3）。参数统一用 zod v4 定义（D11）。
 */

interface ToolOutput {
    /** 给模型看的内容。省略时由 data 做 JSON.stringify 得到 */
    content?: Array<TextBlock | ImageBlock> | string;
    data?: unknown;
    ui?: UiHint;
    isError?: boolean;
}
interface ToolContext<Ctx = unknown> {
    runId: string;
    callId: string;
    signal: AbortSignal;
    /** 应用传进来的按请求上下文：身份、租户、Workers bindings 等 */
    app: Ctx;
    /** 发出应用自定义事件（custom 事件），例如博客的 command */
    emit(name: string, data: unknown): void;
    /** 报告执行进度（C6），产生 tool_progress 事件 */
    update(progress: unknown): void;
}
type ToolVisibility = "model" | "app";
interface Tool<S extends z.ZodType = z.ZodType, Ctx = unknown> {
    name: string;
    description: string;
    /** 校验和类型推导都以它为准 */
    input: S;
    /** 只给远程工具用（mcp-kit）：直接发给模型的原始 JSON Schema，此时 input 一般为 z.unknown() */
    jsonSchemaOverride?: JsonSchema;
    /** 与 MCP Apps 对齐。'app' 表示只有界面能调用，不会发给模型。默认 ['model'] */
    visibility?: ToolVisibility[];
    /** 由工具自己决定这次调用要不要审批；返回字符串时，这个字符串就是审批理由 */
    needsApproval?: boolean | ((input: z.infer<S>, ctx: ToolContext<Ctx>) => boolean | string | Promise<boolean | string>);
    /** 执行模式（C5）。默认 'parallel'；同一批调用里只要有一个 sequential，整批就串行 */
    executionMode?: "parallel" | "sequential";
    execute(input: z.infer<S>, ctx: ToolContext<Ctx>): ToolOutput | Promise<ToolOutput>;
}
/** 任意工具（用于集合类型）。execute 的入参在运行时由 input schema 校验 */
type AnyTool<Ctx = unknown> = Tool<any, Ctx>;
/** 写工具的辅助函数，负责类型推导 */
declare function defineTool<S extends z.ZodType, Ctx = unknown>(tool: Tool<S, Ctx>): Tool<S, Ctx>;
/** 工具来源：静态数组、MCP server，以后还可以是 skills 等 */
interface ToolSource<Ctx = unknown> {
    list(ctx: {
        app: Ctx;
        signal: AbortSignal;
    }): Promise<AnyTool<Ctx>[]>;
    /** 可选：运行结束时释放 list() 建立的连接（例如 MCP 客户端）。run() 结束时一定会调用 */
    release?(): Promise<void> | void;
}
declare function isToolSource<Ctx>(x: AnyTool<Ctx> | ToolSource<Ctx>): x is ToolSource<Ctx>;
/** 抛出这个错误表示业务错误：消息会给模型看，isError 为 true，不算系统故障 */
declare class ToolError extends Error {
    constructor(message: string);
}
declare function isModelVisible<Ctx>(tool: AnyTool<Ctx>): boolean;
/** 生成发给模型的工具定义 */
declare function toToolDef<Ctx>(tool: AnyTool<Ctx>): ToolDef;
type ValidationResult = {
    ok: true;
    value: unknown;
} | {
    ok: false;
    error: string;
};
/** 按工具的 zod schema 校验参数；失败时给出可以直接给模型看的错误说明 */
declare function validateToolInput<Ctx>(tool: AnyTool<Ctx>, input: unknown): ValidationResult;
/** 把 ToolOutput.content 归一成块数组；省略时由 data 序列化得到 */
declare function normalizeToolContent(out: ToolOutput): Array<TextBlock | ImageBlock>;

/**
 * 引擎对外发出的事件（设计文档 §6）。只发"发生了什么"，不含任何视图概念；
 * UI 状态由 reducer 推导（§7）。事件可直接 JSON 序列化，SSE、IPC、JSONL 日志共用。
 */

type ApprovalOutcome = "allowed-once" | "rejected" | "cancelled" | "unavailable"
/** 我们新增的：这次 run 先结束，等以后 resume() */
 | "deferred";
interface CompactionInfo {
    kind: "prune" | "summary";
    replacedMessageIds: string[];
    estimatedTokensFreed: number;
    summaryMessageId?: string;
}
type RunEndReason = "completed" | "max_steps" | "stop_condition" | "aborted" | "error" | "awaiting_approval" | "refusal";
interface PendingApproval {
    /** 不透明 ID，不暴露 callId */
    approvalId: string;
    toolName: string;
    /** 仅供展示，按不可信内容处理（HTML 转义） */
    displayInput: unknown;
    reason?: string;
}
interface RunResult {
    runId: string;
    reason: RunEndReason;
    /** 完整、可重放，包含工具调用和结果 */
    transcript: Message[];
    usage: Usage;
    costUsd?: number;
    pending?: PendingApproval[];
    error?: {
        kind: string;
        message: string;
    };
}
interface EventError {
    kind: string;
    message: string;
    retryable: boolean;
}
type AgentEvent = {
    type: "run_start";
    runId: string;
    at: number;
} | {
    type: "step_start";
    stepId: string;
    index: number;
} | {
    type: "message_start";
    stepId: string;
    messageId: string;
    role: "assistant";
} | {
    type: "block_start";
    messageId: string;
    index: number;
    block: Partial<Block> & {
        type: BlockType;
    };
} | {
    type: "block_delta";
    messageId: string;
    index: number;
    delta: BlockDelta;
} | {
    type: "block_end";
    messageId: string;
    index: number;
    block: Block;
} | {
    type: "step_end";
    stepId: string;
    finish: FinishReason;
    usage: Usage;
} | {
    type: "tool_start";
    callId: string;
    name: string;
    input: unknown;
} | {
    type: "tool_progress";
    callId: string;
    progress: unknown;
} | {
    type: "approval_request";
    approvalId: string;
    callId: string;
    toolName: string;
    reason?: string;
    displayReason?: string;
} | {
    type: "approval_resolved";
    approvalId: string;
    callId: string;
    outcome: ApprovalOutcome;
    automatic: boolean;
}
/** internal 只在服务端可见；转发给浏览器前用 toPublicEvent() 去掉 */
 | {
    type: "tool_end";
    callId: string;
    ok: boolean;
    output: ToolOutput;
    ms: number;
    internal?: {
        error: string;
    };
} | {
    type: "retry";
    attempt: number;
    delayMs: number;
    error: {
        kind: string;
        message: string;
    };
} | {
    type: "compaction";
    info: CompactionInfo;
} | {
    type: "custom";
    name: string;
    data: unknown;
} | {
    type: "queued";
    kind: "steering" | "followUp";
    message: Message;
} | {
    type: "user_message";
    message: Message;
    via: "steer" | "followUp";
}
/** Q2：这一步要重试，丢弃 messageId 已经显示的内容（只在 retryAfterPartialOutput 打开时出现） */
 | {
    type: "step_reset";
    stepId: string;
    messageId: string;
} | {
    type: "error";
    error: EventError;
} | {
    type: "run_end";
    result: RunResult;
};
/** 发给浏览器的通用错误说明：只带错误类型，不带上游的原始信息（可能含内部地址、模型名、限流细节） */
declare function publicErrorMessage(kind: string): string;
/**
 * 去掉只应留在服务端的内容，再转发给浏览器：
 * - tool_end.internal（工具的内部异常）
 * - retry / error / run_end 里来自上游的原始错误信息，换成只含错误类型的通用说明
 * 需要更具体的安全信息（例如 HTTP 状态码）时，由应用在此基础上自行替换
 */
declare function toPublicEvent(e: AgentEvent): AgentEvent;

export { type AnyTool as A, type CompactionInfo as C, type EventError as E, type PendingApproval as P, type RunResult as R, type ToolSource as T, type ValidationResult as V, type ToolContext as a, type ApprovalOutcome as b, type AgentEvent as c, type ToolOutput as d, type Tool as e, type ToolVisibility as f, defineTool as g, ToolError as h, isToolSource as i, isModelVisible as j, type RunEndReason as k, toPublicEvent as l, normalizeToolContent as n, publicErrorMessage as p, toToolDef as t, validateToolInput as v };
