import { P as Provider, M as Message, S as ServerToolKind, a as ModelRequest, T as ToolUseBlock, U as Usage, C as Capabilities, b as ToolResultBlock, c as ToolDef, d as TextBlock, I as ImageBlock, B as Block } from './provider-CmTkRKQo.js';
export { f as BlockBase, o as BlockDelta, e as BlockType, x as Card, y as CardAction, w as CardsHint, g as Citation, z as CustomHint, F as FileBlock, l as FinishReason, J as JsonSchema, A as McpAppHint, s as ProviderError, r as ProviderErrorKind, q as ProviderEvent, R as Role, h as SearchResult, k as ServerToolResultBlock, j as ServerToolUseBlock, i as ThinkingBlock, u as UI_META_KEY, v as UiHint, n as addUsage, m as emptyUsage, t as isProviderError, p as parseToolArguments } from './provider-CmTkRKQo.js';
import { A as AnyTool, T as ToolSource, a as ToolContext, b as ApprovalOutcome, c as AgentEvent, d as ToolOutput, C as CompactionInfo, R as RunResult, e as Tool } from './events-Db5KJiTB.js';
export { E as EventError, P as PendingApproval, k as RunEndReason, h as ToolError, f as ToolVisibility, V as ValidationResult, g as defineTool, j as isModelVisible, i as isToolSource, n as normalizeToolContent, l as toPublicEvent, t as toToolDef, v as validateToolInput } from './events-Db5KJiTB.js';
import { z } from 'zod';

/**
 * 重复工具调用提醒（参考 dsh packages/guard/repeat-tool-reminder）。
 * 只检测完全相同的调用（同一工具、同样的参数，忽略键顺序）。达到阈值时，把提醒追加在这次工具结果后面：
 * 第一个阈值给温和提醒，之后给详细提醒。提醒只是建议，不拦截调用。新的用户消息（插话、后续消息）清零计数。
 */

interface RepeatReminderOptions {
    /** 默认 [3, 5, 8]（与 dsh 相同） */
    thresholds?: number[];
    /** 只跟踪这些工具（支持 * 通配）；空表示全部 */
    include?: string[];
    /** 不跟踪这些工具（支持 * 通配）。不跟踪的调用既不计数也不打断计数 */
    exclude?: string[];
    /** 详细提醒里显示多少字符的参数，默认 500 */
    argumentsPreviewChars?: number;
}

/**
 * run() 的配置与句柄类型（设计文档 §4、§4.1、§7.5、§8）。
 * 第 1 步只定义类型；run() 本身在第 2 步实现。
 */

