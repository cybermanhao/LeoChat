import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  ProviderError,
  addUsage,
  costAbove,
  defineTool,
  hasToolCall,
  normalizeToolContent,
  parseToolArguments,
  stepCount,
  toPublicEvent,
  toToolDef,
  userMessage,
  validateToolInput,
  type AgentEvent,
  type ProviderEvent,
  type StepRecord,
} from "../src/index";
import { scriptedProvider, textTurn, toolTurn } from "../src/testing/index";

declare global {
  interface ImportMeta {
    glob<T>(pattern: string, opts: { query: string; import: string; eager: true }): Record<string, T>;
  }
}

const weather = defineTool({
  name: "get_weather",
  description: "Get current weather for a city",
  input: z.object({ city: z.string().min(1) }),
  execute: ({ city }) => ({ data: { city, tempC: 18 } }),
});

describe("defineTool / toToolDef", () => {
  it("produces a JSON Schema without $schema for the model", () => {
    const def = toToolDef(weather);
    expect(def.name).toBe("get_weather");
    expect(def.inputSchema).not.toHaveProperty("$schema");
    expect(def.inputSchema).toMatchObject({
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"],
    });
  });

  it("uses jsonSchemaOverride for remote tools", () => {
    const remote = defineTool({
      name: "remote",
      description: "from MCP",
      input: z.unknown(),
      jsonSchemaOverride: { type: "object", properties: { q: { type: "string" } } },
      execute: () => ({ content: "ok" }),
    });
    expect(toToolDef(remote).inputSchema).toEqual({ type: "object", properties: { q: { type: "string" } } });
  });

  it("validates input and explains failures in model-readable text", () => {
    expect(validateToolInput(weather, { city: "Hangzhou" })).toEqual({ ok: true, value: { city: "Hangzhou" } });
    const bad = validateToolInput(weather, { city: 42 });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/city/);
  });
});

describe("parseToolArguments (C2: raw string is canonical)", () => {
  it("parses objects, treats empty as {}, rejects invalid or non-object JSON", () => {
    expect(parseToolArguments('{"city": "Hangzhou"}')).toEqual({ city: "Hangzhou" });
    expect(parseToolArguments("")).toEqual({});
    expect(parseToolArguments("{oops")).toBeUndefined();
    expect(parseToolArguments("[1,2]")).toBeUndefined();
    expect(parseToolArguments("null")).toBeUndefined();
  });
});

describe("normalizeToolContent", () => {
  it("falls back to serialized data", () => {
    expect(normalizeToolContent({ data: { a: 1 } })).toEqual([{ type: "text", text: '{"a":1}' }]);
    expect(normalizeToolContent({ content: "hi" })).toEqual([{ type: "text", text: "hi" }]);
  });
});

describe("addUsage", () => {
  it("sums required and optional fields, keeping optional ones absent when both are absent", () => {
    const a = addUsage({ inputTokens: 10, outputTokens: 2 }, { inputTokens: 5, outputTokens: 1 });
    expect(a).toEqual({ inputTokens: 15, outputTokens: 3 });
    const b = addUsage(
      { inputTokens: 10, outputTokens: 2, cacheHitTokens: 4, serverToolCalls: { web_search: 1 } },
      { inputTokens: 5, outputTokens: 1, cacheHitTokens: 1, serverToolCalls: { web_search: 2, read_url: 1 } },
    );
    expect(b).toEqual({
      inputTokens: 15,
      outputTokens: 3,
      cacheHitTokens: 5,
      serverToolCalls: { web_search: 3, read_url: 1 },
    });
  });
});

describe("stop conditions", () => {
  const step = (index: number, tools: string[] = []): StepRecord => ({
    index,
    message: { id: `m${index}`, role: "assistant", content: [] },
    toolCalls: tools.map((name, i) => ({ type: "tool_use", id: `c${i}`, name, arguments: "{}" })),
    usage: { inputTokens: 1, outputTokens: 1 },
  });
  const usage = { inputTokens: 0, outputTokens: 0 };

  it("stepCount", () => {
    expect(stepCount(2)({ steps: [step(0)], totalUsage: usage })).toBe(false);
    expect(stepCount(2)({ steps: [step(0), step(1)], totalUsage: usage })).toBe(true);
    expect(() => stepCount(0)).toThrow(RangeError);
  });

  it("hasToolCall looks at the latest step only", () => {
    const cond = hasToolCall("finish");
    expect(cond({ steps: [step(0, ["finish"]), step(1, ["search"])], totalUsage: usage })).toBe(false);
    expect(cond({ steps: [step(0), step(1, ["finish"])], totalUsage: usage })).toBe(true);
  });

  it("costAbove never fires without a price", () => {
    expect(costAbove(0.01)({ steps: [], totalUsage: usage })).toBe(false);
    expect(costAbove(0.01)({ steps: [], totalUsage: usage, costUsd: 0.02 })).toBe(true);
  });
});

