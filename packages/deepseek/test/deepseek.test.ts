import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineTool,
  run,
  userMessage,
  type Block,
  type Message,
  type ProviderEvent,
  type ToolContext,
} from "@leochat/core";
import toolCallSse from "./fixtures/messages-tool-call.sse?raw";
import websearchSse from "./fixtures/messages-websearch.sse?raw";
import {
  buildBody,
  deepseek,
  deepseekFetch,
  deepseekOcr,
  deepseekSearch,
  errorFromStatus,
  isPeak,
  mapMessagesStream,
  parseSse,
  priceUsage,
  toWireMessages,
} from "../src/index";

function streamOf(text: string, chunk = 97): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  let i = 0;
  return new ReadableStream({
    pull(c) {
      if (i >= bytes.length) return c.close();
      c.enqueue(bytes.slice(i, i + chunk)); // 故意按奇数长度切，覆盖跨块的行
      i += chunk;
    },
  });
}

async function events(sse: string): Promise<ProviderEvent[]> {
  const out: ProviderEvent[] = [];
  for await (const e of mapMessagesStream(parseSse(streamOf(sse)))) out.push(e);
  return out;
}

const blocksOf = (evs: ProviderEvent[]): Block[] =>
  evs.filter((e): e is Extract<ProviderEvent, { type: "block_end" }> => e.type === "block_end").map((e) => e.block);

interface Captured {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

function mockFetch(responses: Array<() => Response>) {
  const calls: Captured[] = [];
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    calls.push({ url: String(input), init: init ?? {}, body });
    const next = responses.shift();
    if (!next) throw new Error("mockFetch: no more responses");
    return next();
  }) as typeof fetch;
  return { fetch: f, calls };
}

const sseResponse = (text: string) => () =>
  new Response(streamOf(text), { status: 200, headers: { "content-type": "text/event-stream" } });
const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("mapMessagesStream (recorded DeepSeek responses)", () => {
  it("web search: thinking with signature, server tool blocks, cited text, normalized usage", async () => {
    const evs = await events(websearchSse);
    const blocks = blocksOf(evs);
    expect(blocks.map((b) => b.type)).toEqual(["thinking", "server_tool_use", "server_tool_result", "thinking", "text", "text"]);

    const thinking = blocks[0]!;
    expect(thinking.type === "thinking" && typeof thinking.providerData?.signature).toBe("string");

    const use = blocks[1]!;
    expect(use).toMatchObject({ type: "server_tool_use", name: "deepseek_web_search" });
    expect(use.type === "server_tool_use" && (use.input as { queries: string[] }).queries.length).toBeGreaterThan(0);

    const result = blocks[2]!;
    expect(result.type === "server_tool_result" && result.results.length).toBeGreaterThan(0);
    expect(result.type === "server_tool_result" && result.results[0]!.providerData?.encrypted_content).toBeTruthy();

    const cited = blocks.filter((b) => b.type === "text" && b.citations?.length);
    expect(cited.length).toBeGreaterThan(0);
    expect(cited[0]!.type === "text" && cited[0]!.citations![0]!.citedText).toBeTruthy();

    const usage = evs.find((e) => e.type === "usage");
    // 录制数据：input_tokens 2564（未命中）+ cache_read 1024 = 3588
    expect(usage).toEqual({
      type: "usage",
      usage: {
        inputTokens: 3588,
        outputTokens: 376,
        cacheHitTokens: 1024,
        cacheMissTokens: 2564,
        reasoningTokens: 229,
        serverToolCalls: { web_search: 2, read_url: 0, image_search: 0 }, // 计费数字 tool_search=2（一次搜索两个查询词）
      },
    });
    expect(evs.at(-1)).toEqual({ type: "finish", reason: "end_turn" });
  });

  it("tool call: raw arguments are the concatenated partial_json (C2)", async () => {
    const evs = await events(toolCallSse);
    const tu = blocksOf(evs).find((b) => b.type === "tool_use");
    expect(tu).toMatchObject({ type: "tool_use", name: "get_weather", input: { city: "Hangzhou" } });
    const deltas = evs
      .filter((e): e is Extract<ProviderEvent, { type: "block_delta" }> => e.type === "block_delta" && e.delta.kind === "input_json")
      .map((e) => (e.delta as { partial: string }).partial)
      .join("");
    expect(tu?.type === "tool_use" && tu.arguments).toBe(deltas);
    expect(evs.at(-1)).toEqual({ type: "finish", reason: "tool_use" });
  });

  it("SSE error events become typed ProviderErrors", async () => {
    const sse = 'event: error\ndata: {"type":"error","error":{"type":"overloaded_error","message":"busy"}}\n\n';
    await expect(events(sse)).rejects.toMatchObject({ kind: "overloaded", retryable: true });
  });
});

