/**
 * 执行一批工具调用（设计文档 §3、§4.1、§5 不变量 1、4、9、10）。
 * - 每个 tool_use 都产出一个 tool_result（未知工具、参数错误、被拒、中止、异常都补错误结果）
 * - 默认并行（不超过 maxParallel）；批次里有 sequential 工具则整批串行
 * - 结果按 tool_use 原顺序返回；tool_end 事件按完成顺序发出
 * - 审批没拿到 allowed-once 就拒绝
 */
import type { ImageBlock, TextBlock, ToolResultBlock, ToolUseBlock } from "../blocks";
import type { AgentEvent, ApprovalOutcome } from "../events";
import { newId } from "../messages";
import type { Answerer, ApprovalConfig, ApprovalDecision, RunHooks } from "../run-types";
import {
  ToolError,
  normalizeToolContent,
  validateToolInput,
  type AnyTool,
  type ToolContext,
  type ToolOutput,
} from "../tool";
import { childController } from "./channel";

/** 模型看到的固定措辞（不暴露内部细节，遵守 CLAUDE.md 的后端安全规范） */
export const MESSAGES = {
  executionFailed: "Tool execution failed",
  aborted: "Tool call was aborted before it finished.",
  notCompleted: "Tool call was not completed.",
  rejected: "Tool call was not approved by the user.",
  unavailable: "Tool call requires approval, but no approver was available, so it was not run.",
  cancelled: "The approval request was withdrawn, so the tool call was not run.",
  unknownTool: (name: string) => `Unknown tool: ${name}. Use one of the available tools.`,
  invalidJson: (raw: string) =>
    `Tool arguments were not valid JSON: ${raw.slice(0, 500)}. Retry the call with a valid JSON object.`,
  invalidInput: (detail: string) => `Invalid tool arguments:\n${detail}\nFix the arguments and retry.`,
} as const;

export interface ApprovalState {
  /** 本次运行内一直允许 / 一直拒绝的工具（C8） */
  allowedForRun: Set<string>;
  rejectedForRun: Map<string, string | undefined>;
  /** resume() 传入的、针对具体 callId 的一次性决定 */
  decisionsByCallId: Map<string, ApprovalDecision>;
}

export function newApprovalState(): ApprovalState {
  return { allowedForRun: new Set(), rejectedForRun: new Map(), decisionsByCallId: new Map() };
}

export interface DeferredCall {
  approvalId: string;
  call: ToolUseBlock;
  reason?: string;
}

export interface ExecuteBatchOptions<Ctx> {
  runId: string;
  calls: ToolUseBlock[];
  tools: Map<string, AnyTool<Ctx>>;
  app: Ctx;
  signal: AbortSignal;
  emit: (e: AgentEvent) => void;
  hooks?: RunHooks<Ctx>;
  approval?: ApprovalConfig<Ctx>;
  approvalState: ApprovalState;
  maxParallel: number;
  maxToolResultChars?: number;
}

export interface ExecuteBatchResult {
  results: ToolResultBlock[];
  /** 暂停式审批：这些调用没有结果，等 resume() */
  deferred: DeferredCall[];
}

function errorResult(call: ToolUseBlock, text: string): ToolResultBlock {
  return { type: "tool_result", toolUseId: call.id, content: [{ type: "text", text }], isError: true };
}

function truncateText(blocks: Array<TextBlock | ImageBlock>, max: number | undefined): Array<TextBlock | ImageBlock> {
  if (max === undefined) return blocks;
  return blocks.map((b) => {
    if (b.type !== "text" || b.text.length <= max) return b;
    const head = Math.floor(max * 0.7);
    const tail = max - head;
    const cut = b.text.length - head - tail;
    return { ...b, text: `${b.text.slice(0, head)}\n…[${cut} characters truncated]…\n${b.text.slice(b.text.length - tail)}` };
  });
}

