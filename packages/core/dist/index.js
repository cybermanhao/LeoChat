import { z } from 'zod';

// src/blocks.ts
function parseToolArguments(raw) {
  if (raw.trim() === "") return {};
  try {
    const value = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
  } catch {
    return void 0;
  }
}

// src/usage.ts
function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0 };
}
function addOptional(a, b) {
  return a === void 0 && b === void 0 ? void 0 : (a ?? 0) + (b ?? 0);
}
function addUsage(a, b) {
  const out = {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens
  };
  const hit = addOptional(a.cacheHitTokens, b.cacheHitTokens);
  const miss = addOptional(a.cacheMissTokens, b.cacheMissTokens);
  const reasoning = addOptional(a.reasoningTokens, b.reasoningTokens);
  if (hit !== void 0) out.cacheHitTokens = hit;
  if (miss !== void 0) out.cacheMissTokens = miss;
  if (reasoning !== void 0) out.reasoningTokens = reasoning;
  if (a.serverToolCalls || b.serverToolCalls) {
    const merged = { ...a.serverToolCalls };
    for (const [k, v] of Object.entries(b.serverToolCalls ?? {})) merged[k] = (merged[k] ?? 0) + (v ?? 0);
    out.serverToolCalls = merged;
  }
  return out;
}

// src/provider.ts
var RETRYABLE = /* @__PURE__ */ new Set(["rate_limit", "overloaded", "network"]);
var ProviderError = class extends Error {
  kind;
  retryable;
  status;
  retryAfterMs;
  constructor(kind, message, opts = {}) {
    super(message, opts.cause === void 0 ? void 0 : { cause: opts.cause });
    this.name = "ProviderError";
    this.kind = kind;
    this.retryable = opts.retryable ?? RETRYABLE.has(kind);
    if (opts.status !== void 0) this.status = opts.status;
    if (opts.retryAfterMs !== void 0) this.retryAfterMs = opts.retryAfterMs;
  }
};
function isProviderError(e) {
  return e instanceof ProviderError;
}
function defineTool(tool) {
  return tool;
}
function isToolSource(x) {
  return typeof x.list === "function" && !("execute" in x);
}
var ToolError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "ToolError";
  }
};
function isModelVisible(tool) {
  return (tool.visibility ?? ["model"]).includes("model");
}
function toToolDef(tool) {
  let inputSchema;
  if (tool.jsonSchemaOverride) {
    inputSchema = tool.jsonSchemaOverride;
  } else {
    const { $schema: _ignored, ...rest } = z.toJSONSchema(tool.input);
    inputSchema = rest;
  }
  return { name: tool.name, description: tool.description, inputSchema };
}
function validateToolInput(tool, input) {
  const r = tool.input.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: z.prettifyError(r.error) };
}
function normalizeToolContent(out) {
  if (typeof out.content === "string") return [{ type: "text", text: out.content }];
  if (Array.isArray(out.content)) return out.content;
  if (out.data === void 0) return [{ type: "text", text: "" }];
  return [{ type: "text", text: typeof out.data === "string" ? out.data : JSON.stringify(out.data) }];
}

// src/events.ts
function toPublicEvent(e) {
  if (e.type === "tool_end" && e.internal) {
    const { internal: _internal, ...rest } = e;
    return rest;
  }
  return e;
}

// src/stop.ts
var STEP_COUNT = /* @__PURE__ */ new WeakSet();
function isStepCountCondition(c) {
  return STEP_COUNT.has(c);
}
function stepCount(n) {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`stepCount: n must be a positive integer, got ${n}`);
  const cond = ({ steps }) => steps.length >= n;
  STEP_COUNT.add(cond);
  return cond;
}
function hasToolCall(...names) {
  const wanted = new Set(names);
  return ({ steps }) => steps.at(-1)?.toolCalls.some((c) => wanted.has(c.name)) ?? false;
}
function costAbove(usd) {
  return ({ costUsd }) => costUsd !== void 0 && costUsd > usd;
}
var DEFAULT_STOP_WHEN = [stepCount(10)];
function normalizeStopWhen(s) {
  if (s === void 0) return DEFAULT_STOP_WHEN;
  return Array.isArray(s) ? s : [s];
}

