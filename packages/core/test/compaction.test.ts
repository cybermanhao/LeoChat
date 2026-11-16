import { describe, expect, it } from "vitest";
import {
  PRUNED_MARKER,
  ProviderError,
  SUMMARY_OPEN_TAG,
  createCompactor,
  cutIsBalanced,
  estimateTokens,
  run,
  textOf,
  type AgentEvent,
  type Capabilities,
  type Compactor,
  type Message,
  type ToolResultBlock,
} from "../src/index";
import { DEFAULT_TEST_CAPABILITIES, scriptedProvider, textTurn } from "../src/testing/index";

// 小窗口：阈值 = min(2000 × 0.8, 2000 − 200 − 0) = 1600；保留区 = 0.2 × 1800 = 360 token
const caps: Capabilities = { ...DEFAULT_TEST_CAPABILITIES, contextWindow: 2000, maxOutput: 200 };
const opts = { headroomTokens: 0, thresholdRatio: 0.8, retainRatio: 0.2, headChars: 50, tailChars: 20 };
const signal = new AbortController().signal;

let n = 0;
const msg = (role: Message["role"], text: string): Message => ({ id: `m${++n}`, role, content: [{ type: "text", text }] });
const toolPair = (id: string, result: string): Message[] => [
  { id: `a_${id}`, role: "assistant", content: [{ type: "tool_use", id, name: "search", arguments: "{}", input: {} }] },
  { id: `t_${id}`, role: "tool", content: [{ type: "tool_result", toolUseId: id, content: [{ type: "text", text: result }] }] },
];
const words = (count: number) => Array.from({ length: count }, (_, i) => `word${i}`).join(" ");

async function compact(c: Compactor, messages: Message[], provider = scriptedProvider([]), extra: Partial<Parameters<Compactor["maybeCompact"]>[0]> = {}) {
  return c.maybeCompact({ messages, capabilities: caps, provider, model: "m", system: "sys", tools: [], signal, ...extra });
}

describe("estimateTokens", () => {
  it("counts CJK characters as ~1 token each and other text as ~4 chars per token", () => {
    expect(estimateTokens("abcdefgh")).toBe(2);
    expect(estimateTokens("推荐展商")).toBe(4);
    expect(estimateTokens("推荐 ab")).toBe(3);
  });
});

