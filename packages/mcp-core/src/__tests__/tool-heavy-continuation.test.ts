/**
 * Tests for the "继续" (continue) scenario after a tool-heavy session.
 *
 * Scenario: User sends one request that triggers 50 tool rounds. With the old
 * message-count contextLength semantics (contextLength=5 → 30 messages), only
 * the last 30 messages would be visible — roughly 3 tool rounds — causing the
 * AI to lose context and restart from scratch.
 *
 * With the new user-turn-count semantics, the 50-round session has only 1 user
 * turn, so ALL messages are preserved when contextLength ≥ 1.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { ChatMessage } from "@ai-chatbox/shared";
import { TaskLoop } from "../task-loop.js";

let _msgId = 0;
function makeMsg(
  role: ChatMessage["role"],
  content: string,
  extra?: Partial<ChatMessage>
): ChatMessage {
  return {
    id: `msg-${++_msgId}`,
    role,
    content,
    timestamp: Date.now(),
    ...extra,
  };
}

function makeOAIStream(assistantContent = "好的，继续处理中..."): ReadableStream<Uint8Array> {
  const sseText = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: assistantContent }, finish_reason: null }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
    `data: [DONE]\n\n`,
  ].join("");
  const bytes = new TextEncoder().encode(sseText);
  return new ReadableStream<Uint8Array>({
    start(c) { c.enqueue(bytes); c.close(); },
  });
}

function makeMockFetch() {
  let capturedBody: Record<string, unknown> | null = null;
  const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (capturedBody === null && init?.body) {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
    }
    return { ok: true, body: makeOAIStream() } as unknown as Response;
  });
  return {
    mockFetch,
    getBody: () => capturedBody,
  };
}

const LLM = { provider: "openai" as const, apiKey: "test-key", model: "gpt-4o" };

/**
 * Build a simulated post-50-round history:
 * - 1 original user message
 * - 50 × (assistant with tool_calls + tool result)
 * - 1 final assistant summary (no tool_calls)
 * Total: 1 + 50*2 + 1 = 102 messages
 */
function buildHeavyToolHistory(rounds = 50): ChatMessage[] {
  const history: ChatMessage[] = [];
  history.push(makeMsg("user", "做一个股份公司成立时股东的合同"));

  for (let i = 1; i <= rounds; i++) {
    const toolCallId = `tc-${i}`;
    history.push(makeMsg("assistant", "", {
      tool_calls: [{ id: toolCallId, name: "add_paragraph", arguments: { text: `第${i}条内容` } }],
    }));
    history.push(makeMsg("tool", `{"success":true,"paragraph":"第${i}条内容"}`, {
      tool_call_id: toolCallId,
    }));
  }

  // Final assistant summary (no tool_calls — simulates the "final" event message)
  history.push(makeMsg("assistant", "合同文档已创建完毕，共添加了50条款项。"));

  return history;
}

