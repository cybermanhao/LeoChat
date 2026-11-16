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

// src/trace/index.ts
var GENAI = {
  OP: "gen_ai.operation.name",
  SYSTEM: "gen_ai.system",
  MODEL: "gen_ai.request.model",
  TOOL: "gen_ai.tool.name",
  CALL_ID: "gen_ai.tool.call.id",
  IN: "gen_ai.usage.input_tokens",
  OUT: "gen_ai.usage.output_tokens",
  CACHE_HIT: "gen_ai.usage.cache_read_input_tokens",
  FINISH: "gen_ai.response.finish_reasons"
};
function createTraceCollector(opts) {
  const now = opts.now ?? Date.now;
  const t0 = now();
  const rel = () => now() - t0;
  const spans = [];
  const byId = /* @__PURE__ */ new Map();
  let usage = emptyUsage();
  let costUsd;
  let runId;
  let agent = null;
  let chat = null;
  let stepFailed = false;
  const tools = /* @__PURE__ */ new Map();
  const toolNames = /* @__PURE__ */ new Map();
  const open = (kind, name, parent, attributes) => {
    const s = { id: `${kind}_${spans.length + 1}`, parentId: parent?.id ?? null, kind, name, startMs: rel(), endMs: null, firstTokenMs: null, status: "ok", attributes };
    spans.push(s);
    byId.set(s.id, s);
    return s;
  };
  const close = (s, status = "ok", attrs = {}) => {
    if (!s || s.endMs !== null) return;
    s.endMs = rel();
    s.status = status;
    Object.assign(s.attributes, attrs);
  };
  const toolSpan = (callId) => {
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
            ...opts.model ? { [GENAI.MODEL]: opts.model } : {}
          });
          break;
        case "step_start":
          stepFailed = false;
          chat = open("chat", `chat ${opts.model ?? ""}`.trim(), agent, {
            [GENAI.OP]: "chat",
            [GENAI.SYSTEM]: opts.system,
            ...opts.model ? { [GENAI.MODEL]: opts.model } : {}
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
            ...e.usage.cacheHitTokens !== void 0 ? { [GENAI.CACHE_HIT]: e.usage.cacheHitTokens } : {},
            [GENAI.FINISH]: e.finish
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
          if (e.result.costUsd !== void 0) costUsd = e.result.costUsd;
          for (const s of spans) if (s.kind !== "agent") close(s, s.endMs === null ? "error" : s.status);
          close(agent, "ok");
          break;
      }
    },
    finish() {
      const firstChat = spans.find((s) => s.kind === "chat");
      const agentSpan = spans.find((s) => s.kind === "agent");
      return {
        ...runId ? { runId } : {},
        spans: spans.map((s) => ({ ...s, attributes: { ...s.attributes } })),
        usage,
        ...costUsd !== void 0 ? { costUsd } : {},
        ttftMs: firstChat?.firstTokenMs ?? null,
        durationMs: agentSpan?.endMs ?? null
      };
    }
  };
}

export { GENAI, createTraceCollector };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map