describe("request mapping", () => {
  const conversation: Message[] = [
    { id: "s", role: "system", content: [{ type: "text", text: "extra system" }] },
    userMessage("weather?"),
    {
      id: "a",
      role: "assistant",
      content: [
        { type: "thinking", text: "need tool", providerData: { signature: "sig-123" } },
        { type: "text", text: "Checking." },
        { type: "tool_use", id: "c1", name: "get_weather", arguments: '{"city": "A"}', input: { city: "A" } },
      ],
    },
    { id: "t", role: "tool", content: [{ type: "tool_result", toolUseId: "c1", content: [{ type: "text", text: "18C" }], data: { x: 1 } }] },
    userMessage("and tomorrow?"),
  ];

  it("merges system messages, round-trips thinking signatures, merges tool results with a following user turn", () => {
    const { system, messages } = toWireMessages(conversation, "base system");
    expect(system).toBe("base system\n\nextra system");
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    const assistant = messages[1]!.content as Array<Record<string, unknown>>;
    expect(assistant[0]).toEqual({ type: "thinking", thinking: "need tool", signature: "sig-123" });
    expect(assistant[2]).toEqual({ type: "tool_use", id: "c1", name: "get_weather", input: { city: "A" } });
    const last = messages[2]!.content as Array<Record<string, unknown>>;
    // tool_result 排在最前面，后面才是插话/新消息
    expect(last.map((b) => b.type)).toEqual(["tool_result", "text"]);
    expect(last[0]).toEqual({ type: "tool_result", tool_use_id: "c1", content: [{ type: "text", text: "18C" }] });
  });

  it("re-sends server tool blocks exactly as received", async () => {
    const blocks = blocksOf(await events(websearchSse));
    const { messages } = toWireMessages([userMessage("q"), { id: "a", role: "assistant", content: blocks }]);
    const wire = messages[1]!.content as Array<Record<string, unknown>>;
    const result = wire.find((b) => b.type === "web_search_tool_result")!;
    const original = blocks.find((b) => b.type === "server_tool_result")!;
    expect(result).toEqual(original.providerData!.raw);
  });

  it("builds the body: tools, server tools, thinking, safety check, default max_tokens", () => {
    const body = buildBody(
      {
        model: "deepseek-flash",
        messages: [userMessage("hi")],
        tools: [{ name: "get_weather", description: "w", inputSchema: { type: "object" } }],
        serverTools: ["web_search", "read_url"],
        thinking: true,
        safetyCheck: "high",
      },
      8192,
    );
    expect(body).toMatchObject({
      model: "deepseek-flash",
      max_tokens: 8192,
      stream: true,
      thinking: { type: "enabled" },
      safety_check: { level: "high" },
      tools: [
        { name: "get_weather", description: "w", input_schema: { type: "object" } },
        { type: "deepseek_web_search", name: "deepseek_web_search" },
        { type: "deepseek_read_url", name: "deepseek_read_url" },
      ],
    });
  });
});

