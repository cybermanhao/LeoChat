/**
 * 引擎对外发出的事件（设计文档 §6）。只发"发生了什么"，不含任何视图概念；
 * UI 状态由 reducer 推导（§7）。事件可直接 JSON 序列化，SSE、IPC、JSONL 日志共用。
 */
import type { Block, BlockType, Message } from "./blocks";
import type { BlockDelta } from "./provider";
import type { ToolOutput } from "./tool";
import type { FinishReason, Usage } from "./usage";

export type ApprovalOutcome =
  | "allowed-once"
  | "rejected"
  | "cancelled"
  | "unavailable"
  /** 我们新增的：这次 run 先结束，等以后 resume() */
  | "deferred";

export interface CompactionInfo {
  kind: "prune" | "summary";
  replacedMessageIds: string[];
  estimatedTokensFreed: number;
  summaryMessageId?: string;
}

export type RunEndReason =
  | "completed"
  | "max_steps"
  | "stop_condition"
  | "aborted"
  | "error"
  | "awaiting_approval"
  | "refusal";

export interface PendingApproval {
  /** 不透明 ID，不暴露 callId */
  approvalId: string;
  toolName: string;
  /** 仅供展示，按不可信内容处理（HTML 转义） */
  displayInput: unknown;
  reason?: string;
}

export interface RunResult {
  runId: string;
  reason: RunEndReason;
  /** 完整、可重放，包含工具调用和结果 */
  transcript: Message[];
  usage: Usage;
  costUsd?: number;
  pending?: PendingApproval[];
  error?: { kind: string; message: string };
}

export interface EventError {
  kind: string;
  message: string;
  retryable: boolean;
}

export type AgentEvent =
  | { type: "run_start"; runId: string; at: number }
  | { type: "step_start"; stepId: string; index: number }
  | { type: "message_start"; stepId: string; messageId: string; role: "assistant" }
  | { type: "block_start"; messageId: string; index: number; block: Partial<Block> & { type: BlockType } }
  | { type: "block_delta"; messageId: string; index: number; delta: BlockDelta }
  | { type: "block_end"; messageId: string; index: number; block: Block }
  | { type: "step_end"; stepId: string; finish: FinishReason; usage: Usage }
  | { type: "tool_start"; callId: string; name: string; input: unknown }
  | { type: "tool_progress"; callId: string; progress: unknown }
  | {
      type: "approval_request";
      approvalId: string;
      callId: string;
      toolName: string;
      reason?: string;
      displayReason?: string;
    }
  | { type: "approval_resolved"; approvalId: string; callId: string; outcome: ApprovalOutcome; automatic: boolean }
  /** internal 只在服务端可见；转发给浏览器前用 toPublicEvent() 去掉 */
  | { type: "tool_end"; callId: string; ok: boolean; output: ToolOutput; ms: number; internal?: { error: string } }
  | { type: "retry"; attempt: number; delayMs: number; error: { kind: string; message: string } }
  | { type: "compaction"; info: CompactionInfo }
  | { type: "custom"; name: string; data: unknown }
  | { type: "queued"; kind: "steering" | "followUp"; message: Message }
  | { type: "user_message"; message: Message; via: "steer" | "followUp" }
  /** Q2：这一步要重试，丢弃 messageId 已经显示的内容（只在 retryAfterPartialOutput 打开时出现） */
  | { type: "step_reset"; stepId: string; messageId: string }
  | { type: "error"; error: EventError }
  | { type: "run_end"; result: RunResult };

/** 发给浏览器的通用错误说明：只带错误类型，不带上游的原始信息（可能含内部地址、模型名、限流细节） */
export function publicErrorMessage(kind: string): string {
  return `Request failed (${kind})`;
}

/**
 * 去掉只应留在服务端的内容，再转发给浏览器：
 * - tool_end.internal（工具的内部异常）
 * - retry / error / run_end 里来自上游的原始错误信息，换成只含错误类型的通用说明
 * 需要更具体的安全信息（例如 HTTP 状态码）时，由应用在此基础上自行替换
 */
export function toPublicEvent(e: AgentEvent): AgentEvent {
  switch (e.type) {
    case "tool_end": {
      if (!e.internal) return e;
      const { internal: _internal, ...rest } = e;
      return rest;
    }
    case "retry":
      return { ...e, error: { kind: e.error.kind, message: publicErrorMessage(e.error.kind) } };
    case "error":
      return { ...e, error: { ...e.error, message: publicErrorMessage(e.error.kind) } };
    case "run_end":
      return e.result.error
        ? { ...e, result: { ...e.result, error: { kind: e.result.error.kind, message: publicErrorMessage(e.result.error.kind) } } }
        : e;
    default:
      return e;
  }
}
