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

// src/testing/index.ts
var DEFAULT_TEST_CAPABILITIES = {
  contextWindow: 128e3,
  maxOutput: 8192,
  tools: true,
  parallelToolCalls: true,
  thinking: true,
  vision: false,
  files: false,
  serverTools: [],
  cacheStats: true
};
function chunks(text, size) {
  if (text === "") return [];
  const out = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}
function sleep(ms, signal) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true }
    );
  });
}
function defaultFinish(blocks) {
  return blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
}
function scriptedProvider(turns, opts = {}) {
  const queue = [...turns];
  const requests = [];
  const caps = { ...DEFAULT_TEST_CAPABILITIES, ...opts.capabilities };
  const provider = {
    id: opts.id ?? "scripted",
    requests,
    remaining: () => queue.length,
    capabilities: () => caps,
    ...opts.price ? { price: opts.price } : {},
    async *stream(req, signal) {
      requests.push(structuredClone(req));
      const turn = queue.shift();
      if (!turn) throw new ProviderError("unknown", "scriptedProvider: no more scripted turns");
      if ("error" in turn) throw turn.error;
      const size = turn.chunkSize ?? 4;
      let deltasSent = 0;
      const delay = turn.delayMs ?? 0;
      for (const [index, block] of turn.blocks.entries()) {
        signal?.throwIfAborted();
        if (block.type === "text" || block.type === "thinking") {
          yield { type: "block_start", index, block: { type: block.type } };
          for (const piece of chunks(block.text, size)) {
            await sleep(delay, signal);
            signal?.throwIfAborted();
            yield { type: "block_delta", index, delta: { kind: block.type, text: piece } };
            if (turn.failAfterDeltas !== void 0 && ++deltasSent >= turn.failAfterDeltas) {
              throw turn.failWith ?? new ProviderError("network", "scripted mid-stream failure");
            }
          }
        } else if (block.type === "tool_use") {
          yield { type: "block_start", index, block: { type: "tool_use", id: block.id, name: block.name } };
          for (const piece of chunks(block.arguments, size)) {
            await sleep(delay, signal);
            signal?.throwIfAborted();
            yield { type: "block_delta", index, delta: { kind: "input_json", partial: piece } };
          }
        } else {
          yield { type: "block_start", index, block: { type: block.type } };
        }
        yield { type: "block_end", index, block: structuredClone(block) };
      }
      yield { type: "usage", usage: turn.usage ?? { inputTokens: 10, outputTokens: 5 } };
      yield { type: "finish", reason: turn.finish ?? defaultFinish(turn.blocks) };
    }
  };
  return provider;
}
function textTurn(text, extra = {}) {
  return { blocks: [{ type: "text", text }], ...extra };
}
function toolTurn(calls, leadingText) {
  const blocks = [];
  if (leadingText) blocks.push({ type: "text", text: leadingText });
  for (const c of calls) {
    const raw = typeof c.args === "string" ? c.args : JSON.stringify(c.args);
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      input = void 0;
    }
    blocks.push({ type: "tool_use", id: c.id, name: c.name, arguments: raw, ...input === void 0 ? {} : { input } });
  }
  return { blocks };
}

export { DEFAULT_TEST_CAPABILITIES, scriptedProvider, textTurn, toolTurn };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map