describe("Files API header (Q7)", () => {
  it("adds anthropic-beta only when the request references uploaded files", async () => {
    const { fetch, calls } = mockFetch([sseResponse(toolCallSse), sseResponse(toolCallSse)]);
    const p = deepseek({ apiKey: "k", fetch });
    const drainAll = async (messages: Message[]) => {
      for await (const _ of p.stream({ model: "deepseek-flash", messages })) void _;
    };
    await drainAll([userMessage("plain")]);
    await drainAll([userMessage([{ type: "text", text: "read this" }, { type: "file", fileId: "file-api-1" }])]);
    const h = (i: number) => calls[i]!.init.headers as Record<string, string>;
    expect(h(0)["anthropic-beta"]).toBeUndefined();
    expect(h(1)["anthropic-beta"]).toBe("files-api-2025-04-14");
    expect((calls[1]!.body.messages as Array<{ content: unknown[] }>)[0]!.content[1]).toEqual({
      type: "document",
      source: { type: "file", file_id: "file-api-1" },
    });
  });
});

describe("errors", () => {
  it("maps HTTP statuses to error kinds", () => {
    expect(errorFromStatus(401, "bad key").kind).toBe("auth");
    expect(errorFromStatus(402, "no money").kind).toBe("insufficient_balance");
    expect(errorFromStatus(503, "busy")).toMatchObject({ kind: "overloaded", retryable: true });
    expect(errorFromStatus(429, "slow", "2")).toMatchObject({ kind: "rate_limit", retryAfterMs: 2000 });
    expect(errorFromStatus(400, "This model's maximum context length is 1000000 tokens").kind).toBe("context_overflow");
    expect(errorFromStatus(400, "tools: client tools can only be used ...").kind).toBe("invalid_request");
  });

  it("the provider throws a ProviderError with the API message on HTTP errors", async () => {
    const { fetch } = mockFetch([jsonResponse(401, { error: { message: "Authentication Fails" } })]);
    const p = deepseek({ apiKey: "k", fetch });
    const it = p.stream({ model: "deepseek-flash", messages: [userMessage("x")] })[Symbol.asyncIterator]();
    await expect(it.next()).rejects.toMatchObject({ kind: "auth", message: "Authentication Fails", status: 401 });
  });
});

describe("pricing", () => {
  it("doubles at peak hours and adds search fees", () => {
    const usage = { inputTokens: 1_000_000, outputTokens: 0, cacheHitTokens: 0, cacheMissTokens: 1_000_000 };
    const offPeak = new Date("2026-11-14T12:00:00Z"); // 周六
    const peak = new Date("2026-11-13T02:00:00Z"); // 周五 UTC 02:00
    expect(isPeak(offPeak)).toBe(false);
    expect(isPeak(peak)).toBe(true);
    expect(priceUsage("deepseek-flash", usage, offPeak)).toBeCloseTo(0.15);
    expect(priceUsage("deepseek-flash", usage, peak)).toBeCloseTo(0.3);
    expect(priceUsage("deepseek-flash", { inputTokens: 0, outputTokens: 0, serverToolCalls: { web_search: 4 } }, offPeak)).toBeCloseTo(0.003);
    expect(priceUsage("unknown-model", usage, offPeak)).toBeUndefined();
  });
});