interface StepRecord {
    index: number;
    /** 本 step 产生的 assistant 消息 */
    message: Message;
    toolCalls: ToolUseBlock[];
    usage: Usage;
}
interface StopConditionInput {
    steps: StepRecord[];
    totalUsage: Usage;
    costUsd?: number;
}
/** 返回 true 表示应该停止 */
type StopCondition = (input: StopConditionInput) => boolean;
interface StepContext<Ctx = unknown> {
    stepIndex: number;
    messages: Message[];
    system?: string;
    model: string;
    app: Ctx;
    lastUsage?: Usage;
    capabilities: Capabilities;
    signal: AbortSignal;
}
interface PrepareStepResult {
    /** 返回的 messages 会成为后续 step 的基础 */
    messages?: Message[];
    system?: string;
    model?: string;
    /** 本 step 只启用这些工具（按名字） */
    activeTools?: string[];
    temperature?: number;
    maxOutputTokens?: number;
}
interface ApprovalRequest {
    approvalId: string;
    callId: string;
    toolName: string;
    /** 写进审计的文字 */
    reason?: string;
    /** 给 UI 看的本地化文案 */
    displayReason?: string;
    signal: AbortSignal;
}
type Answerer<Ctx = unknown> = (req: ApprovalRequest, ctx: ToolContext<Ctx>, next: () => Promise<ApprovalOutcome>) => ApprovalOutcome | Promise<ApprovalOutcome>;
interface ApprovalConfig<Ctx = unknown> {
    /** 默认 ask；never 在调用应答者之前就确定性地拒绝（CI、无人值守） */
    policy?: "ask" | "never";
    /** 链走到头还没人回答 → unavailable → 拒绝 */
    answerers?: Answerer<Ctx>[];
}
type ApprovalDecision = {
    outcome: "allowed-once";
}
/** 本次运行内，同一个工具后续调用都自动允许 */
 | {
    outcome: "allowed-for-run";
}
/** message 是模型看到的拒绝说明，省略时用默认措辞 */
 | {
    outcome: "rejected";
    message?: string;
} | {
    outcome: "rejected-for-run";
    message?: string;
};
interface PausedRun {
    runId: string;
    transcript: Message[];
    /** approvalId → callId 的映射只存在服务端 */
    approvals: Array<{
        approvalId: string;
        callId: string;
        toolName: string;
        consumed: boolean;
    }>;
    /** 同一批里已经执行完的调用结果；resume 时与待审批调用的结果按原顺序合并成一条 tool 消息 */
    partialResults: ToolResultBlock[];
    usage: Usage;
    createdAt: number;
}
interface SessionStore {
    savePaused(run: PausedRun): Promise<void>;
    loadPaused(runId: string): Promise<PausedRun | null>;
    /**
     * 原子操作：认领一个暂停的运行，防止两个 resume() 同时处理（Q5）。
     * 已被认领且未超过 ttlMs 时返回 false；savePaused() 会解除认领。
     */
    claimPaused(runId: string, ttlMs: number): Promise<boolean>;
    /** 恢复成功、这批调用全部有了结果后删除暂停记录；之后同一个 runId 再 resume 会得到 not_found */
    deletePaused(runId: string): Promise<void>;
    /** 原子操作：把 approvalId 标记为已消费并返回对应的调用；已经消费过则返回 null（防重放） */
    consumeApproval(runId: string, approvalId: string): Promise<{
        callId: string;
    } | null>;
    /** 可选：追加事件日志，供 harness 回放和 compaction 保留原文 */
    appendEvents?(runId: string, events: AgentEvent[]): Promise<void>;
}
interface Compactor {
    maybeCompact(input: {
        messages: Message[];
        lastUsage?: Usage;
        capabilities: Capabilities;
        provider: Provider;
        model: string;
        system?: string;
        tools?: ToolDef[];
        /** 本 step 请求的输出上限，用于计算触发阈值（窗口 − 输出预留 − 余量） */
        maxOutputTokens?: number;
        /** context_overflow 时为 true */
        force?: boolean;
        signal: AbortSignal;
    }): Promise<null | {
        messages: Message[];
        info: CompactionInfo;
    }>;
}
interface RetryConfig {
    maxAttempts: number;
    baseDelayMs: number;
    maxDelayMs: number;
}
type BeforeToolCallResult = void | {
    deny: string;
} | {
    input: unknown;
};
interface RunHooks<Ctx = unknown> {
    /** 程序化的策略钩子（不是人工审批）：可以改写参数，或按规则拒绝 */
    beforeToolCall?(call: ToolUseBlock, ctx: ToolContext<Ctx>): BeforeToolCallResult | Promise<BeforeToolCallResult>;
    afterToolCall?(call: ToolUseBlock, out: ToolOutput, ctx: ToolContext<Ctx>): ToolOutput | void | Promise<ToolOutput | void>;
}
interface RunOptions<Ctx = unknown> {
    provider: Provider;
    model: string;
    system?: string;
    /** 可以是上次 run_end 返回的 transcript，加上新的 user 消息 */
    messages: Message[];
    tools?: Array<AnyTool<Ctx> | ToolSource<Ctx>>;
    app?: Ctx;
    serverTools?: ServerToolKind[];
    thinking?: ModelRequest["thinking"];
    temperature?: number;
    maxOutputTokens?: number;
    safetyCheck?: "high";
    /** 任意一个满足就停止。默认 [stepCount(10)] */
    stopWhen?: StopCondition | StopCondition[];
    prepareStep?(s: StepContext<Ctx>): PrepareStepResult | void | Promise<PrepareStepResult | void>;
    /** 默认 10 */
    maxParallelToolCalls?: number;
    /** Q1：插话一次全部投递（默认）还是一次一条 */
    steeringMode?: "all" | "one-at-a-time";
    /** Q1：后续消息一次全部投递（默认）还是一次一条 */
    followUpMode?: "all" | "one-at-a-time";
    /** Q4：停止条件在一批工具结果之后触发时，再跑一个禁用工具的 step 让模型总结。默认 false */
    finalStepOnStop?: boolean;
    /**
     * Q2：已经流式输出部分内容后遇到可重试错误，是否仍然重试。默认 false。
     * 打开后重试前会发 step_reset 事件；消费方必须据此丢弃这一步已显示的内容（view reducer 已支持）
     */
    retryAfterPartialOutput?: boolean;
    /** 重复工具调用提醒（参考 dsh repeat-tool-reminder）。默认开启，阈值 3/5/8；传 false 关闭 */
    repeatToolReminder?: false | RepeatReminderOptions;
    maxToolResultChars?: number;
    retry?: RetryConfig;
    approval?: ApprovalConfig<Ctx>;
    /** 暂停式审批和 resume() 必须配置（C1） */
    store?: SessionStore;
    hooks?: RunHooks<Ctx>;
    compactor?: Compactor;
    signal?: AbortSignal;
    providerOptions?: Record<string, unknown>;
}
type SteerOutcome = {
    delivered: true;
} | {
    delivered: false;
    reason: "finished" | "stop_condition" | "aborted" | "error" | "awaiting_approval" | "cleared";
};
interface RunHandle extends AsyncIterable<AgentEvent> {
    readonly runId: string;
    readonly result: Promise<RunResult>;
    abort(reason?: string): void;
    /** 插话：在下一个 step 开始前插入（插在本轮所有 tool_result 之后） */
    steer(message: Message): Promise<SteerOutcome>;
    /** 后续消息：本轮自然结束时，用排队的消息接着跑下一轮 */
    followUp(message: Message): void;
    peekQueued(): {
        steering: Message[];
        followUp: Message[];
    };
    clearQueued(kind?: "steering" | "followUp"): void;
}
interface ResumeOptions<Ctx = unknown> extends Omit<RunOptions<Ctx>, "messages"> {
    runId: string;
    /** key 是 approvalId（不透明 ID，不是 callId） */
    decisions: Record<string, ApprovalDecision>;
}

