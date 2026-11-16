/**
 * Provider 接口与能力声明（设计文档 §2）。
 * 每个 adapter 把自己的线上协议翻译成同一套 ProviderEvent；
 * tool_calls 增量拼接、JSON 解析、错误分类都在 adapter 里一次性做完。
 */
import type { Block, BlockType, Citation, Message } from "./blocks";
import type { FinishReason, ServerToolKind, Usage } from "./usage";

export type JsonSchema = Record<string, unknown>;

export interface Capabilities {
  contextWindow: number;
  maxOutput: number;
  tools: boolean;
  parallelToolCalls: boolean;
  thinking: boolean;
  vision: boolean;
  files: boolean;
  serverTools: ServerToolKind[];
  /** 是否返回缓存命中和未命中的 token 数 */
  cacheStats: boolean;
  /** 开启服务端工具后会被忽略的参数，供上层提示用 */
  ignoredWhenServerTools?: string[];
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

export interface ModelRequest {
  model: string;
  system?: string;
  messages: Message[];
  /** 只包含模型可见的工具 */
  tools?: ToolDef[];
  serverTools?: ServerToolKind[];
  thinking?: boolean | { effort: "low" | "medium" | "high" };
  maxOutputTokens?: number;
  temperature?: number;
  /** DeepSeek safety_check。面向公众的应用必须开启 */
  safetyCheck?: "high";
  /** 逃生口：原样交给 adapter */
  providerOptions?: Record<string, unknown>;
}

export type BlockDelta =
  | { kind: "text"; text: string }
  | { kind: "thinking"; text: string }
  | { kind: "input_json"; partial: string }
  | { kind: "citation"; citation: Citation };

/** 归一化后的流事件。每个 provider adapter 都输出同一套事件 */
export type ProviderEvent =
  | { type: "block_start"; index: number; block: Partial<Block> & { type: BlockType } }
  | { type: "block_delta"; index: number; delta: BlockDelta }
  /** 完整的块。tool_use 的 arguments 是原始字符串，input 已尽量解析 */
  | { type: "block_end"; index: number; block: Block }
  | { type: "usage"; usage: Usage }
  | { type: "finish"; reason: FinishReason };

export interface Provider {
  readonly id: string;
  capabilities(model: string): Capabilities;
  stream(req: ModelRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent>;
  /** 可选：按 usage 计算费用（美元）。DeepSeek 要区分忙时和闲时 */
  price?(model: string, usage: Usage, at: Date): number | undefined;
  /**
   * 可选：按这个 provider 的分词器估算一段文字的 token 数（压缩器用来判断何时触发）。
   * 不提供时用 core 的保守估算（中文每字 1 token）。各家分词差别很大，例如 DeepSeek 中文约每字 0.6 token
   */
  estimateTokens?(text: string): number;
}

export type ProviderErrorKind =
  | "rate_limit"
  | "overloaded"
  | "context_overflow"
  | "auth"
  | "insufficient_balance"
  | "invalid_request"
  | "refusal"
  | "network"
  | "unknown";

const RETRYABLE: ReadonlySet<ProviderErrorKind> = new Set(["rate_limit", "overloaded", "network"]);

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind;
  readonly retryable: boolean;
  readonly status?: number;
  readonly retryAfterMs?: number;

  constructor(
    kind: ProviderErrorKind,
    message: string,
    opts: { status?: number; retryAfterMs?: number; retryable?: boolean; cause?: unknown } = {},
  ) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "ProviderError";
    this.kind = kind;
    this.retryable = opts.retryable ?? RETRYABLE.has(kind);
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.retryAfterMs !== undefined) this.retryAfterMs = opts.retryAfterMs;
  }
}

export function isProviderError(e: unknown): e is ProviderError {
  return e instanceof ProviderError;
}