describe("standalone tools", () => {
  const ctx = (app: unknown = {}): ToolContext<unknown> => ({
    runId: "r",
    callId: "c",
    signal: new AbortController().signal,
    app,
    emit: () => {},
    update: () => {},
  });

  it("web_search gives summaries to the model and cards to the UI", async () => {
    const { fetch, calls } = mockFetch([
      jsonResponse(200, {
        results: [{ title: "DeepSeek API", url: "https://x.test/a", snippet: "short", summary: "long summary", site_name: "X" }],
      }),
    ]);
    const tool = deepseekSearch({ apiKey: "k", fetch });
    const out = await tool.execute({ query: "deepseek" }, ctx());
    expect(calls[0]!.url).toBe("https://api.deepseek.com/v1/tools/search");
    expect(calls[0]!.body).toEqual({ query: "deepseek", count: 8 });
    expect(out.content).toContain("long summary");
    expect(out.ui).toMatchObject({ type: "cards", cards: [{ title: "DeepSeek API", subtitle: "X", lines: ["short"], href: "https://x.test/a" }] });
  });

  it("business errors (400) become ToolErrors the model can see", async () => {
    const { fetch } = mockFetch([jsonResponse(400, { error: { message: "query must be at most 128 characters" } })]);
    await expect(deepseekSearch({ apiKey: "k", fetch }).execute({ query: "x" }, ctx())).rejects.toMatchObject({
      name: "ToolError",
      message: "query must be at most 128 characters",
    });
  });

  it("read_url rejects non-http URLs at validation time", () => {
    const tool = deepseekFetch({ apiKey: "k" });
    expect(tool.input.safeParse({ url: "file:///etc/passwd" }).success).toBe(false);
    expect(tool.input.safeParse({ url: "https://example.com" }).success).toBe(true);
  });

  it("ocr resolves the file through the app and treats 200 + error body as a failure", async () => {
    const resolved: string[] = [];
    const resolveFile = async (ref: string) => (resolved.push(ref), { blob: new Blob(["%PDF"]), filename: "a.pdf" });
    const ok = mockFetch([
      jsonResponse(200, {
        page_count: 2,
        pages: [
          { index: 0, text: "hello", finish_reason: "stop" },
          { index: 1, text: "wor", finish_reason: "length" },
        ],
      }),
    ]);
    const out = await deepseekOcr({ apiKey: "k", fetch: ok.fetch, resolveFile }).execute({ file: "uploads/a.pdf" }, ctx());
    expect(resolved).toEqual(["uploads/a.pdf"]);
    expect(ok.calls[0]!.init.body).toBeInstanceOf(FormData);
    expect(out.data).toEqual({ pageCount: 2, truncatedPages: [2] });
    expect(String(out.content)).toContain("pages 2 were cut off");

    const failed = mockFetch([jsonResponse(200, { error: { message: "OCR did not finish in time" } })]);
    await expect(
      deepseekOcr({ apiKey: "k", fetch: failed.fetch, resolveFile }).execute({ file: "x" }, ctx()),
    ).rejects.toMatchObject({ name: "ToolError", message: "OCR did not finish in time" });
  });
});

describe("end to end with run()", () => {
  it("drives a tool round trip over the Messages endpoint and sends the signature back", async () => {
    const { fetch, calls } = mockFetch([sseResponse(toolCallSse), sseResponse(websearchSse)]);
    const weather = defineTool({
      name: "get_weather",
      description: "weather",
      input: z.object({ city: z.string() }),
      execute: ({ city }) => ({ content: `${city}: 18C` }),
    });
    const r = await run({
      provider: deepseek({ apiKey: "test-key", fetch }),
      model: "deepseek-flash",
      messages: [userMessage("weather in Hangzhou?")],
      tools: [weather],
      thinking: true,
    }).result;

    expect(r.reason).toBe("completed");
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe("https://api.deepseek.com/anthropic/v1/messages");
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const second = calls[1]!.body.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>;
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second[1]!.content.some((b) => b.type === "thinking" && typeof b.signature === "string")).toBe(true);
    expect(second[2]!.content[0]).toMatchObject({ type: "tool_result", content: [{ type: "text", text: "Hangzhou: 18C" }] });
    expect(r.costUsd).toBeGreaterThan(0);
  });
});

describe("estimateDeepSeekTokens", () => {
  it("counts Chinese at ~0.6 tokens per character (calibrated against real usage)", async () => {
    const { estimateDeepSeekTokens } = await import("../src/index");
    expect(estimateDeepSeekTokens("推荐展商推荐展商推荐")).toBe(6);
    expect(estimateDeepSeekTokens("abcdefgh")).toBe(2);
    expect(deepseek({ apiKey: "k" }).estimateTokens?.("中文")).toBe(2);
  });
});
