/**
 * run() / resume()：agent 循环（设计文档 §4、§5）。
 *
 * 每个 step：投递插话 → prepareStep → compactor → 请求模型（含重试）→ 追加 assistant 消息
 * → 执行工具 → 检查停止条件。没有工具调用时，若有后续消息（followUp）就接着跑，否则结束。
 * 运行结果从不 reject：错误以 reason:'error' 的 RunResult 返回，并发出 error 事件。
 */
import { parseToolArguments, type Block, type Message, type ToolResultBlock, type ToolUseBlock } from "./blocks";
import type { AgentEvent, PendingApproval, RunEndReason, RunResult } from "./events";
import { abortableSleep, EventChannel } from "./internal/channel";
import { errorResult, executeBatch, MESSAGES, newApprovalState, type DeferredCall } from "./internal/execute-tools";
import { newId } from "./messages";
import { ProviderError, isProviderError, type ModelRequest, type ToolDef } from "./provider";
import type {
  ResumeOptions,
  RetryConfig,
  RunHandle,
  RunOptions,
  SteerOutcome,
  StepRecord,
} from "./run-types";
import { isStepCountCondition, normalizeStopWhen } from "./stop";
import { deferAnswerer } from "./store";
import { isModelVisible, isToolSource, toToolDef, type AnyTool } from "./tool";
import { addUsage, emptyUsage, type FinishReason, type Usage } from "./usage";

const DEFAULT_RETRY: RetryConfig = { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 8_000 };
const DEFAULT_MAX_PARALLEL = 10;

type Init = { kind: "fresh" } | { kind: "resume"; runId: string; decisions: ResumeOptions["decisions"] };

export function run<Ctx = unknown>(opts: RunOptions<Ctx>): RunHandle {
  return start(opts, { kind: "fresh" });
}

/** 从暂停状态恢复（C1）。完整状态从服务端 store 读取，客户端只提供 runId 和各审批的决定 */
export function resume<Ctx = unknown>(opts: ResumeOptions<Ctx>): RunHandle {
  const { runId, decisions, ...rest } = opts;
  return start({ ...rest, messages: [] }, { kind: "resume", runId, decisions });
}

/** 去掉不发给模型的字段（不变量 8）和空消息 */
export function toModelMessages(messages: Message[]): Message[] {
  return messages
    .filter((m) => m.content.length > 0)
    .map((m) =>
      m.role !== "tool"
        ? m
        : {
            ...m,
            content: m.content.map((b) => {
              if (b.type !== "tool_result") return b;
              const { data: _data, ui: _ui, ...rest } = b;
              return rest;
            }),
          },
    );
}

/** 找出最后一条 assistant 消息里还没有结果的 tool_use（只看它后面紧跟的 tool 消息） */
export function unansweredToolUses(messages: Message[]): ToolUseBlock[] {
  let i = messages.length - 1;
  const answered = new Set<string>();
  while (i >= 0 && messages[i]!.role === "tool") {
    for (const b of messages[i]!.content) if (b.type === "tool_result") answered.add(b.toolUseId);
    i--;
  }
  const last = messages[i];
  if (!last || last.role !== "assistant") return [];
  return last.content.filter((b): b is ToolUseBlock => b.type === "tool_use" && !answered.has(b.id));
}

/** 运行结束时释放 ToolSource 建立的连接；释放失败不影响结果 */
async function releaseSources<Ctx>(opts: RunOptions<Ctx>): Promise<void> {
  for (const t of opts.tools ?? []) {
    if (isToolSource(t) && t.release) {
      try {
        await t.release();
      } catch {
        // 忽略
      }
    }
  }
}

function toProviderError(e: unknown): ProviderError {
  if (isProviderError(e)) return e;
  return new ProviderError("unknown", e instanceof Error ? e.message : String(e), { cause: e });
}

