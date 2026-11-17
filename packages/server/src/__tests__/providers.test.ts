/**
 * selectProvider：DeepSeek 有 key 时用原生 provider，其它情况走旧桥接。
 * 上游用录制好的 DeepSeek SSE（packages/deepseek/test/fixtures）代替。
 */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { run, userMessage } from "@leochat/core";
import { selectProvider, DEFAULT_DEEPSEEK_MODEL, type ProviderSource } from "../providers.js";

const FIXTURES = join(__dirname, "../../../deepseek/test/fixtures");

function source(keys: Record<string, string>): ProviderSource {
  return {
    streamChat: vi.fn(),
    resolveProvider: (p, model) => p ?? (model?.startsWith("deepseek") ? "deepseek" : "openrouter"),
    getApiKey: (p) => keys[p],
  };
}

function sseFetch(file: string, requests: Array<{ url: string; body: Record<string, unknown> }>): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(readFileSync(join(FIXTURES, file), "utf8"), { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }) as typeof fetch;
}

describe("selectProvider", () => {
  it("uses the native DeepSeek provider when a key is configured, with web search as a server tool", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const { provider, model } = selectProvider(source({ deepseek: "sk-test" }), "deepseek", undefined, {
      fetch: sseFetch("messages-websearch.sse", requests),
    });
    expect(provider.native).toBe(true);
    expect(model).toBe(DEFAULT_DEEPSEEK_MODEL);
    const r = await run({ provider, model, messages: [userMessage("news?")], serverTools: ["web_search"] }).result;
    expect(r.reason).toBe("completed");
    expect(requests[0]!.url).toMatch(/\/anthropic\/v1\/messages$/);
    expect(JSON.stringify(requests[0]!.body.tools)).toContain("web_search");
    const blocks = r.transcript.at(-1)!.content.map((b) => b.type);
    expect(blocks).toContain("server_tool_use");
    expect(r.usage.serverToolCalls?.web_search ?? 0).toBeGreaterThan(0);
  });

  it("falls back to the legacy bridge without a key or for other providers", () => {
    expect(selectProvider(source({}), "deepseek", "deepseek-flash").provider.native).toBe(false);
    expect(selectProvider(source({ deepseek: "sk" }), "openrouter", "x/y").provider.native).toBe(false);
    expect(selectProvider({ streamChat: vi.fn() }, undefined, undefined).provider.native).toBe(false);
  });

  it("records the upstream error for sanitizing", async () => {
    const fail = (async () => new Response('{"error":{"message":"bad key at internal-host"}}', { status: 401 })) as unknown as typeof fetch;
    const { provider, model } = selectProvider(source({ deepseek: "sk" }), "deepseek", "deepseek-flash", { fetch: fail });
    const r = await run({ provider, model, messages: [userMessage("x")] }).result;
    expect(r.reason).toBe("error");
    expect((provider.lastError as { status?: number }).status).toBe(401);
  });
});