// src/messages.ts
function newId(prefix = "") {
  return prefix + crypto.randomUUID();
}
function userMessage(content, id = newId("msg_")) {
  return {
    id,
    role: "user",
    content: typeof content === "string" ? [{ type: "text", text: content }] : content
  };
}
function systemMessage(text, id = newId("msg_")) {
  return { id, role: "system", content: [{ type: "text", text }] };
}
function textOf(message) {
  return message.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

// src/ui/types.ts
var UI_META_KEY = "leochat/ui";

// src/internal/channel.ts
var EventChannel = class {
  buffer = [];
  waiters = [];
  closed = false;
  push(value) {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) waiter({ value, done: false });
    else this.buffer.push(value);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    for (const w of this.waiters.splice(0)) w({ value: void 0, done: true });
  }
  [Symbol.asyncIterator]() {
    return {
      next: () => {
        const value = this.buffer.shift();
        if (value !== void 0) return Promise.resolve({ value, done: false });
        if (this.closed) return Promise.resolve({ value: void 0, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
      return: () => {
        return Promise.resolve({ value: void 0, done: true });
      }
    };
  }
};
function abortableSleep(ms, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
function childController(parent) {
  const ac = new AbortController();
  if (parent.aborted) ac.abort(parent.reason);
  else parent.addEventListener("abort", () => ac.abort(parent.reason), { once: true });
  return ac;
}

// src/internal/execute-tools.ts
var MESSAGES = {
  executionFailed: "Tool execution failed",
  aborted: "Tool call was aborted before it finished.",
  notCompleted: "Tool call was not completed.",
  rejected: "Tool call was not approved by the user.",
  unavailable: "Tool call requires approval, but no approver was available, so it was not run.",
  cancelled: "The approval request was withdrawn, so the tool call was not run.",
  unknownTool: (name) => `Unknown tool: ${name}. Use one of the available tools.`,
  invalidJson: (raw) => `Tool arguments were not valid JSON: ${raw.slice(0, 500)}. Retry the call with a valid JSON object.`,
  invalidInput: (detail) => `Invalid tool arguments:
${detail}
Fix the arguments and retry.`
};
function newApprovalState() {
  return { allowedForRun: /* @__PURE__ */ new Set(), rejectedForRun: /* @__PURE__ */ new Map(), decisionsByCallId: /* @__PURE__ */ new Map() };
}
function errorResult(call, text) {
  return { type: "tool_result", toolUseId: call.id, content: [{ type: "text", text }], isError: true };
}
function truncateText(blocks, max) {
  if (max === void 0) return blocks;
  return blocks.map((b) => {
    if (b.type !== "text" || b.text.length <= max) return b;
    const head = Math.floor(max * 0.7);
    const tail = max - head;
    const cut = b.text.length - head - tail;
    return { ...b, text: `${b.text.slice(0, head)}
\u2026[${cut} characters truncated]\u2026
${b.text.slice(b.text.length - tail)}` };
  });
}
function rejectionText(outcome, message) {
  if (outcome === "rejected") return message ?? MESSAGES.rejected;
  if (outcome === "cancelled") return MESSAGES.cancelled;
  return MESSAGES.unavailable;
}
var VALID_OUTCOMES = /* @__PURE__ */ new Set(["allowed-once", "rejected", "cancelled", "unavailable", "deferred"]);
async function runAnswerers(answerers, req, ctx) {
  const step = async (i) => {
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
  const abort = new Promise(
    (resolve) => req.signal.addEventListener("abort", () => resolve("cancelled"), { once: true })
  );
  return Promise.race([step(0), abort]);
}
async function executeOne(o, call) {
  const started = Date.now();
  const finish = (result2, output2, internal) => {
    o.emit({
      type: "tool_end",
      callId: call.id,
      ok: !result2.isError,
      output: output2,
      ms: Date.now() - started,
      ...internal ? { internal: { error: internal } } : {}
    });
    return { kind: "result", result: result2 };
  };
  const fail = (text, internal) => finish(errorResult(call, text), { content: text, isError: true }, internal);
  const tool = o.tools.get(call.name);
  if (!tool) return fail(MESSAGES.unknownTool(call.name));
  if (call.input === void 0) return fail(MESSAGES.invalidJson(call.arguments));
  let validated = validateToolInput(tool, call.input);
  if (!validated.ok) return fail(MESSAGES.invalidInput(validated.error));
  const ac = childController(o.signal);
  const ctx = {
    runId: o.runId,
    callId: call.id,
    signal: ac.signal,
    app: o.app,
    emit: (name, data) => o.emit({ type: "custom", name, data }),
    update: (progress) => o.emit({ type: "tool_progress", callId: call.id, progress })
  };
  if (o.hooks?.beforeToolCall) {
    const r = await o.hooks.beforeToolCall(call, ctx);
    if (r && "deny" in r) return fail(r.deny);
    if (r && "input" in r) {
      validated = validateToolInput(tool, r.input);
      if (!validated.ok) return fail(MESSAGES.invalidInput(validated.error));
    }
  }
  const input = validated.value;
  let needs = false;
  if (typeof tool.needsApproval === "function") needs = await tool.needsApproval(input, ctx);
  else needs = tool.needsApproval ?? false;
  if (needs !== false) {
    const reason = typeof needs === "string" ? needs : void 0;
    const st = o.approvalState;
    const approvalId = newId("apr_");
    let outcome;
    let automatic = true;
    let rejectMessage;
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
    } else if ((o.approval?.policy ?? "ask") === "never") {
      outcome = "rejected";
    } else {
      o.emit({ type: "approval_request", approvalId, callId: call.id, toolName: tool.name, ...reason ? { reason } : {} });
      automatic = false;
      outcome = await runAnswerers(
        o.approval?.answerers ?? [],
        { approvalId, callId: call.id, toolName: tool.name, ...reason ? { reason } : {}, signal: ac.signal },
        ctx
      );
    }
    o.emit({ type: "approval_resolved", approvalId, callId: call.id, outcome, automatic });
    if (outcome === "deferred") return { kind: "deferred", deferred: { approvalId, call, ...reason ? { reason } : {} } };
    if (outcome !== "allowed-once") return fail(rejectionText(outcome, rejectMessage));
  }
  if (ac.signal.aborted) return fail(MESSAGES.aborted);
  o.emit({ type: "tool_start", callId: call.id, name: call.name, input });
  let output;
  try {
    output = await raceAbort(Promise.resolve(tool.execute(input, ctx)), ac.signal);
  } catch (e) {
    if (ac.signal.aborted) return fail(MESSAGES.aborted);
    if (e instanceof ToolError) return fail(e.message);
    return fail(MESSAGES.executionFailed, e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
  if (o.hooks?.afterToolCall) {
    const replaced = await o.hooks.afterToolCall(call, output, ctx);
    if (replaced) output = replaced;
  }
  const result = {
    type: "tool_result",
    toolUseId: call.id,
    content: truncateText(normalizeToolContent(output), o.maxToolResultChars),
    ...output.isError ? { isError: true } : {},
    ...output.data !== void 0 ? { data: output.data } : {},
    ...output.ui !== void 0 ? { ui: output.ui } : {}
  };
  return finish(result, output);
}
function raceAbort(p, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
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
      }
    );
  });
}
async function executeBatch(o) {
  const sequential = o.calls.some((c) => o.tools.get(c.name)?.executionMode === "sequential");
  const limit = sequential ? 1 : Math.max(1, o.maxParallel);
  const outcomes = new Array(o.calls.length);
  let next = 0;
  const worker = async () => {
    while (next < o.calls.length) {
      const i = next++;
      const call = o.calls[i];
      try {
        outcomes[i] = await executeOne(o, call);
      } catch (e) {
        const text = MESSAGES.executionFailed;
        o.emit({
          type: "tool_end",
          callId: call.id,
          ok: false,
          output: { content: text, isError: true },
          ms: 0,
          internal: { error: e instanceof Error ? e.message : String(e) }
        });
        outcomes[i] = { kind: "result", result: errorResult(call, text) };
      }
    }
  };
  await Promise.allSettled(Array.from({ length: Math.min(limit, o.calls.length) }, worker));
  const results = [];
  const deferred = [];
  for (const out of outcomes) {
    if (out.kind === "result") results.push(out.result);
    else deferred.push(out.deferred);
  }
  return { results, deferred };
}

// src/internal/repeat-reminder.ts
var GENTLE = "You are repeating the exact same tool call with identical arguments. Carefully analyze the previous result before calling again: if the task is not complete, try a different approach or different arguments instead of repeating the call.";
function detailed(tool, count, args) {
  return `Repeated tool call detected:
- tool: ${tool}
- consecutive_calls: ${count}
- arguments: ${args}
The repeated calls are not making progress. Do not call this tool with these exact arguments again. Inspect the latest result and choose a different action, different arguments, or finish the task if enough evidence has been gathered.`;
}
function sortJson(v) {
  if (Array.isArray(v)) return v.map(sortJson);
  if (v !== null && typeof v === "object") {
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = sortJson(v[k]);
    return out;
  }
  return v;
}
var wildcard = (p) => new RegExp(`^${p.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replaceAll("*", ".*")}$`);
function createRepeatTracker(opts = {}) {
  const thresholds = [...opts.thresholds ?? [3, 5, 8]].sort((a, b) => a - b);
  if (thresholds.length === 0 || thresholds.some((t) => !Number.isInteger(t) || t < 2) || new Set(thresholds).size !== thresholds.length) {
    throw new RangeError("repeatToolReminder: thresholds must be distinct integers >= 2");
  }
  const thresholdSet = new Set(thresholds);
  const include = (opts.include ?? []).map(wildcard);
  const exclude = (opts.exclude ?? []).map(wildcard);
  const preview = opts.argumentsPreviewChars ?? 500;
  let chain = null;
  const tracked = (name) => (include.length === 0 || include.some((r) => r.test(name))) && !exclude.some((r) => r.test(name));
  return {
    observe(calls, results) {
      const reminded = [];
      for (const call of calls) {
        if (!tracked(call.name)) continue;
        const canonical = JSON.stringify(sortJson(call.input ?? call.arguments));
        const key = JSON.stringify([call.name, canonical]);
        const count = chain && chain.key === key ? chain.count + 1 : 1;
        chain = { key, count };
        if (!thresholdSet.has(count)) continue;
        const result = results.find((r) => r.toolUseId === call.id);
        if (!result) continue;
        const args = canonical.length > preview ? `${canonical.slice(0, preview)}\u2026 (+${canonical.length - preview} more chars)` : canonical;
        result.content = [...result.content, { type: "text", text: `

${count === thresholds[0] ? GENTLE : detailed(call.name, count, args)}` }];
        reminded.push({ tool: call.name, count });
      }
      return reminded;
    },
    reset() {
      chain = null;
    }
  };
}

// src/store.ts
var deferAnswerer = () => "deferred";
function memoryStore(now = Date.now) {
  const runs = /* @__PURE__ */ new Map();
  return {
    get size() {
      return runs.size;
    },
    async savePaused(run2) {
      const prev = runs.get(run2.runId)?.run.approvals;
      const approvals = run2.approvals.map((a) => ({ ...a, consumed: a.consumed || (prev?.find((p) => p.approvalId === a.approvalId)?.consumed ?? false) }));
      runs.set(run2.runId, { run: structuredClone({ ...run2, approvals }), claimedAt: null });
    },
    async loadPaused(runId) {
      const r = runs.get(runId);
      return r ? structuredClone(r.run) : null;
    },
    async claimPaused(runId, ttlMs) {
      const r = runs.get(runId);
      if (!r) return false;
      if (r.claimedAt !== null && now() - r.claimedAt < ttlMs) return false;
      r.claimedAt = now();
      return true;
    },
    async deletePaused(runId) {
      runs.delete(runId);
    },
    async consumeApproval(runId, approvalId) {
      const a = runs.get(runId)?.run.approvals.find((x) => x.approvalId === approvalId);
      if (!a || a.consumed) return null;
      a.consumed = true;
      return { callId: a.callId };
    }
  };
}
var D1_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS leochat_paused_runs (
    run_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    claimed_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS leochat_approvals (
    approval_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    call_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS leochat_approvals_run ON leochat_approvals (run_id)`
];
function d1Store(db, now = Date.now) {
  return {
    async migrate() {
      await db.batch(D1_SCHEMA.map((sql) => db.prepare(sql)));
    },
    async savePaused(run2) {
      const { approvals, ...state } = run2;
      await db.batch([
        db.prepare(
          `INSERT INTO leochat_paused_runs (run_id, state, claimed_at, created_at) VALUES (?, ?, NULL, ?)
             ON CONFLICT(run_id) DO UPDATE SET state = excluded.state, claimed_at = NULL`
        ).bind(run2.runId, JSON.stringify(state), run2.createdAt),
        // INSERT OR IGNORE：已有审批保留原来的 consumed 状态
        ...approvals.map(
          (a) => db.prepare(`INSERT OR IGNORE INTO leochat_approvals (approval_id, run_id, call_id, tool_name, consumed) VALUES (?, ?, ?, ?, ?)`).bind(a.approvalId, run2.runId, a.callId, a.toolName, a.consumed ? 1 : 0)
        )
      ]);
    },
    async loadPaused(runId) {
      const row = await db.prepare(`SELECT state FROM leochat_paused_runs WHERE run_id = ?`).bind(runId).first();
      if (!row) return null;
      const state = JSON.parse(row.state);
      const rows = await db.prepare(
        `SELECT json_group_array(json_object('approvalId', approval_id, 'callId', call_id, 'toolName', tool_name, 'consumed', consumed)) AS list
           FROM leochat_approvals WHERE run_id = ?`
      ).bind(runId).first();
      const approvals = JSON.parse(rows?.list ?? "[]").map(
        (a) => ({ ...a, consumed: a.consumed === 1 })
      );
      return { ...state, approvals };
    },
    async claimPaused(runId, ttlMs) {
      const t = now();
      const r = await db.prepare(`UPDATE leochat_paused_runs SET claimed_at = ? WHERE run_id = ? AND (claimed_at IS NULL OR claimed_at < ?)`).bind(t, runId, t - ttlMs).run();
      return (r.meta?.changes ?? 0) > 0;
    },
    async deletePaused(runId) {
      await db.batch([
        db.prepare(`DELETE FROM leochat_paused_runs WHERE run_id = ?`).bind(runId),
        db.prepare(`DELETE FROM leochat_approvals WHERE run_id = ?`).bind(runId)
      ]);
    },
    async consumeApproval(runId, approvalId) {
      const row = await db.prepare(`UPDATE leochat_approvals SET consumed = 1 WHERE run_id = ? AND approval_id = ? AND consumed = 0 RETURNING call_id`).bind(runId, approvalId).first();
      return row ? { callId: row.call_id } : null;
    }
  };
}

// src/run.ts
var DEFAULT_RETRY = { maxAttempts: 3, baseDelayMs: 500, maxDelayMs: 8e3 };
var DEFAULT_MAX_PARALLEL = 10;
var RESUME_CLAIM_TTL_MS = 5 * 6e4;
function run(opts) {
  return start(opts, { kind: "fresh" });
}
function resume(opts) {
  const { runId, decisions, ...rest } = opts;
  return start({ ...rest, messages: [] }, { kind: "resume", runId, decisions });
}
function toModelMessages(messages) {
  return messages.filter((m) => m.content.length > 0).map(
    (m) => m.role !== "tool" ? m : {
      ...m,
      content: m.content.map((b) => {
        if (b.type !== "tool_result") return b;
        const { data: _data, ui: _ui, ...rest } = b;
        return rest;
      })
    }
  );
}
function unansweredToolUses(messages) {
  let i = messages.length - 1;
  const answered = /* @__PURE__ */ new Set();
  while (i >= 0 && messages[i].role === "tool") {
    for (const b of messages[i].content) if (b.type === "tool_result") answered.add(b.toolUseId);
    i--;
  }
  const last = messages[i];
  if (!last || last.role !== "assistant") return [];
  return last.content.filter((b) => b.type === "tool_use" && !answered.has(b.id));
}
async function releaseSources(opts) {
  for (const t of opts.tools ?? []) {
    if (isToolSource(t) && t.release) {
      try {
        await t.release();
      } catch {
      }
    }
  }
}
function toProviderError(e) {
  if (isProviderError(e)) return e;
  return new ProviderError("unknown", e instanceof Error ? e.message : String(e), { cause: e });
}
function start(opts, init) {
  const channel = new EventChannel();
  const ac = new AbortController();
  if (opts.signal) {
    if (opts.signal.aborted) ac.abort(opts.signal.reason);
    else opts.signal.addEventListener("abort", () => ac.abort(opts.signal.reason), { once: true });
  }
  const runId = init.kind === "resume" ? init.runId : newId("run_");
  const steering = [];
  const followUps = [];
  let ended;
  const emit = (e) => channel.push(e);
  const notDelivered = (reason) => {
    const map = {
      aborted: { delivered: false, reason: "aborted" },
      error: { delivered: false, reason: "error" },
      awaiting_approval: { delivered: false, reason: "awaiting_approval" },
      max_steps: { delivered: false, reason: "stop_condition" },
      stop_condition: { delivered: false, reason: "stop_condition" }
    };
    return map[reason] ?? { delivered: false, reason: "finished" };
  };
  const result = (async () => {
    let r;
    try {
      r = await loop(opts, init, runId, ac.signal, emit, steering, followUps);
      await releaseSources(opts);
    } catch (e) {
      await releaseSources(opts);
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
    abort(reason) {
      ac.abort(reason === void 0 ? new DOMException("Aborted", "AbortError") : new DOMException(reason, "AbortError"));
    },
    steer(message) {
      if (ended) return Promise.resolve(notDelivered(ended));
      return new Promise((resolve) => {
        steering.push({ message, resolve });
        emit({ type: "queued", kind: "steering", message });
      });
    },
    followUp(message) {
      followUps.push(message);
      emit({ type: "queued", kind: "followUp", message });
    },
    peekQueued() {
      return { steering: steering.map((s) => s.message), followUp: [...followUps] };
    },
    clearQueued(kind) {
      if (kind !== "followUp") for (const s of steering.splice(0)) s.resolve({ delivered: false, reason: "cleared" });
      if (kind !== "steering") followUps.splice(0);
    },
    [Symbol.asyncIterator]: () => channel[Symbol.asyncIterator]()
  };
}
async function loop(opts, init, runId, signal, emit, steering, followUps) {
  emit({ type: "run_start", runId, at: Date.now() });
  const app = opts.app;
  const stopWhen = normalizeStopWhen(opts.stopWhen);
  const retry = opts.retry ?? DEFAULT_RETRY;
  const approvalState = newApprovalState();
  let repeat = null;
  const steps = [];
  let transcript = [];
  let totalUsage = emptyUsage();
  let costUsd;
  let lastUsage;
  const end = (reason, extra = {}) => {
    const r = {
      runId,
      reason,
      transcript,
      usage: totalUsage,
      ...costUsd !== void 0 ? { costUsd } : {},
      ...extra
    };
    emit({ type: "run_end", result: r });
    return r;
  };
  const fail = (kind, message, retryable = false) => {
    emit({ type: "error", error: { kind, message, retryable } });
    return end("error", { error: { kind, message } });
  };
  try {
    repeat = opts.repeatToolReminder === false ? null : createRepeatTracker(opts.repeatToolReminder ?? {});
  } catch (e) {
    return fail("config", e instanceof Error ? e.message : String(e));
  }
  if (opts.approval?.answerers?.includes(deferAnswerer) && !opts.store) {
    return fail("config", "deferAnswerer requires a SessionStore (opts.store); see design doc \xA74.1 (C1)");
  }
  const tools = /* @__PURE__ */ new Map();
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
  const runBatch = (calls) => executeBatch({
    runId,
    calls,
    tools,
    app,
    signal,
    emit,
    ...opts.hooks ? { hooks: opts.hooks } : {},
    ...opts.approval ? { approval: opts.approval } : {},
    approvalState,
    maxParallel: opts.maxParallelToolCalls ?? DEFAULT_MAX_PARALLEL,
    ...opts.maxToolResultChars !== void 0 ? { maxToolResultChars: opts.maxToolResultChars } : {}
  });
  const settleBatch = async (calls, results, deferred, keepApprovals = []) => {
    if (deferred.length > 0 || keepApprovals.length > 0) {
      if (!opts.store) {
        for (const d of deferred) results.push(errorResult(d.call, MESSAGES.unavailable));
      } else {
        const approvals = [
          ...keepApprovals,
          ...deferred.map((d) => ({ approvalId: d.approvalId, callId: d.call.id, toolName: d.call.name }))
        ];
        await opts.store.savePaused({
          runId,
          transcript,
          approvals: approvals.map((a) => ({ ...a, consumed: false })),
          partialResults: results,
          usage: totalUsage,
          createdAt: Date.now()
        });
        const pending = approvals.map((a) => {
          const call = calls.find((c) => c.id === a.callId);
          const d = deferred.find((x) => x.approvalId === a.approvalId);
          return {
            approvalId: a.approvalId,
            toolName: a.toolName,
            displayInput: call?.input ?? call?.arguments,
            ...d?.reason ? { reason: d.reason } : {}
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
  if (init.kind === "resume") {
    if (!opts.store) return fail("config", "resume() requires a SessionStore (opts.store)");
    const paused = await opts.store.loadPaused(runId);
    if (!paused) return fail("not_found", `No paused run: ${runId}`);
    if (!await opts.store.claimPaused(runId, RESUME_CLAIM_TTL_MS)) {
      return fail("conflict", `Paused run ${runId} is already being resumed`);
    }
    transcript = paused.transcript;
    totalUsage = paused.usage;
    const batchCalls = unansweredToolUses(transcript);
    const pendingCalls = batchCalls.filter((c) => !paused.partialResults.some((r) => r.toolUseId === c.id));
    const decided = [];
    const undecided = [];
    for (const a of paused.approvals) {
      if (a.consumed) continue;
      const decision = init.decisions[a.approvalId];
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
    for (const c of pendingCalls) {
      const handled = decided.includes(c) || undecided.some((u) => u.callId === c.id);
      if (!handled) results.push(errorResult(c, MESSAGES.notCompleted));
    }
    const ended = await settleBatch(batchCalls, results, batch.deferred, undecided);
    if (ended) return ended;
    await opts.store.deletePaused(runId);
  } else {
    transcript = [...opts.messages];
    const dangling = unansweredToolUses(transcript);
    if (dangling.length) {
      transcript.push({ id: newId("msg_"), role: "tool", content: dangling.map((c) => errorResult(c, MESSAGES.notCompleted)) });
    }
  }
  let finalStepReason = null;
  for (; ; ) {
    if (signal.aborted) return end("aborted");
    if (steering.length) {
      const take = opts.steeringMode === "one-at-a-time" ? 1 : steering.length;
      for (const s of steering.splice(0, take)) {
        transcript.push(s.message);
        emit({ type: "user_message", message: s.message, via: "steer" });
        repeat?.reset();
        s.resolve({ delivered: true });
      }
    }
    const stepIndex = steps.length;
    let model = opts.model;
    let system = opts.system;
    let activeTools;
    let temperature = opts.temperature;
    let maxOutputTokens = opts.maxOutputTokens;
    if (opts.prepareStep) {
      const r = await opts.prepareStep({
        stepIndex,
        messages: transcript,
        ...system !== void 0 ? { system } : {},
        model,
        app,
        ...lastUsage ? { lastUsage } : {},
        capabilities: opts.provider.capabilities(model),
        signal
      });
      if (r) {
        if (r.messages) transcript = r.messages;
        if (r.system !== void 0) system = r.system;
        if (r.model !== void 0) model = r.model;
        if (r.activeTools) activeTools = r.activeTools;
        if (r.temperature !== void 0) temperature = r.temperature;
        if (r.maxOutputTokens !== void 0) maxOutputTokens = r.maxOutputTokens;
      }
    }
    if (finalStepReason) activeTools = [];
    const toolDefs = [...tools.values()].filter((t) => isModelVisible(t) && (!activeTools || activeTools.includes(t.name))).map((t) => toToolDef(t));
    const compact = async (force) => {
      if (!opts.compactor) return false;
      const c = await opts.compactor.maybeCompact({
        messages: transcript,
        ...lastUsage ? { lastUsage } : {},
        capabilities: opts.provider.capabilities(model),
        provider: opts.provider,
        model,
        ...system !== void 0 ? { system } : {},
        tools: toolDefs,
        ...maxOutputTokens !== void 0 ? { maxOutputTokens } : {},
        force,
        signal
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
    const buildRequest = () => ({
      model,
      ...system !== void 0 ? { system } : {},
      messages: toModelMessages(transcript),
      ...toolDefs.length ? { tools: toolDefs } : {},
      ...opts.serverTools?.length ? { serverTools: opts.serverTools } : {},
      ...opts.thinking !== void 0 ? { thinking: opts.thinking } : {},
      ...maxOutputTokens !== void 0 ? { maxOutputTokens } : {},
      ...temperature !== void 0 ? { temperature } : {},
      ...opts.safetyCheck ? { safetyCheck: opts.safetyCheck } : {},
      ...opts.providerOptions ? { providerOptions: opts.providerOptions } : {}
    });
    let blocks = [];
    let finish = "other";
    let stepUsage = emptyUsage();
    let aborted = false;
    let overflowRetried = false;
    for (let attempt = 1; ; attempt++) {
      const completed = /* @__PURE__ */ new Map();
      const partial = /* @__PURE__ */ new Map();
      let emittedAny = false;
      let gotFinish;
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
            if (block.type === "tool_use" && block.input === void 0) {
              const input = parseToolArguments(block.arguments);
              if (input !== void 0) block = { ...block, input };
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
          const all = new Map(completed);
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
        if (pe.retryable && (!emittedAny || opts.retryAfterPartialOutput) && attempt < retry.maxAttempts) {
          if (emittedAny) emit({ type: "step_reset", stepId, messageId });
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
        emit({ type: "error", error: { kind: pe.kind, message: pe.message, retryable: pe.retryable } });
        emit({ type: "step_end", stepId, finish: "other", usage: stepUsage });
        return end("error", { error: { kind: pe.kind, message: pe.message } });
      }
    }
    const assistant = { id: messageId, role: "assistant", content: blocks };
    if (blocks.length) transcript.push(assistant);
    lastUsage = stepUsage;
    totalUsage = addUsage(totalUsage, stepUsage);
    const stepCost = opts.provider.price?.(model, stepUsage, /* @__PURE__ */ new Date());
    if (stepCost !== void 0) costUsd = (costUsd ?? 0) + stepCost;
    emit({ type: "step_end", stepId, finish: aborted ? "other" : finish, usage: stepUsage });
    const calls = blocks.filter((b) => b.type === "tool_use");
    steps.push({ index: stepIndex, message: assistant, toolCalls: calls, usage: stepUsage });
    if (aborted) {
      if (calls.length) {
        transcript.push({ id: newId("msg_"), role: "tool", content: calls.map((c) => errorResult(c, MESSAGES.aborted)) });
      }
      return end("aborted");
    }
    if (finish === "refusal") return end("refusal");
    if (finalStepReason) {
      if (calls.length) {
        transcript.push({ id: newId("msg_"), role: "tool", content: calls.map((c) => errorResult(c, MESSAGES.notCompleted)) });
      }
      return end(finalStepReason);
    }
    if (calls.length) {
      const { results, deferred } = await runBatch(calls);
      for (const r of repeat?.observe(calls, results) ?? []) {
        emit({ type: "custom", name: "leochat.repeat_tool_reminder", data: r });
      }
      const paused = await settleBatch(calls, results, deferred);
      if (paused) return paused;
      if (signal.aborted) return end("aborted");
    }
    const stopper = stopWhen.find((c) => c({ steps, totalUsage, ...costUsd !== void 0 ? { costUsd } : {} }));
    if (stopper) {
      const reason = isStepCountCondition(stopper) ? "max_steps" : "stop_condition";
      if (opts.finalStepOnStop && calls.length) {
        finalStepReason = reason;
        continue;
      }
      return end(reason);
    }
    if (!calls.length) {
      if (steering.length) continue;
      if (followUps.length) {
        const take = opts.followUpMode === "one-at-a-time" ? 1 : followUps.length;
        for (const m of followUps.splice(0, take)) {
          transcript.push(m);
          emit({ type: "user_message", message: m, via: "followUp" });
          repeat?.reset();
        }
        continue;
      }
      return end("completed");
    }
  }
}
function staticSkills(skills) {
  return {
    list: () => skills.map(({ name, description }) => ({ name, description })),
    load: (name) => skills.find((s) => s.name === name)?.content ?? null
  };
}
function skillCatalog(skills, opts = {}) {
  if (skills.length === 0) return "";
  const max = opts.descriptionMaxLength ?? 200;
  const tool = opts.toolName ?? "load_skill";
  const lines = [...skills].sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
    const d = s.description.replace(/\s+/g, " ").trim();
    return `- ${s.name}: ${d.length > max ? `${d.slice(0, max - 1)}\u2026` : d}`;
  });
  return [`Available skills (call the ${tool} tool with a skill name to read its full instructions before using it):`, ...lines].join("\n");
}
function loadSkillTool(source, opts = {}) {
  return defineTool({
    name: opts.name ?? "load_skill",
    description: "Load the full instructions of a skill listed in the skills catalog. Call this before following a skill.",
    input: z.object({ name: z.string().min(1) }),
    async execute({ name }) {
      const content = await source.load(name);
      if (content === null) {
        const names = (await source.list()).map((s) => s.name).sort().join(", ");
        throw new ToolError(`Unknown skill: ${name}. Available skills: ${names || "(none)"}`);
      }
      return { content, data: { skill: name } };
    }
  });
}

// src/compaction.ts
var SUMMARY_OPEN_TAG = "<compacted-summary>";
var SUMMARY_CLOSE_TAG = "</compacted-summary>";
var PRUNED_MARKER = "\n\n[... tool result middle pruned ...]\n\n";
var INSTRUCTION = [
  "You are now acting as a compaction engine for this AI assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.",
  "",
  'Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section \u2014 never drop a section.',
  "",
  "## Primary Request and Intent",
  "- [the user's original and evolving goals; quote verbatim where the exact wording matters]",
  "",
  "## Key Concepts",
  "- [domain concepts, technologies, entities, and conventions in play]",
  "",
  "## Files, Data and Sources",
  "- [exact paths, ids, URLs, records or tool results that matter, and why]",
  "",
  "## Errors and Fixes",
  "- [error: how it was resolved, plus any related user feedback]",
  "",
  "## Pending Tasks",
  "- [explicitly requested work not yet completed]",
  "",
  "## Current Work",
  "- [precisely what was in progress at this checkpoint]",
  "",
  "## Next Step",
  '- [the single next action, directly in line with the most recent request, or "(none)"]',
  "",
  "## Critical Context",
  "- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]",
  "",
  "Rules:",
  "- Write in the same language the user writes in. Preserve exact file paths, commands, error strings, identifiers, ids, numbers and quoted wording.",
  "- Capture user feedback and explicit instructions faithfully, especially corrections.",
  "- Do NOT mention this summarization request or that the context was compacted.",
  "- Output only the checkpoint text: do not call any tool or take any other action.",
  `- If the conversation already contains a ${SUMMARY_OPEN_TAG} block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.`
].join("\n");
var PREAMBLE = "This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.";
var CJK = /[　-〿぀-ヿ㐀-䶿一-鿿가-힯＀-￯]/g;
function estimateTokens(text) {
  const cjk = text.match(CJK)?.length ?? 0;
  return cjk + Math.ceil((text.length - cjk) / 4);
}
function blockText(b) {
  switch (b.type) {
    case "text":
    case "thinking":
      return b.text;
    case "tool_use":
      return b.name + b.arguments;
    case "tool_result":
      return b.content.map((c) => c.type === "text" ? c.text : "[image]").join("");
    case "server_tool_use":
      return b.name + JSON.stringify(b.input);
    case "server_tool_result":
      return "";
    case "image":
      return "x".repeat(4 * 800);
    // 约 800 token 的图片占位估算
    case "file":
      return "x".repeat(4 * 2e3);
  }
}
function estimateMessage(m, estimate = estimateTokens) {
  return 4 + m.content.reduce((n, b) => n + estimate(blockText(b)), 0);
}
function measureRequest(messages, opts) {
  const est = opts.estimate ?? estimateTokens;
  if (opts.lastUsage && opts.lastUsage.inputTokens > 0) {
    let i = messages.length - 1;
    while (i >= 0 && messages[i].role !== "assistant") i--;
    const added = messages.slice(i + 1).reduce((n, m) => n + estimateMessage(m, est), 0);
    return opts.lastUsage.inputTokens + opts.lastUsage.outputTokens + added;
  }
  const system = opts.system ? est(opts.system) : 0;
  const tools = opts.tools?.length ? est(JSON.stringify(opts.tools)) : 0;
  return system + tools + messages.reduce((n, m) => n + estimateMessage(m, est), 0);
}
function cutIsBalanced(messages, k) {
  const open = /* @__PURE__ */ new Set();
  for (let i = 0; i < k; i++) {
    for (const b of messages[i].content) {
      if (b.type === "tool_use") open.add(b.id);
      if (b.type === "tool_result") open.delete(b.toolUseId);
    }
  }
  return open.size === 0;
}
function pruneText(text, head, tail) {
  const chars = [...text];
  if (chars.length <= head + tail) return text;
  return chars.slice(0, head).join("") + PRUNED_MARKER + chars.slice(chars.length - tail).join("");
}
function createCompactor(o = {}) {
  const thresholdRatio = o.thresholdRatio ?? 0.8;
  const headroom = o.headroomTokens ?? 65536;
  const retainRatio = o.retainRatio ?? 0.16;
  const head = o.headChars ?? 4096;
  const tail = o.tailChars ?? 1024;
  const summaryMaxTokens = o.summaryMaxTokens ?? 16384;
  if (!(retainRatio > 0 && retainRatio < thresholdRatio && thresholdRatio <= 1)) {
    throw new RangeError("createCompactor: require 0 < retainRatio < thresholdRatio <= 1");
  }
  return {
    async maybeCompact(input) {
      const { messages, capabilities, provider, model, system, tools, signal } = input;
      const est = o.estimate ?? (provider.estimateTokens ? (t) => provider.estimateTokens(t) : estimateTokens);
      const window = capabilities.contextWindow;
      const reserve = input.maxOutputTokens ?? Math.min(capabilities.maxOutput, 8192);
      const threshold = Math.floor(Math.min(window * thresholdRatio, window - reserve - headroom));
      const retainBudget = Math.floor(retainRatio * (window - reserve));
      const measure = (ms, useAnchor) => measureRequest(ms, {
        ...useAnchor && input.lastUsage ? { lastUsage: input.lastUsage } : {},
        ...system !== void 0 ? { system } : {},
        ...tools ? { tools } : {},
        estimate: est
      });
      const before = measure(messages, true);
      if (!input.force && before < threshold) return null;
      let first = 0;
      while (first < messages.length && messages[first].role === "system") first++;
      const replaced = /* @__PURE__ */ new Set();
      const pruned = messages.map((m) => {
        if (m.role !== "tool") return m;
        let changed = false;
        const content = m.content.map((b) => {
          if (b.type !== "tool_result") return b;
          const inner = b.content.map((c) => {
            if (c.type !== "text") return c;
            const t = pruneText(c.text, head, tail);
            if (t !== c.text) changed = true;
            return t === c.text ? c : { ...c, text: t };
          });
          return { ...b, content: inner };
        });
        if (!changed) return m;
        replaced.add(m.id);
        return { ...m, content };
      });
      const afterPrune = measure(pruned, false);
      if (replaced.size > 0 && !input.force && afterPrune < threshold) {
        const info2 = { kind: "prune", replacedMessageIds: [...replaced], estimatedTokensFreed: Math.max(0, measure(messages, false) - afterPrune) };
        await archive(o, messages.filter((m) => replaced.has(m.id)), info2);
        return { messages: pruned, info: info2 };
      }
      let keepFrom = pruned.length;
      let acc = 0;
      for (let i = pruned.length - 1; i >= first; i--) {
        acc += estimateMessage(pruned[i], est);
        keepFrom = i;
        if (acc >= retainBudget) break;
      }
      while (keepFrom > first && !cutIsBalanced(pruned, keepFrom)) keepFrom--;
      if (keepFrom <= first) {
        if (replaced.size === 0) return null;
        const info2 = { kind: "prune", replacedMessageIds: [...replaced], estimatedTokensFreed: Math.max(0, measure(messages, false) - afterPrune) };
        await archive(o, messages.filter((m) => replaced.has(m.id)), info2);
        return { messages: pruned, info: info2 };
      }
      const region = messages.slice(first, keepFrom);
      const req = {
        model: o.summaryModel ?? model,
        ...system !== void 0 ? { system } : {},
        messages: [...toModelMessages(region), { id: newId("msg_"), role: "user", content: [{ type: "text", text: INSTRUCTION }] }],
        ...tools?.length ? { tools } : {},
        thinking: false,
        maxOutputTokens: summaryMaxTokens
      };
      let summary = "";
      let finish;
      try {
        for await (const ev of provider.stream(req, signal)) {
          if (ev.type === "block_end" && ev.block.type === "text") summary += ev.block.text;
          if (ev.type === "finish") finish = ev.reason;
        }
      } catch {
        return null;
      }
      summary = summary.trim();
      if (!summary || finish === "max_tokens" || finish === "refusal") return null;
      const summaryMessage = {
        id: newId("msg_"),
        role: "user",
        content: [{ type: "text", text: `${PREAMBLE}

${SUMMARY_OPEN_TAG}
${summary}
${SUMMARY_CLOSE_TAG}` }]
      };
      const regionTokens = region.reduce((n, m) => n + estimateMessage(m, est), 0);
      if (estimateMessage(summaryMessage, est) >= regionTokens) return null;
      const compacted = [...pruned.slice(0, first), summaryMessage, ...pruned.slice(keepFrom)];
      const info = {
        kind: "summary",
        replacedMessageIds: region.map((m) => m.id),
        estimatedTokensFreed: Math.max(0, measure(messages, false) - measure(compacted, false)),
        summaryMessageId: summaryMessage.id
      };
      await archive(o, region, info);
      return { messages: compacted, info };
    }
  };
}
async function archive(o, replaced, info) {
  if (!o.archive) return;
  try {
    await o.archive(replaced, info);
  } catch {
  }
}

export { D1_SCHEMA, DEFAULT_STOP_WHEN, PRUNED_MARKER, ProviderError, SUMMARY_CLOSE_TAG, SUMMARY_OPEN_TAG, ToolError, UI_META_KEY, addUsage, costAbove, createCompactor, cutIsBalanced, d1Store, deferAnswerer, defineTool, emptyUsage, estimateMessage, estimateTokens, hasToolCall, isModelVisible, isProviderError, isStepCountCondition, isToolSource, loadSkillTool, measureRequest, memoryStore, newId, normalizeStopWhen, normalizeToolContent, parseToolArguments, resume, run, skillCatalog, staticSkills, stepCount, systemMessage, textOf, toModelMessages, toPublicEvent, toToolDef, unansweredToolUses, userMessage, validateToolInput };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map