function start<Ctx>(opts: RunOptions<Ctx>, init: Init): RunHandle {
  const channel = new EventChannel<AgentEvent>();
  const ac = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) ac.abort(opts.signal.reason);
    else opts.signal.addEventListener("abort", () => ac.abort(opts.signal!.reason), { once: true });
  }
  const runId = init.kind === "resume" ? init.runId : newId("run_");
  const steering: Array<{ message: Message; resolve: (o: SteerOutcome) => void }> = [];
  const followUps: Message[] = [];
  let ended: RunEndReason | undefined;
  const emit = (e: AgentEvent) => channel.push(e);

  const notDelivered = (reason: RunEndReason): SteerOutcome => {
    const map: Partial<Record<RunEndReason, SteerOutcome & { delivered: false }>> = {
      aborted: { delivered: false, reason: "aborted" },
      error: { delivered: false, reason: "error" },
      awaiting_approval: { delivered: false, reason: "awaiting_approval" },
      max_steps: { delivered: false, reason: "stop_condition" },
      stop_condition: { delivered: false, reason: "stop_condition" },
    };
    return map[reason] ?? { delivered: false, reason: "finished" };
  };

  const result = (async (): Promise<RunResult> => {
    let r: RunResult;
    try {
      r = await loop(opts, init, runId, ac.signal, emit, steering, followUps);
      await releaseSources(opts);
    } catch (e) {
      await releaseSources(opts);
      // loop 内部已兜底；这里防御真正意外的异常，保证 result 不 reject
      const err = { kind: "unknown", message: e instanceof Error ? e.message : String(e) };
      emit({ type: "error", error: { ...err, retryable: false } });
      r = { runId, reason: "error", transcript: [], usage: emptyUsage(), error: err };
      emit({ type: "run_end", result: r });
    }
    ended = r.reason;
    for (const s of steering.splice(0)) s.resolve(notDelivered(r.reason));
    channel.close();
    return r;
  })();

  return {
    runId,
    result,
    abort(reason?: string) {
      ac.abort(reason === undefined ? new DOMException("Aborted", "AbortError") : new DOMException(reason, "AbortError"));
    },
    steer(message: Message): Promise<SteerOutcome> {
      if (ended) return Promise.resolve(notDelivered(ended));
      return new Promise((resolve) => {
        steering.push({ message, resolve });
        emit({ type: "queued", kind: "steering", message });
      });
    },
    followUp(message: Message) {
      followUps.push(message);
      emit({ type: "queued", kind: "followUp", message });
    },
    peekQueued() {
      return { steering: steering.map((s) => s.message), followUp: [...followUps] };
    },
    clearQueued(kind?: "steering" | "followUp") {
      if (kind !== "followUp") for (const s of steering.splice(0)) s.resolve({ delivered: false, reason: "cleared" });
      if (kind !== "steering") followUps.splice(0);
    },
    [Symbol.asyncIterator]: () => channel[Symbol.asyncIterator](),
  };
}