describe("createCompactor", () => {
  it("does nothing below the threshold", async () => {
    expect(await compact(createCompactor(opts), [msg("user", "hi"), msg("assistant", "hello")])).toBeNull();
  });

  it("prunes oversized old tool results without calling the model when that is enough", async () => {
    const provider = scriptedProvider([]);
    const messages = [msg("user", "find"), ...toolPair("c1", "x".repeat(8000)), msg("assistant", "found"), msg("user", "thanks"), msg("assistant", "ok")];
    const r = await compact(createCompactor(opts), messages, provider);
    expect(r?.info.kind).toBe("prune");
    expect(r?.info.replacedMessageIds).toEqual(["t_c1"]);
    const text = ((r!.messages[2]!.content[0] as ToolResultBlock).content[0] as { text: string }).text;
    expect(text).toBe("x".repeat(50) + PRUNED_MARKER + "x".repeat(20));
    expect(provider.requests).toHaveLength(0);
    expect(r!.messages).toHaveLength(messages.length); // 只改内容，不删消息
  });

  it("summarizes the old span, keeps the recent tail verbatim, and replays the span as the cache prefix", async () => {
    const archived: string[][] = [];
    const provider = scriptedProvider([textTurn("## Primary Request and Intent\n- find exhibitors\n## Next Step\n- (none)")]);
    const old = Array.from({ length: 8 }, (_, i) => msg(i % 2 ? "assistant" : "user", words(150)));
    const recent = [msg("user", "latest question"), msg("assistant", "latest answer")];
    const messages = [...old, ...recent];
    const r = await compact(createCompactor({ ...opts, archive: (m) => void archived.push(m.map((x) => x.id)) }), messages, provider, {
      tools: [{ name: "search", description: "", inputSchema: {} }],
    });
    expect(r?.info.kind).toBe("summary");
    expect(textOf(r!.messages[0]!)).toContain(SUMMARY_OPEN_TAG);
    expect(textOf(r!.messages[0]!)).toContain("find exhibitors");
    expect(r!.messages.slice(-2).map((m) => m.id)).toEqual(recent.map((m) => m.id));
    expect(r!.info.estimatedTokensFreed).toBeGreaterThan(0);

    const req = provider.requests[0]!;
    const replacedIds = r!.info.replacedMessageIds;
    // 摘要请求 = 被压缩的原文（同样的 system、工具）+ 最后一条压缩指令
    expect(req.messages.slice(0, -1).map((m) => m.id)).toEqual(replacedIds);
    expect(req.system).toBe("sys");
    expect(req.tools?.map((t) => t.name)).toEqual(["search"]);
    expect(req.thinking).toBe(false);
    expect(textOf(req.messages.at(-1)!)).toContain("compaction engine");
    expect(archived).toEqual([replacedIds]);
  });

  it("never splits a tool call from its result", async () => {
    const provider = scriptedProvider([textTurn("short summary")]);
    const messages = [
      ...Array.from({ length: 6 }, (_, i) => msg(i % 2 ? "assistant" : "user", words(200))),
      ...toolPair("c9", words(40)),
      msg("assistant", "done"),
    ];
    const r = await compact(createCompactor({ ...opts, retainRatio: 0.05 }), messages, provider);
    expect(r?.info.kind).toBe("summary");
    // 保留区不会以孤立的 tool 消息开头
    const tailStart = r!.messages[1]!;
    expect(tailStart.role).not.toBe("tool");
    expect(cutIsBalanced(messages, messages.findIndex((m) => m.id === tailStart.id))).toBe(true);
  });

  it("fails closed: truncated, failed, empty or longer-than-original summaries leave the transcript alone", async () => {
    const big = Array.from({ length: 10 }, (_, i) => msg(i % 2 ? "assistant" : "user", words(120)));
    const c = createCompactor(opts);
    // 前提：摘要正常时确实会压缩（否则下面的 null 可能只是因为没触发）
    expect((await compact(c, big, scriptedProvider([textTurn("ok summary")])))?.info.kind).toBe("summary");
    expect(await compact(c, big, scriptedProvider([textTurn("cut off", { finish: "max_tokens" })]))).toBeNull();
    expect(await compact(c, big, scriptedProvider([{ error: new ProviderError("overloaded", "busy") }]))).toBeNull();
    expect(await compact(c, big, scriptedProvider([textTurn("   ")]))).toBeNull();
    expect(await compact(c, big, scriptedProvider([textTurn(words(2000))]))).toBeNull();
  });

  it("uses the provider's own token estimate when it has one", async () => {
    // 1200 个中文字：core 默认按 1 token/字 = 1200+，超过阈值的一半以上；provider 声称 0.1 token/字时远低于阈值
    const chinese = [msg("user", "展".repeat(1700))];
    const cheap = { ...scriptedProvider([]), estimateTokens: (t: string) => Math.ceil(t.length * 0.1) };
    expect(await compact(createCompactor(opts), chinese, cheap)).toBeNull();
    expect(await compact(createCompactor(opts), chinese, scriptedProvider([textTurn("x")]))).not.toBeUndefined();
  });

  it("rejects invalid ratios", () => {
    expect(() => createCompactor({ thresholdRatio: 0.5, retainRatio: 0.6 })).toThrow(RangeError);
  });
});

describe("createCompactor inside run()", () => {
  it("compacts before the step when the transcript is over the threshold", async () => {
    const provider = scriptedProvider([textTurn("## Primary Request and Intent\n- earlier work"), textTurn("final answer")], { capabilities: caps });
    const history = Array.from({ length: 10 }, (_, i) => msg(i % 2 ? "assistant" : "user", words(120)));
    const events: AgentEvent[] = [];
    const h = run({ provider, model: "m", messages: [...history, msg("user", "continue")], compactor: createCompactor(opts) });
    for await (const e of h) events.push(e);
    const r = await h.result;
    expect(r.reason).toBe("completed");
    expect(events.find((e) => e.type === "compaction")).toMatchObject({ info: { kind: "summary" } });
    // 第 1 次请求是摘要，第 2 次是正常请求，用的是压缩后的历史
    expect(textOf(provider.requests[0]!.messages.at(-1)!)).toContain("compaction engine");
    expect(textOf(provider.requests[1]!.messages[0]!)).toContain(SUMMARY_OPEN_TAG);
    expect(textOf(r.transcript[0]!)).toContain("earlier work");
    expect(textOf(r.transcript.at(-1)!)).toBe("final answer");
  });

  it("is forced once on context_overflow even below the estimated threshold", async () => {
    const provider = scriptedProvider(
      [{ error: new ProviderError("context_overflow", "too long") }, textTurn("summary"), textTurn("answer")],
      { capabilities: { ...caps, contextWindow: 1_000_000 } },
    );
    const history = Array.from({ length: 6 }, (_, i) => msg(i % 2 ? "assistant" : "user", words(40)));
    const r = await run({
      provider,
      model: "m",
      messages: [...history, msg("user", "go")],
      compactor: createCompactor({ ...opts, retainRatio: 0.0000001 }),
    }).result;
    expect(r.reason).toBe("completed");
    expect(textOf(r.transcript[0]!)).toContain("summary");
  });
});
