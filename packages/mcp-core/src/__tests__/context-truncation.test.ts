/**
 * Tests for getContextMessages() in TaskLoop.
 *
 * Since getContextMessages() is private, we test it indirectly by:
 * 1. Mocking global.fetch to capture the request body sent to the LLM.
 * 2. Constructing a TaskLoop with pre-populated history and calling start().
 * 3. Asserting on the messages array inside the captured request body.
 *
 * The direct (non-proxy) path is used (useBackendProxy: false, default).
 * OpenAI provider is used so the message format is straightforward.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import type { ChatMessage } from "@ai-chatbox/shared";
import { TaskLoop } from "../task-loop.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

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

/**
 * Build a ReadableStream that yields the given SSE text as UTF-8 bytes.
 * Produces a valid OpenAI SSE response that causes the stream parser to finish
 * cleanly (finish_reason: "stop" followed by [DONE]).
 */
function makeOAIStream(assistantContent = "ok"): ReadableStream<Uint8Array> {
  const sseText = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: assistantContent }, finish_reason: null }] })}\n\n`,
    `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\n`,
    `data: [DONE]\n\n`,
  ].join("");

  const encoder = new TextEncoder();
  const bytes = encoder.encode(sseText);

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/**
 * Create a mocked fetch that returns a successful SSE stream and captures the
 * first call's parsed request body.
 */
function makeMockFetch(): {
  mockFetch: ReturnType<typeof vi.fn>;
  getCapturedBody: () => Record<string, unknown> | null;
} {
  let capturedBody: Record<string, unknown> | null = null;

  const mockFetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (capturedBody === null && init?.body) {
      capturedBody = JSON.parse(init.body as string) as Record<string, unknown>;
    }
    return {
      ok: true,
      body: makeOAIStream(),
    } as unknown as Response;
  });

  return {
    mockFetch,
    getCapturedBody: () => capturedBody,
  };
}

const BASE_LLM_CONFIG = {
  provider: "openai" as const,
  apiKey: "test-key",
  model: "gpt-4o",
};

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("getContextMessages() – contextLength truncation", () => {
  beforeEach(() => {
    _msgId = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── Test 1: contextLength counts user turns, not individual messages ──────────
  it("contextLength=3 keeps last 3 user turns (each turn = user msg + all following assistant msgs)", async () => {
    // Build 5 alternating user/assistant pairs
    const history: ChatMessage[] = [];
    for (let i = 1; i <= 5; i++) {
      history.push(makeMsg("user", `user turn ${i}`));
      history.push(makeMsg("assistant", `assistant turn ${i}`));
    }

    const { mockFetch, getCapturedBody } = makeMockFetch();
    global.fetch = mockFetch;

    const loop = new TaskLoop({
      chatId: "test-truncation",
      llmConfig: BASE_LLM_CONFIG,
      contextLength: 3,
      history,
    });

    // start() appends "final question" as the 6th user turn.
    // contextLength=3 → keep last 3 user turns: [user4+ass4, user5+ass5, user-final]
    // = 5 messages, then user1 is re-prepended → 6 total.
    await loop.start("final question");

    const body = getCapturedBody();
    expect(body).not.toBeNull();

    const sentMessages = body!.messages as Array<{ role: string; content: string }>;

    // user1(re-prepended) + user4+ass4 + user5+ass5 + user-final = 6 messages
    expect(sentMessages.length).toBe(6);
    // The first message is the original first user message (task context preserved)
    expect(sentMessages[0].content).toBe("user turn 1");
    // The last message is always the new user input
    expect(sentMessages[sentMessages.length - 1].content).toBe("final question");
    // user turn 4 should be present (it's within the last 3 turns)
    expect(sentMessages.some(m => m.content === "user turn 4")).toBe(true);
    // user turn 3 should NOT be present (it's outside the last 3 turns, except user1 re-prepend)
    expect(sentMessages.some(m => m.content === "user turn 3")).toBe(false);
  });

  // ── Test 2: first user message is preserved after truncation ─────────────────
  it("first user message is re-prepended even if truncation would drop it", async () => {
    // Build history: firstUser + many assistant/user pairs so truncation cuts firstUser
    const firstUser = makeMsg("user", "ORIGINAL TASK: do the thing");
    const history: ChatMessage[] = [firstUser];
    for (let i = 1; i <= 6; i++) {
      history.push(makeMsg("assistant", `step ${i}`));
      history.push(makeMsg("user", `follow-up ${i}`));
    }
    // history now has 13 messages; firstUser is at index 0

    const { mockFetch, getCapturedBody } = makeMockFetch();
    global.fetch = mockFetch;

    const loop = new TaskLoop({
      chatId: "test-preserve-first",
      llmConfig: BASE_LLM_CONFIG,
      contextLength: 3, // only last 3; firstUser will be at index 0 of full list
      history,
    });

    await loop.start("another step");

    const body = getCapturedBody();
    expect(body).not.toBeNull();

    const sentMessages = body!.messages as Array<{ role: string; content: string }>;

    // The first user message must appear somewhere in the sent messages
    const foundFirst = sentMessages.some(m => m.content === "ORIGINAL TASK: do the thing");
    expect(foundFirst).toBe(true);
  });

  // ── Test 3: truncation doesn't start on a tool/assistant message ──────────────
  it("after truncation, the first sent message is always role:user (not tool/assistant)", async () => {
    // Build history ending with: assistant(tool_calls) + 2 × tool
    // so that a naive -N slice would start on a non-user message
    const history: ChatMessage[] = [
      makeMsg("user", "first user"),
      makeMsg("assistant", "thinking…"),
      makeMsg("user", "second user"),
      makeMsg("assistant", "", {
        tool_calls: [{ id: "tc1", name: "someTool", arguments: {} }],
      }),
      makeMsg("tool", "tool result", { tool_call_id: "tc1" }),
    ];

    // contextLength=3 → slice = [user "second user", assistant(tool_calls), tool]
    // → advance to first user within slice = "second user"
    const { mockFetch, getCapturedBody } = makeMockFetch();
    global.fetch = mockFetch;

    const loop = new TaskLoop({
      chatId: "test-no-tool-start",
      llmConfig: BASE_LLM_CONFIG,
      contextLength: 3,
      history,
    });

    await loop.start("next step");

    const body = getCapturedBody();
    expect(body).not.toBeNull();

    const sentMessages = body!.messages as Array<{ role: string; content: string }>;
    // First message in sent list must be role=user (system messages are allowed before it,
    // but in this test there are none)
    const nonSystem = sentMessages.filter(m => m.role !== "system");
    expect(nonSystem[0].role).toBe("user");
  });

  // ── Test 4: contextLength=0 sends all messages (no truncation) ───────────────
  it("contextLength=0 (default) sends all messages without truncation", async () => {
    const history: ChatMessage[] = [];
    for (let i = 1; i <= 8; i++) {
      history.push(makeMsg("user", `user ${i}`));
      history.push(makeMsg("assistant", `assistant ${i}`));
    }
    // 16 messages total

    const { mockFetch, getCapturedBody } = makeMockFetch();
    global.fetch = mockFetch;

    const loop = new TaskLoop({
      chatId: "test-no-truncation",
      llmConfig: BASE_LLM_CONFIG,
      contextLength: 0, // no truncation
      history,
    });

    await loop.start("go");

    const body = getCapturedBody();
    expect(body).not.toBeNull();

    const sentMessages = body!.messages as Array<{ role: string; content: string }>;

    // All 16 history + 1 new user message = 17
    expect(sentMessages.length).toBe(17);
  });

  // ── Test 5: system messages always included regardless of contextLength ────────
  it("system messages are always included even when contextLength cuts other messages", async () => {
    const history: ChatMessage[] = [
      makeMsg("user", "user 1"),
      makeMsg("assistant", "assistant 1"),
      makeMsg("user", "user 2"),
      makeMsg("assistant", "assistant 2"),
      makeMsg("user", "user 3"),
      makeMsg("assistant", "assistant 3"),
    ];

    const { mockFetch, getCapturedBody } = makeMockFetch();
    global.fetch = mockFetch;

    const loop = new TaskLoop({
      chatId: "test-system-preserved",
      llmConfig: BASE_LLM_CONFIG,
      contextLength: 2,
      history,
      systemPrompt: "You are a helpful assistant",
    });

    await loop.start("go");

    const body = getCapturedBody();
    expect(body).not.toBeNull();

    const sentMessages = body!.messages as Array<{ role: string; content: string }>;
    const systemMessages = sentMessages.filter(m => m.role === "system");
    expect(systemMessages.length).toBe(1);
    expect(systemMessages[0].content).toBe("You are a helpful assistant");
  });
});