async function loop<Ctx>(
  opts: RunOptions<Ctx>,
  init: Init,
  runId: string,
  signal: AbortSignal,
  emit: (e: AgentEvent) => void,
  steering: Array<{ message: Message; resolve: (o: SteerOutcome) => void }>,
  followUps: Message[],
): Promise<RunResult> {
  emit({ type: "run_start", runId, at: Date.now() });
  const app = opts.app as Ctx;
  const stopWhen = normalizeStopWhen(opts.stopWhen);
  const retry = opts.retry ?? DEFAULT_RETRY;
  const approvalState = newApprovalState();
  const steps: StepRecord[] = [];
  let transcript: Message[] = [];
  let totalUsage: Usage = emptyUsage();
  let costUsd: number | undefined;
  let lastUsage: Usage | undefined;

  const end = (reason: RunEndReason, extra: Partial<RunResult> = {}): RunResult => {
    const r: RunResult = {
      runId,
      reason,
      transcript,
      usage: totalUsage,
      ...(costUsd !== undefined ? { costUsd } : {}),
      ...extra,
    };
    emit({ type: "run_end", result: r });
    return r;
  };
  const fail = (kind: string, message: string, retryable = false): RunResult => {
    emit({ type: "error", error: { kind, message, retryable } });
    return end("error", { error: { kind, message } });
  };

  // C1：用到暂停式审批就必须有 store
  if (opts.approval?.answerers?.includes(deferAnswerer as never) && !opts.store) {
    return fail("config", "deferAnswerer requires a SessionStore (opts.store); see design doc §4.1 (C1)");
  }

  // 解析工具（ToolSource 在运行开始时列一次）
  const tools = new Map<string, AnyTool<Ctx>>();
  try {
    for (const t of opts.tools ?? []) {
      const list = isToolSource(t) ? await t.list({ app, signal }) : [t];
      for (const tool of list) {
        if (tools.has(tool.name)) return fail("config", `Duplicate tool name: ${tool.name}`);
        tools.set(tool.name, tool);
      }
    }
  } catch (e) {
    return fail("tool_source", e instanceof Error ? e.message : String(e));
  }

  const runBatch = (calls: ToolUseBlock[]) =>
    executeBatch({
      runId,
      calls,
      tools,
      app,
      signal,
      emit,
      ...(opts.hooks ? { hooks: opts.hooks } : {}),
      ...(opts.approval ? { approval: opts.approval } : {}),
      approvalState,
      maxParallel: opts.maxParallelToolCalls ?? DEFAULT_MAX_PARALLEL,
      ...(opts.maxToolResultChars !== undefined ? { maxToolResultChars: opts.maxToolResultChars } : {}),
    });

  /** 处理一批工具调用的结果：有 deferred 就暂停保存，否则把结果按原顺序写成一条 tool 消息 */
  const settleBatch = async (
    calls: ToolUseBlock[],
    results: ToolResultBlock[],
    deferred: DeferredCall[],
    keepApprovals: Array<{ approvalId: string; callId: string; toolName: string }> = [],
  ): Promise<RunResult | null> => {
    if (deferred.length > 0 || keepApprovals.length > 0) {
      if (!opts.store) {
        // 自定义应答者返回了 deferred 但没有 store：按 unavailable 处理（不允许无存储的暂停）
        for (const d of deferred) results.push(errorResult(d.call, MESSAGES.unavailable));
      } else {
        const approvals = [
          ...keepApprovals,
          ...deferred.map((d) => ({ approvalId: d.approvalId, callId: d.call.id, toolName: d.call.name })),
        ];
        await opts.store.savePaused({
          runId,
          transcript,
          approvals: approvals.map((a) => ({ ...a, consumed: false })),
          partialResults: results,
          usage: totalUsage,
          createdAt: Date.now(),
        });
        const pending: PendingApproval[] = approvals.map((a) => {
          const call = calls.find((c) => c.id === a.callId);
          const d = deferred.find((x) => x.approvalId === a.approvalId);
          return {
            approvalId: a.approvalId,
            toolName: a.toolName,
            displayInput: call?.input ?? call?.arguments,
            ...(d?.reason ? { reason: d.reason } : {}),
          };
        });
        return end("awaiting_approval", { pending });
      }
    }
    const order = new Map(calls.map((c, i) => [c.id, i]));
    results.sort((a, b) => (order.get(a.toolUseId) ?? 0) - (order.get(b.toolUseId) ?? 0));
    transcript.push({ id: newId("msg_"), role: "tool", content: results });
    return null;
  };

  // ── 初始化 transcript ──────────────────────────────────────────────────
  if (init.kind === "resume") {
    if (!opts.store) return fail("config", "resume() requires a SessionStore (opts.store)");
    const paused = await opts.store.loadPaused(runId);
    if (!paused) return fail("not_found", `No paused run: ${runId}`);
    transcript = paused.transcript;
    totalUsage = paused.usage;
    // 这批的全部调用（用于排序和展示）与其中还没有结果的调用
    const batchCalls = unansweredToolUses(transcript);
    const pendingCalls = batchCalls.filter((c) => !paused.partialResults.some((r) => r.toolUseId === c.id));
    const decided: ToolUseBlock[] = [];
    const undecided: Array<{ approvalId: string; callId: string; toolName: string }> = [];
    for (const a of paused.approvals) {
      if (a.consumed) continue;
      const decision = init.decisions[a.approvalId];
      // 每个 approvalId 只能消费一次（防重放）；消费失败视为没有决定
      const consumed = decision ? await opts.store.consumeApproval(runId, a.approvalId) : null;
      const call = pendingCalls.find((c) => c.id === a.callId);
      if (!call) continue;
      if (decision && consumed) {
        approvalState.decisionsByCallId.set(call.id, decision);
        decided.push(call);
      } else {
        undecided.push({ approvalId: a.approvalId, callId: a.callId, toolName: a.toolName });
      }
    }
    const batch = decided.length ? await runBatch(decided) : { results: [], deferred: [] };
    const results = [...paused.partialResults, ...batch.results];
    // 不变量 1：既没执行、也不再等待审批的调用（例如审批记录已被消费）补"未完成"的错误结果
    for (const c of pendingCalls) {
      const handled = decided.includes(c) || undecided.some((u) => u.callId === c.id);
      if (!handled) results.push(errorResult(c, MESSAGES.notCompleted));
    }
    const ended = await settleBatch(batchCalls, results, batch.deferred, undecided);
    if (ended) return ended;
    await opts.store.deletePaused(runId);
  } else {
    transcript = [...opts.messages];
    // 客户端回传的历史不可信（C1）：末尾没有结果的 tool_use 不执行，只补"未完成"的错误结果
    const dangling = unansweredToolUses(transcript);
    if (dangling.length) {
      transcript.push({ id: newId("msg_"), role: "tool", content: dangling.map((c) => errorResult(c, MESSAGES.notCompleted)) });
    }
  }

  // ── 主循环 ─────────────────────────────────────────────────────────────
  for (;;) {
    if (signal.aborted) return end("aborted");

    // 投递插话：插在上一批 tool_result 之后、下一次请求之前
    if (steering.length) {
      for (const s of steering.splice(0)) {
        transcript.push(s.message);
        emit({ type: "user_message", message: s.message, via: "steer" });
        s.resolve({ delivered: true });
      }
    }

    const stepIndex = steps.length;
    let model = opts.model;
    let system = opts.system;
    let activeTools: string[] | undefined;
    let temperature = opts.temperature;
    let maxOutputTokens = opts.maxOutputTokens;

    if (opts.prepareStep) {
      const r = await opts.prepareStep({
        stepIndex,
        messages: transcript,
        ...(system !== undefined ? { system } : {}),
        model,
        app,
        ...(lastUsage ? { lastUsage } : {}),
        capabilities: opts.provider.capabilities(model),
        signal,
      });
      if (r) {
        if (r.messages) transcript = r.messages;
        if (r.system !== undefined) system = r.system;
        if (r.model !== undefined) model = r.model;
        if (r.activeTools) activeTools = r.activeTools;
        if (r.temperature !== undefined) temperature = r.temperature;
        if (r.maxOutputTokens !== undefined) maxOutputTokens = r.maxOutputTokens;
      }
    }

    const toolDefs: ToolDef[] = [...tools.values()]
      .filter((t) => isModelVisible(t) && (!activeTools || activeTools.includes(t.name)))
      .map((t) => toToolDef(t));

    const compact = async (force: boolean): Promise<boolean> => {
      if (!opts.compactor) return false;
      const c = await opts.compactor.maybeCompact({
        messages: transcript,
        ...(lastUsage ? { lastUsage } : {}),
        capabilities: opts.provider.capabilities(model),
        provider: opts.provider,
        model,
        ...(system !== undefined ? { system } : {}),
        tools: toolDefs,
        force,
        signal,
      });
      if (!c) return false;
      transcript = c.messages;
      emit({ type: "compaction", info: c.info });
      return true;
    };
    await compact(false);

    const stepId = newId("step_");
    emit({ type: "step_start", stepId, index: stepIndex });
    const messageId = newId("msg_");
    emit({ type: "message_start", stepId, messageId, role: "assistant" });

    const buildRequest = (): ModelRequest => ({
      model,
      ...(system !== undefined ? { system } : {}),
      messages: toModelMessages(transcript),
      ...(toolDefs.length ? { tools: toolDefs } : {}),
      ...(opts.serverTools?.length ? { serverTools: opts.serverTools } : {}),
      ...(opts.thinking !== undefined ? { thinking: opts.thinking } : {}),
      ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(opts.safetyCheck ? { safetyCheck: opts.safetyCheck } : {}),
      ...(opts.providerOptions ? { providerOptions: opts.providerOptions } : {}),
    });

    // ── 请求模型（含重试、上下文溢出时强制压缩一次）──
    let blocks: Block[] = [];
    let finish: FinishReason = "other";
    let stepUsage: Usage = emptyUsage();
    let aborted = false;
    let overflowRetried = false;
    for (let attempt = 1; ; attempt++) {
      const completed = new Map<number, Block>();
      const partial = new Map<number, { type: "text" | "thinking"; text: string }>();
      let emittedAny = false;
      let gotFinish: FinishReason | undefined;
      try {
        for await (const ev of opts.provider.stream(buildRequest(), signal)) {
          if (ev.type === "block_start") {
            emittedAny = true;
            if (ev.block.type === "text" || ev.block.type === "thinking") partial.set(ev.index, { type: ev.block.type, text: "" });
            emit({ type: "block_start", messageId, index: ev.index, block: ev.block });
          } else if (ev.type === "block_delta") {
            emittedAny = true;
            const p = partial.get(ev.index);
            if (p && (ev.delta.kind === "text" || ev.delta.kind === "thinking")) p.text += ev.delta.text;
            emit({ type: "block_delta", messageId, index: ev.index, delta: ev.delta });
          } else if (ev.type === "block_end") {
            emittedAny = true;
            let block = ev.block;
            if (block.type === "tool_use" && block.input === undefined) {
              const input = parseToolArguments(block.arguments);
              if (input !== undefined) block = { ...block, input };
            }
            completed.set(ev.index, block);
            partial.delete(ev.index);
            emit({ type: "block_end", messageId, index: ev.index, block });
          } else if (ev.type === "usage") {
            stepUsage = ev.usage;
          } else if (ev.type === "finish") {
            gotFinish = ev.reason;
          }
        }
        blocks = [...completed.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
        finish = gotFinish ?? "other";
        break;
      } catch (e) {
        if (signal.aborted) {
          // 中止：保留已经流式输出的文字（未完成的 tool_use 丢弃）
          const all = new Map<number, Block>(completed);
          for (const [i, p] of partial) if (p.text) all.set(i, { type: p.type, text: p.text });
          blocks = [...all.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
          aborted = true;
          break;
        }
        const pe = toProviderError(e);
        if (pe.kind === "context_overflow" && !overflowRetried && !emittedAny) {
          overflowRetried = true;
          if (await compact(true)) {
            attempt--;
            continue;
          }
        }
        // 已经有内容流式输出给用户后不再重试，避免重复的增量
        if (pe.retryable && !emittedAny && attempt < retry.maxAttempts) {
          const delayMs = pe.retryAfterMs ?? Math.min(retry.maxDelayMs, retry.baseDelayMs * 2 ** (attempt - 1));
          emit({ type: "retry", attempt, delayMs, error: { kind: pe.kind, message: pe.message } });
          try {
            await abortableSleep(delayMs, signal);
          } catch {
            aborted = true;
            break;
          }
          continue;
        }
        emit({ type: "step_end", stepId, finish: "other", usage: stepUsage });
        return fail(pe.kind, pe.message, pe.retryable);
      }
    }

    const assistant: Message = { id: messageId, role: "assistant", content: blocks };
    if (blocks.length) transcript.push(assistant);
    lastUsage = stepUsage;
    totalUsage = addUsage(totalUsage, stepUsage);
    const stepCost = opts.provider.price?.(model, stepUsage, new Date());
    if (stepCost !== undefined) costUsd = (costUsd ?? 0) + stepCost;
    emit({ type: "step_end", stepId, finish: aborted ? "other" : finish, usage: stepUsage });
    const calls = blocks.filter((b): b is ToolUseBlock => b.type === "tool_use");
    steps.push({ index: stepIndex, message: assistant, toolCalls: calls, usage: stepUsage });

    if (aborted) {
      // 已完成的 tool_use 也要有结果，保证 transcript 合法（不变量 1、6）
      if (calls.length) {
        transcript.push({ id: newId("msg_"), role: "tool", content: calls.map((c) => errorResult(c, MESSAGES.aborted)) });
      }
      return end("aborted");
    }
    if (finish === "refusal") return end("refusal");

    if (calls.length) {
      const { results, deferred } = await runBatch(calls);
      const paused = await settleBatch(calls, results, deferred);
      if (paused) return paused;
      if (signal.aborted) return end("aborted");
    }

    const stopper = stopWhen.find((c) => c({ steps, totalUsage, ...(costUsd !== undefined ? { costUsd } : {}) }));
    if (stopper) return end(isStepCountCondition(stopper) ? "max_steps" : "stop_condition");

    if (!calls.length) {
      if (steering.length) continue;
      if (followUps.length) {
        for (const m of followUps.splice(0)) {
          transcript.push(m);
          emit({ type: "user_message", message: m, via: "followUp" });
        }
        continue;
      }
      return end("completed");
    }
  }
}