function rejectionText(outcome: ApprovalOutcome, message?: string): string {
  if (outcome === "rejected") return message ?? MESSAGES.rejected;
  if (outcome === "cancelled") return MESSAGES.cancelled;
  return MESSAGES.unavailable;
}

const VALID_OUTCOMES: ReadonlySet<string> = new Set(["allowed-once", "rejected", "cancelled", "unavailable", "deferred"]);

/** 跑应答者链：负责的就回答，不负责的调用 next()；异常或不合规的返回值 → unavailable */
async function runAnswerers<Ctx>(
  answerers: Answerer<Ctx>[],
  req: Parameters<Answerer<Ctx>>[0],
  ctx: ToolContext<Ctx>,
): Promise<ApprovalOutcome> {
  const step = async (i: number): Promise<ApprovalOutcome> => {
    const answerer = answerers[i];
    if (!answerer) return "unavailable";
    try {
      const out = await answerer(req, ctx, () => step(i + 1));
      return VALID_OUTCOMES.has(out) ? out : "unavailable";
    } catch {
      return "unavailable";
    }
  };
  if (req.signal.aborted) return "cancelled";
  const abort = new Promise<ApprovalOutcome>((resolve) =>
    req.signal.addEventListener("abort", () => resolve("cancelled"), { once: true }),
  );
  return Promise.race([step(0), abort]);
}

type CallOutcome = { kind: "result"; result: ToolResultBlock } | { kind: "deferred"; deferred: DeferredCall };