describe("ProviderError", () => {
  it("derives retryable from kind unless overridden", () => {
    expect(new ProviderError("rate_limit", "slow down").retryable).toBe(true);
    expect(new ProviderError("auth", "bad key").retryable).toBe(false);
    expect(new ProviderError("unknown", "x", { retryable: true }).retryable).toBe(true);
  });
});

describe("toPublicEvent", () => {
  it("strips internal error details from tool_end", () => {
    const e: AgentEvent = {
      type: "tool_end",
      callId: "c1",
      ok: false,
      output: { content: "Tool execution failed", isError: true },
      ms: 3,
      internal: { error: "ECONNREFUSED 10.0.0.5:5432" },
    };
    expect(toPublicEvent(e)).not.toHaveProperty("internal");
  });
});

describe("scriptedProvider", () => {
  async function collect(it: AsyncIterable<ProviderEvent>): Promise<ProviderEvent[]> {
    const out: ProviderEvent[] = [];
    for await (const e of it) out.push(e);
    return out;
  }

  it("streams text as deltas and ends with usage + finish", async () => {
    const p = scriptedProvider([textTurn("hello world", { chunkSize: 5 })]);
    const events = await collect(p.stream({ model: "m", messages: [userMessage("hi")] }));
    expect(events.map((e) => e.type)).toEqual([
      "block_start",
      "block_delta",
      "block_delta",
      "block_delta",
      "block_end",
      "usage",
      "finish",
    ]);
    expect(events.at(-1)).toEqual({ type: "finish", reason: "end_turn" });
    expect(p.requests).toHaveLength(1);
    expect(p.remaining()).toBe(0);
  });

  it("keeps raw tool arguments byte-for-byte and finishes with tool_use", async () => {
    const raw = '{"city":  "Hangzhou"}';
    const p = scriptedProvider([toolTurn([{ id: "c1", name: "get_weather", args: raw }])]);
    const events = await collect(p.stream({ model: "m", messages: [] }));
    const end = events.find((e) => e.type === "block_end");
    expect(end?.type === "block_end" && end.block.type === "tool_use" && end.block.arguments).toBe(raw);
    expect(events.at(-1)).toEqual({ type: "finish", reason: "tool_use" });
  });

  it("throws scripted provider errors and fails when the script runs out", async () => {
    const p = scriptedProvider([{ error: new ProviderError("overloaded", "busy") }]);
    await expect(collect(p.stream({ model: "m", messages: [] }))).rejects.toMatchObject({ kind: "overloaded" });
    await expect(collect(p.stream({ model: "m", messages: [] }))).rejects.toThrow(/no more scripted turns/);
  });

  it("stops when aborted", async () => {
    const p = scriptedProvider([textTurn("a long reply that streams slowly", { chunkSize: 2, delayMs: 5 })]);
    const ac = new AbortController();
    const seen: ProviderEvent[] = [];
    const run = (async () => {
      for await (const e of p.stream({ model: "m", messages: [] }, ac.signal)) {
        seen.push(e);
        if (seen.length === 3) ac.abort();
      }
    })();
    await expect(run).rejects.toBeDefined();
    expect(seen.some((e) => e.type === "finish")).toBe(false);
  });
});

describe("runtime-agnostic guard", () => {
  it("src never imports Node built-ins", () => {
    // import.meta.glob 由 vite 在编译期展开（必须原样书写）；这里不引入 @types/node，保持零 Node 依赖
    const files = import.meta.glob<string>("../src/**/*.ts", { query: "?raw", import: "default", eager: true });
    expect(Object.keys(files).length).toBeGreaterThan(5);
    for (const [path, source] of Object.entries(files)) {
      expect(source, path).not.toMatch(/from\s+["'](node:|fs|path|child_process|os|crypto|stream|buffer)["']/);
      expect(source, path).not.toMatch(/\bprocess\.|\bBuffer\b|\brequire\(/);
    }
  });
});

describe("toPublicEvent hides upstream error details", () => {
  it("replaces provider error messages in retry, error and run_end", () => {
    const secret = "401 from internal-host:8080, key sk-123";
    const retry = toPublicEvent({ type: "retry", attempt: 1, delayMs: 5, error: { kind: "rate_limit", message: secret } });
    const err = toPublicEvent({ type: "error", error: { kind: "auth", message: secret, retryable: false } });
    const end = toPublicEvent({
      type: "run_end",
      result: { runId: "r", reason: "error", transcript: [], usage: { inputTokens: 0, outputTokens: 0 }, error: { kind: "auth", message: secret } },
    });
    for (const e of [retry, err, end]) expect(JSON.stringify(e)).not.toContain("internal-host");
    expect(err).toMatchObject({ error: { kind: "auth", message: "Request failed (auth)" } });
  });
});