/** 内置停止条件（C4，参考 Vercel AI SDK 的 stopWhen） */

/** 用来把步数上限触发的停止报告为 reason: "max_steps" */
declare function isStepCountCondition(c: StopCondition): boolean;
/** 已经跑满 n 个 step 时停止 */
declare function stepCount(n: number): StopCondition;
/** 最近一个 step 调用了指定工具之一时停止 */
declare function hasToolCall(...names: string[]): StopCondition;
/** 累计费用超过阈值（美元）时停止。provider 没有提供 price() 时永远不会触发 */
declare function costAbove(usd: number): StopCondition;
declare const DEFAULT_STOP_WHEN: StopCondition[];
declare function normalizeStopWhen(s: StopCondition | StopCondition[] | undefined): StopCondition[];

/** 消息相关的小工具 */

/** 只用 Web 标准 API 生成 ID（Workers、浏览器、Node 18+ 都有 crypto.randomUUID） */
declare function newId(prefix?: string): string;
declare function userMessage(content: string | Array<TextBlock | ImageBlock | Block>, id?: string): Message;
declare function systemMessage(text: string, id?: string): Message;
/** 拼出一条消息里所有 text 块的文字 */
declare function textOf(message: Message): string;

/**
 * run() / resume()：agent 循环（设计文档 §4、§5）。
 *
 * 每个 step：投递插话 → prepareStep → compactor → 请求模型（含重试）→ 追加 assistant 消息
 * → 执行工具 → 检查停止条件。没有工具调用时，若有后续消息（followUp）就接着跑，否则结束。
 * 运行结果从不 reject：错误以 reason:'error' 的 RunResult 返回，并发出 error 事件。
 */