async function executeOne<Ctx>(o: ExecuteBatchOptions<Ctx>, call: ToolUseBlock): Promise<CallOutcome> {
  const started = Date.now();
  const finish = (result: ToolResultBlock, output: ToolOutput, internal?: string): CallOutcome => {
    o.emit({
      type: "tool_end",
      callId: call.id,
      ok: !result.isError,
      output,
      ms: Date.now() - started,
      ...(internal ? { internal: { error: internal } } : {}),
    });
    return { kind: "result", result };
  };
  const fail = (text: string, internal?: string): CallOutcome =>
    finish(errorResult(call, text), { content: text, isError: true }, internal);

  const tool = o.tools.get(call.name);
  if (!tool) return fail(MESSAGES.unknownTool(call.name));
  if (call.input === undefined) return fail(MESSAGES.invalidJson(call.arguments));

  let validated = validateToolInput(tool, call.input);
  if (!validated.ok) return fail(MESSAGES.invalidInput(validated.error));

  const ac = childController(o.signal);
  const ctx: ToolContext<Ctx> = {
    runId: o.runId,
    callId: call.id,
    signal: ac.signal,
    app: o.app,
    emit: (name, data) => o.emit({ type: "custom", name, data }),
    update: (progress) => o.emit({ type: "tool_progress", callId: call.id, progress }),
  };

  // 程序化策略钩子：可以按规则拒绝或改写参数
  if (o.hooks?.beforeToolCall) {
    const r = await o.hooks.beforeToolCall(call, ctx);
    if (r && "deny" in r) return fail(r.deny);
    if (r && "input" in r) {
      validated = validateToolInput(tool, r.input);
      if (!validated.ok) return fail(MESSAGES.invalidInput(validated.error));
    }
  }
  const input = validated.value;

  // 审批（D9、C8）
  let needs: boolean | string = false;
  if (typeof tool.needsApproval === "function") needs = await tool.needsApproval(input, ctx);
  else needs = tool.needsApproval ?? false;
  if (needs !== false) {
    const reason = typeof needs === "string" ? needs : undefined;
    const st = o.approvalState;
    const approvalId = newId("apr_");
    let outcome: ApprovalOutcome;
    let automatic = true;
    let rejectMessage: string | undefined;
    const decision = st.decisionsByCallId.get(call.id);
    if (decision) {
      st.decisionsByCallId.delete(call.id);
      if (decision.outcome === "allowed-for-run") st.allowedForRun.add(tool.name);
      if (decision.outcome === "rejected-for-run") st.rejectedForRun.set(tool.name, decision.message);
      outcome = decision.outcome.startsWith("allowed") ? "allowed-once" : "rejected";
      if ("message" in decision) rejectMessage = decision.message;
      automatic = false;
    } else if (st.rejectedForRun.has(tool.name)) {
      outcome = "rejected";
      rejectMessage = st.rejectedForRun.get(tool.name);
    } else if (st.allowedForRun.has(tool.name)) {
      outcome = "allowed-once";
    } else if (o.approval?.policy === "allow") {
      outcome = "allowed-once";
    } else if ((o.approval?.policy ?? "ask") === "never") {
      outcome = "rejected";
      rejectMessage = o.approval?.neverMessage;
    } else {
      o.emit({ type: "approval_request", approvalId, callId: call.id, toolName: tool.name, ...(reason ? { reason } : {}) });
      automatic = false;
      outcome = await runAnswerers(
        o.approval?.answerers ?? [],
        { approvalId, callId: call.id, toolName: tool.name, ...(reason ? { reason } : {}), signal: ac.signal },
        ctx,
      );
    }
    o.emit({ type: "approval_resolved", approvalId, callId: call.id, outcome, automatic });
    if (outcome === "deferred") return { kind: "deferred", deferred: { approvalId, call, ...(reason ? { reason } : {}) } };
    if (outcome !== "allowed-once") return fail(rejectionText(outcome, rejectMessage));
  }

  if (ac.signal.aborted) return fail(MESSAGES.aborted);
  o.emit({ type: "tool_start", callId: call.id, name: call.name, input });

  let output: ToolOutput;
  try {
    output = await raceAbort(Promise.resolve(tool.execute(input as never, ctx)), ac.signal);
  } catch (e) {
    if (ac.signal.aborted) return fail(MESSAGES.aborted);
    if (e instanceof ToolError) return fail(e.message);
    return fail(MESSAGES.executionFailed, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
  if (o.hooks?.afterToolCall) {
    const replaced = await o.hooks.afterToolCall(call, output, ctx);
    if (replaced) output = replaced;
  }
  const result: ToolResultBlock = {
    type: "tool_result",
    toolUseId: call.id,
    content: truncateText(normalizeToolContent(output), o.maxToolResultChars),
    ...(output.isError ? { isError: true } : {}),
    ...(output.data !== undefined ? { data: output.data } : {}),
    ...(output.ui !== undefined ? { ui: output.ui } : {}),
  };
  return finish(result, output);
}

/** 工具不响应 signal 时，也不让整个 run 卡住：中止后立即以 aborted 结束这次调用 */
function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

export async function executeBatch<Ctx>(o: ExecuteBatchOptions<Ctx>): Promise<ExecuteBatchResult> {
  const sequential = o.calls.some((c) => o.tools.get(c.name)?.executionMode === "sequential");
  const limit = sequential ? 1 : Math.max(1, o.maxParallel);
  const outcomes: CallOutcome[] = new Array(o.calls.length);

  let next = 0;
  const worker = async () => {
    while (next < o.calls.length) {
      const i = next++;
      const call = o.calls[i]!;
      try {
        outcomes[i] = await executeOne(o, call);
      } catch (e) {
        // executeOne 内部已兜底；这里只防御钩子等抛出的意外异常
        const text = MESSAGES.executionFailed;
        o.emit({
          type: "tool_end",
          callId: call.id,
          ok: false,
          output: { content: text, isError: true },
          ms: 0,
          internal: { error: e instanceof Error ? e.message : String(e) },
        });
        outcomes[i] = { kind: "result", result: errorResult(call, text) };
      }
    }
  };
  await Promise.allSettled(Array.from({ length: Math.min(limit, o.calls.length) }, worker));

  const results: ToolResultBlock[] = [];
  const deferred: DeferredCall[] = [];
  for (const out of outcomes) {
    if (out.kind === "result") results.push(out.result);
    else deferred.push(out.deferred);
  }
  return { results, deferred };
}

export { errorResult };