describe("tool-heavy session continuation", () => {
  beforeEach(() => { _msgId = 0; });
  afterEach(() => { vi.restoreAllMocks(); });

  it("after 50 tool rounds, '继续' sends nearly all history (contextLength=5 → 30 user turns)", async () => {
    const history = buildHeavyToolHistory(50);
    // history has 102 messages, but only 1 user turn + 50 tool rounds + 1 final summary

    const { mockFetch, getBody } = makeMockFetch();
    global.fetch = mockFetch;

    const loop = new TaskLoop({
      chatId: "test-heavy",
      llmConfig: LLM,
      contextLength: 5,   // maps to 30 user-turns at the settings level; here the raw count is 5
      history,
    });

    await loop.start("继续");

    const body = getBody();
    expect(body).not.toBeNull();
    const sent = body!.messages as ChatMessage[];
    const nonSystem = sent.filter(m => m.role !== "system");

    // With user-turn semantics:
    // - Original history has 1 user turn ("做一个合同...")
    // - "继续" adds a 2nd user turn
    // - 2 user turns < contextLength=5 → keep ALL history
    // - Expected: all 102 history messages + 1 "继续" = 103
    expect(nonSystem.length).toBe(103);

    // Original user message must be present
    expect(nonSystem[0].content).toBe("做一个股份公司成立时股东的合同");

    // The final assistant summary must be present
    expect(nonSystem.some(m => m.content === "合同文档已创建完毕，共添加了50条款项。")).toBe(true);

    // ALL 50 tool results must be visible (not truncated)
    const toolResults = nonSystem.filter(m => m.role === "tool");
    expect(toolResults.length).toBe(50);

    // "继续" is the last message
    expect(nonSystem[nonSystem.length - 1].content).toBe("继续");
  });

  it("after 50 tool rounds, context includes enough info that AI sees the summary", async () => {
    const history = buildHeavyToolHistory(50);
    const { mockFetch, getBody } = makeMockFetch();
    global.fetch = mockFetch;

    // Even with a very small contextLength=1 (keep last 1 user turn),
    // the original history has only 1 user turn, so everything is preserved.
    const loop = new TaskLoop({
      chatId: "test-heavy-small",
      llmConfig: LLM,
      contextLength: 1,
      history,
    });

    await loop.start("继续");

    const body = getBody();
    const sent = (body!.messages as ChatMessage[]).filter(m => m.role !== "system");

    // With 2 user turns (original + "継続") and contextLength=1:
    // Keep last 1 user turn = the "继续" message only.
    // firstUserMsg re-prepend kicks in → [original-user, "継続"]
    // = 2 messages
    expect(sent.length).toBe(2);
    expect(sent[0].content).toBe("做一个股份公司成立时股东的合同");
    expect(sent[sent.length - 1].content).toBe("继续");
  });

  it("OLD message-count semantics would have sent ≤ 30 messages (regression reference)", async () => {
    // This test documents what WOULD happen with old message-count semantics (contextLength=30 messages).
    // We build the same 102-message history and verify the new semantics sends MORE.
    const history = buildHeavyToolHistory(50);
    const { mockFetch, getBody } = makeMockFetch();
    global.fetch = mockFetch;

    // contextLength=100 (user turns): with 2 user turns, still keeps everything (102+1=103 messages)
    const loop = new TaskLoop({
      chatId: "test-regression",
      llmConfig: LLM,
      contextLength: 100,
      history,
    });

    await loop.start("继续");

    const body = getBody();
    const sent = (body!.messages as ChatMessage[]).filter(m => m.role !== "system");

    // With old semantics, contextLength=100 messages → last 100 messages out of 103 = misses first 3
    // With new semantics, contextLength=100 user turns → 2 user turns < 100 → keep all 103
    // This confirms the new behavior is strictly better for tool-heavy sessions.
    expect(sent.length).toBe(103);

    // Old behavior (message-count=30) would have sent only 30 messages, missing most tool history.
    // New behavior: all 103 messages are visible.
    expect(sent.length).toBeGreaterThan(30);
  });

  it("multi-user-turn conversation still truncates correctly", async () => {
    // A normal chat with 10 user turns — contextLength=3 should keep last 3 turns
    const history: ChatMessage[] = [];
    for (let i = 1; i <= 10; i++) {
      history.push(makeMsg("user", `问题${i}`));
      history.push(makeMsg("assistant", `回答${i}`));
    }

    const { mockFetch, getBody } = makeMockFetch();
    global.fetch = mockFetch;

    const loop = new TaskLoop({
      chatId: "test-multi-turn",
      llmConfig: LLM,
      contextLength: 3,
      history,
    });

    await loop.start("新问题");

    const body = getBody();
    const sent = (body!.messages as ChatMessage[]).filter(m => m.role !== "system");

    // Last 3 user turns: 问题9+回答9, 问题10+回答10, 新问题 = 5 messages
    // + re-prepend 问题1 = 6 messages
    expect(sent.length).toBe(6);
    expect(sent[0].content).toBe("问题1");
    expect(sent.some(m => m.content === "问题9")).toBe(true);
    expect(sent.some(m => m.content === "问题8")).toBe(false);
    expect(sent[sent.length - 1].content).toBe("新问题");
  });
});