declare function run<Ctx = unknown>(opts: RunOptions<Ctx>): RunHandle;
/** 从暂停状态恢复（C1）。完整状态从服务端 store 读取，客户端只提供 runId 和各审批的决定 */
declare function resume<Ctx = unknown>(opts: ResumeOptions<Ctx>): RunHandle;
/** 去掉不发给模型的字段（不变量 8）和空消息 */
declare function toModelMessages(messages: Message[]): Message[];
/** 找出最后一条 assistant 消息里还没有结果的 tool_use（只看它后面紧跟的 tool 消息） */
declare function unansweredToolUses(messages: Message[]): ToolUseBlock[];

/**
 * SessionStore 实现与暂停式审批的应答者（设计文档 §4.1、§7.5）。
 * - memoryStore()：测试用，以及 GUI 的本地 server（单进程）
 * - d1Store(db)：Cloudflare D1（Workers）。只依赖一个最小的结构化接口，不引入 Workers 类型
 */

/** 内置应答者：直接返回 deferred，用于 serverless。没有配置 store 时 run() 启动即报错（C1） */
declare const deferAnswerer: Answerer<unknown>;
declare function memoryStore(now?: () => number): SessionStore & {
    readonly size: number;
};
/** Cloudflare D1 的最小结构化接口（与 D1Database 兼容） */
interface D1Like {
    prepare(sql: string): D1StatementLike;
    batch(statements: D1StatementLike[]): Promise<unknown[]>;
}
interface D1StatementLike {
    bind(...values: unknown[]): D1StatementLike;
    first<T = Record<string, unknown>>(): Promise<T | null>;
    run(): Promise<{
        meta?: {
            changes?: number;
        };
    }>;
}
/** 建表语句。部署时执行一次（例如 wrangler d1 execute），或用 d1Store(...).migrate() */
declare const D1_SCHEMA: string[];
declare function d1Store(db: D1Like, now?: () => number): SessionStore & {
    migrate(): Promise<void>;
};

interface SkillMeta {
    name: string;
    description: string;
}
interface SkillSource {
    list(): SkillMeta[] | Promise<SkillMeta[]>;
    /** 返回 skill 的完整指令；不存在时返回 null */
    load(name: string): string | null | Promise<string | null>;
}
/** 内存里的 skill 来源（测试、Workers 里打包进来的 skill） */
declare function staticSkills(skills: Array<SkillMeta & {
    content: string;
}>): SkillSource;
/** 生成放进 system prompt 的 skill 目录。按名字排序，保证同一组 skill 生成的文字完全一样 */
declare function skillCatalog(skills: SkillMeta[], opts?: {
    descriptionMaxLength?: number;
    toolName?: string;
}): string;
/** 模型调用的加载工具 */
declare function loadSkillTool(source: SkillSource, opts?: {
    name?: string;
}): Tool<z.ZodObject<{
    name: z.ZodString;
}, z.core.$strip>, unknown>;

/**
 * 默认的上下文压缩器（设计文档 §8，参考 dsh packages/compaction）。
 *
 * 触发：估算的请求 token ≥ min(窗口 × thresholdRatio, 窗口 − 输出预留 − headroomTokens)，或 force（上下文溢出）。
 * 1. 修剪：保留区之外、文字超过 headChars + tailChars 的工具结果，裁成"开头 + 已省略标记 + 结尾"。不调用模型；
 *    如果这样就降到阈值以下，到此为止。
 * 2. 摘要：从第一条非 system 消息到"保留区"之前的这一段，交给模型压缩成结构化检查点，替换成一条 user 消息。
 *    - 保留区：最近约 retainRatio × (窗口 − 输出预留) 的对话原样保留；切分点不拆开工具调用和结果
 *    - 摘要请求复用同样的 system 和工具，被压缩的原文作为前缀，压缩指令放在最后，以命中前缀缓存
 *    - 失败就不压缩：模型出错、被截断、没有输出文字，或摘要不比原文短，都返回 null
 *
 * 和 dsh 的两处不同：中文按 1 字 1 token 估算（dsh 按 4 字符 1 token，会严重低估中文）；摘要用对话本身的语言书写。
 */

