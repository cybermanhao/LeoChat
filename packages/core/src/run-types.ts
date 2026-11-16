/**
 * run() 的配置与句柄类型（设计文档 §4、§4.1、§7.5、§8）。
 * 第 1 步只定义类型；run() 本身在第 2 步实现。
 */
import type { Message, ToolResultBlock, ToolUseBlock } from "./blocks";
import type { AgentEvent, ApprovalOutcome, CompactionInfo, RunResult } from "./events";
import type { Capabilities, ModelRequest, Provider, ToolDef } from "./provider";
import type { AnyTool, ToolContext, ToolOutput, ToolSource } from "./tool";
import type { ServerToolKind, Usage } from "./usage";

// ── 停止条件（C4）────────────────────────────────────────────────────────

export interface StepRecord {
  index: number;
  /** 本 step 产生的 assistant 消息 */
  message: Message;
  toolCalls: ToolUseBlock[];
  usage: Usage;
}

export interface StopConditionInput {
  steps: StepRecord[];
  totalUsage: Usage;
  costUsd?: number;
}

/** 返回 true 表示应该停止 */
export type StopCondition = (input: StopConditionInput) => boolean;

// ── prepareStep（C3）──────────────────────────────────────────────────────

export interface StepContext<Ctx = unknown> {
  stepIndex: number;
  messages: Message[];
  system?: string;
  model: string;
  app: Ctx;
  lastUsage?: Usage;
  capabilities: Capabilities;
  signal: AbortSignal;
}

export interface PrepareStepResult {
  /** 返回的 messages 会成为后续 step 的基础 */
  messages?: Message[];
  system?: string;
  model?: string;
  /** 本 step 只启用这些工具（按名字） */
  activeTools?: string[];
  temperature?: number;
  maxOutputTokens?: number;
}

// ── 审批（D9、C1、C8）─────────────────────────────────────────────────────

export interface ApprovalRequest {
  approvalId: string;
  callId: string;
  toolName: string;
  /** 写进审计的文字 */
  reason?: string;
  /** 给 UI 看的本地化文案 */
  displayReason?: string;
  signal: AbortSignal;
}

export type Answerer<Ctx = unknown> = (
  req: ApprovalRequest,
  ctx: ToolContext<Ctx>,
  next: () => Promise<ApprovalOutcome>,
) => ApprovalOutcome | Promise<ApprovalOutcome>;

export interface ApprovalConfig<Ctx = unknown> {
  /** 默认 ask；never 在调用应答者之前就确定性地拒绝（CI、无人值守） */
  policy?: "ask" | "never";
  /** 链走到头还没人回答 → unavailable → 拒绝 */
  answerers?: Answerer<Ctx>[];
}

export type ApprovalDecision =
  | { outcome: "allowed-once" }
  /** 本次运行内，同一个工具后续调用都自动允许 */
  | { outcome: "allowed-for-run" }
  /** message 是模型看到的拒绝说明，省略时用默认措辞 */
  | { outcome: "rejected"; message?: string }
  | { outcome: "rejected-for-run"; message?: string };

// ── SessionStore（§7.5）───────────────────────────────────────────────────

export interface PausedRun {
  runId: string;
  transcript: Message[];
  /** approvalId → callId 的映射只存在服务端 */
  approvals: Array<{ approvalId: string; callId: string; toolName: string; consumed: boolean }>;
  /** 同一批里已经执行完的调用结果；resume 时与待审批调用的结果按原顺序合并成一条 tool 消息 */
  partialResults: ToolResultBlock[];
  usage: Usage;
  createdAt: number;
}

export interface SessionStore {
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
  consumeApproval(runId: string, approvalId: string): Promise<{ callId: string } | null>;
  /** 可选：追加事件日志，供 harness 回放和 compaction 保留原文 */
  appendEvents?(runId: string, events: AgentEvent[]): Promise<void>;
}

// ── Compactor（§8，第一期只定义接口）─────────────────────────────────────

export interface Compactor {
  maybeCompact(input: {
    messages: Message[];
    lastUsage?: Usage;
    capabilities: Capabilities;
    provider: Provider;
    model: string;
    system?: string;
    tools?: ToolDef[];
    /** context_overflow 时为 true */
    force?: boolean;
    signal: AbortSignal;
  }): Promise<null | { messages: Message[]; info: CompactionInfo }>;
}

// ── run() 配置与句柄（§4）─────────────────────────────────────────────────

export interface RetryConfig {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export type BeforeToolCallResult = void | { deny: string } | { input: unknown };

export interface RunHooks<Ctx = unknown> {
  /** 程序化的策略钩子（不是人工审批）：可以改写参数，或按规则拒绝 */
  beforeToolCall?(call: ToolUseBlock, ctx: ToolContext<Ctx>): BeforeToolCallResult | Promise<BeforeToolCallResult>;
  afterToolCall?(call: ToolUseBlock, out: ToolOutput, ctx: ToolContext<Ctx>): ToolOutput | void | Promise<ToolOutput | void>;
}

export interface RunOptions<Ctx = unknown> {
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

export type SteerOutcome =
  | { delivered: true }
  | { delivered: false; reason: "finished" | "stop_condition" | "aborted" | "error" | "awaiting_approval" | "cleared" };

export interface RunHandle extends AsyncIterable<AgentEvent> {
  readonly runId: string;
  readonly result: Promise<RunResult>;
  abort(reason?: string): void;
  /** 插话：在下一个 step 开始前插入（插在本轮所有 tool_result 之后） */
  steer(message: Message): Promise<SteerOutcome>;
  /** 后续消息：本轮自然结束时，用排队的消息接着跑下一轮 */
  followUp(message: Message): void;
  peekQueued(): { steering: Message[]; followUp: Message[] };
  clearQueued(kind?: "steering" | "followUp"): void;
}

export interface ResumeOptions<Ctx = unknown> extends Omit<RunOptions<Ctx>, "messages"> {
  runId: string;
  /** key 是 approvalId（不透明 ID，不是 callId） */
  decisions: Record<string, ApprovalDecision>;
}