declare const SUMMARY_OPEN_TAG = "<compacted-summary>";
declare const SUMMARY_CLOSE_TAG = "</compacted-summary>";
declare const PRUNED_MARKER = "\n\n[... tool result middle pruned ...]\n\n";
interface CompactorOptions {
    /** 默认 0.8 */
    thresholdRatio?: number;
    /** 输出预留之外的额外余量，默认 65536 */
    headroomTokens?: number;
    /** 原样保留的近期对话占 (窗口 − 输出预留) 的比例，默认 0.16 */
    retainRatio?: number;
    /** 工具结果修剪：保留开头/结尾多少个字符，默认 4096 / 1024 */
    headChars?: number;
    tailChars?: number;
    /** 摘要请求的输出上限，默认 16384 */
    summaryMaxTokens?: number;
    /** 摘要用的模型；默认与对话相同（相同模型才能命中缓存） */
    summaryModel?: string;
    /** 被替换掉的原始消息交给调用方存档（例如写进会话日志），压缩不会因为存档失败而失败 */
    archive?: (replaced: Message[], info: CompactionInfo) => void | Promise<void>;
    /** 估算 token 的函数，默认 estimateTokens */
    estimate?: (text: string) => number;
}
/** 启发式估算：CJK 每字约 1 token（偏保守），其余每 4 个字符约 1 token */
declare function estimateTokens(text: string): number;
declare function estimateMessage(m: Message, estimate?: typeof estimateTokens): number;
/**
 * 估算下一次请求的输入 token：以上一次请求的真实用量为基准（输入 + 输出），
 * 加上最后一条 assistant 消息之后新增的消息；没有基准时整体估算。
 */
declare function measureRequest(messages: Message[], opts: {
    lastUsage?: Usage;
    system?: string;
    tools?: ToolDef[];
    estimate?: (t: string) => number;
}): number;
/** 在下标 k 处切开是否安全：k 之前的每个 tool_use 都在 k 之前得到了结果 */
declare function cutIsBalanced(messages: Message[], k: number): boolean;
declare function createCompactor(o?: CompactorOptions): Compactor;

export { AgentEvent, type Answerer, AnyTool, type ApprovalConfig, type ApprovalDecision, ApprovalOutcome, type ApprovalRequest, type BeforeToolCallResult, Block, Capabilities, CompactionInfo, type Compactor, type CompactorOptions, type D1Like, type D1StatementLike, D1_SCHEMA, DEFAULT_STOP_WHEN, ImageBlock, Message, ModelRequest, PRUNED_MARKER, type PausedRun, type PrepareStepResult, Provider, type RepeatReminderOptions, type ResumeOptions, type RetryConfig, type RunHandle, type RunHooks, type RunOptions, RunResult, SUMMARY_CLOSE_TAG, SUMMARY_OPEN_TAG, ServerToolKind, type SessionStore, type SkillMeta, type SkillSource, type SteerOutcome, type StepContext, type StepRecord, type StopCondition, type StopConditionInput, TextBlock, Tool, ToolContext, ToolDef, ToolOutput, ToolResultBlock, ToolSource, ToolUseBlock, Usage, costAbove, createCompactor, cutIsBalanced, d1Store, deferAnswerer, estimateMessage, estimateTokens, hasToolCall, isStepCountCondition, loadSkillTool, measureRequest, memoryStore, newId, normalizeStopWhen, resume, run, skillCatalog, staticSkills, stepCount, systemMessage, textOf, toModelMessages, unansweredToolUses, userMessage };
