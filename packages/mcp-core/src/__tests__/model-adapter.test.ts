import { describe, it, expect } from "vitest";
import type { ChatMessage } from "@ai-chatbox/shared";
import { createModelAdapter } from "../model-adapter.js";

// Helper to create minimal valid ChatMessage objects
function msg(
  role: ChatMessage["role"],
  content: string,
  extra?: Partial<ChatMessage>
): ChatMessage {
  return {
    id: `msg-${Math.random().toString(36).slice(2, 8)}`,
    role,
    content,
    timestamp: Date.now(),
    ...extra,
  };
}

describe("AnthropicAdapter.buildRequestBody / buildAnthropicMessages", () => {
  const adapter = createModelAdapter("anthropic");
  const llmConfig = {
    provider: "anthropic" as const,
    apiKey: "test-key",
    model: "claude-3-5-sonnet-20241022",
  };

  function getMessages(messages: ChatMessage[]): Array<Record<string, unknown>> {
    const body = adapter.buildRequestBody(messages, undefined, llmConfig) as Record<string, unknown>;
    return body.messages as Array<Record<string, unknown>>;
  }

  // ── Test 1: single tool message ──────────────────────────────────────────────
  it("single tool message becomes a user message with one tool_result item", () => {
    const messages: ChatMessage[] = [
      msg("user", "call the tool"),
      msg("assistant", "", { tool_calls: [{ id: "tc1", name: "myTool", arguments: {} }] }),
      msg("tool", "result", { tool_call_id: "tc1" }),
    ];

    const converted = getMessages(messages);
    const toolUserMsg = converted[converted.length - 1];

    expect(toolUserMsg.role).toBe("user");
    expect(Array.isArray(toolUserMsg.content)).toBe(true);
    const content = toolUserMsg.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(1);
    expect(content[0].type).toBe("tool_result");
    expect(content[0].tool_use_id).toBe("tc1");
    expect(content[0].content).toBe("result");
  });

  // ── Test 2: two consecutive tool messages → merged into ONE user message ─────
  it("two consecutive tool messages are merged into a single user message", () => {
    const messages: ChatMessage[] = [
      msg("user", "do both"),
      msg("assistant", "", {
        tool_calls: [
          { id: "tc1", name: "toolA", arguments: {} },
          { id: "tc2", name: "toolB", arguments: {} },
        ],
      }),
      msg("tool", "result A", { tool_call_id: "tc1" }),
      msg("tool", "result B", { tool_call_id: "tc2" }),
    ];

    const converted = getMessages(messages);
    const toolUserMsg = converted[converted.length - 1];

    expect(toolUserMsg.role).toBe("user");
    const content = toolUserMsg.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(2);
    expect(content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tc1", content: "result A" });
    expect(content[1]).toMatchObject({ type: "tool_result", tool_use_id: "tc2", content: "result B" });

    // Crucially: the two tool results must be in the SAME user message object,
    // not two separate user messages.
    const userMessages = converted.filter(m => m.role === "user");
    expect(userMessages).toHaveLength(2); // original user + merged tool results
  });

  // ── Test 3: three consecutive tool messages → ONE user message with 3 items ──
  it("three consecutive tool messages are merged into a single user message with 3 items", () => {
    const messages: ChatMessage[] = [
      msg("user", "do three"),
      msg("assistant", "", {
        tool_calls: [
          { id: "tc1", name: "toolA", arguments: {} },
          { id: "tc2", name: "toolB", arguments: {} },
          { id: "tc3", name: "toolC", arguments: {} },
        ],
      }),
      msg("tool", "res1", { tool_call_id: "tc1" }),
      msg("tool", "res2", { tool_call_id: "tc2" }),
      msg("tool", "res3", { tool_call_id: "tc3" }),
    ];

    const converted = getMessages(messages);
    const lastMsg = converted[converted.length - 1];

    expect(lastMsg.role).toBe("user");
    const content = lastMsg.content as Array<Record<string, unknown>>;
    expect(content).toHaveLength(3);
    expect(content[0].tool_use_id).toBe("tc1");
    expect(content[1].tool_use_id).toBe("tc2");
    expect(content[2].tool_use_id).toBe("tc3");
  });

  // ── Test 4: tool messages separated by assistant → two separate user messages ─
  it("tool messages separated by an assistant message produce two separate user messages", () => {
    const messages: ChatMessage[] = [
      msg("user", "step one"),
      msg("assistant", "", { tool_calls: [{ id: "tc1", name: "toolA", arguments: {} }] }),
      msg("tool", "first result", { tool_call_id: "tc1" }),
      msg("assistant", "got it, now step two", { tool_calls: [{ id: "tc2", name: "toolB", arguments: {} }] }),
      msg("tool", "second result", { tool_call_id: "tc2" }),
    ];

    const converted = getMessages(messages);

    // Count user messages that contain tool_result content arrays
    const toolResultUserMsgs = converted.filter(
      m => m.role === "user" && Array.isArray(m.content)
    );
    expect(toolResultUserMsgs).toHaveLength(2);

    const first = toolResultUserMsgs[0].content as Array<Record<string, unknown>>;
    const second = toolResultUserMsgs[1].content as Array<Record<string, unknown>>;

    expect(first[0].tool_use_id).toBe("tc1");
    expect(second[0].tool_use_id).toBe("tc2");
  });

  // ── Test 5: no tool messages → pass-through ───────────────────────────────────
  it("messages without tool calls pass through as user/assistant without modification", () => {
    const messages: ChatMessage[] = [
      msg("user", "hello"),
      msg("assistant", "hi there"),
      msg("user", "how are you"),
      msg("assistant", "great, thanks"),
    ];

    const converted = getMessages(messages);
    expect(converted).toHaveLength(4);
    expect(converted[0]).toMatchObject({ role: "user", content: "hello" });
    expect(converted[1]).toMatchObject({ role: "assistant", content: "hi there" });
    expect(converted[2]).toMatchObject({ role: "user", content: "how are you" });
    expect(converted[3]).toMatchObject({ role: "assistant", content: "great, thanks" });
  });

  // ── Test 6: system messages go into body.system, not messages array ───────────
  it("system messages are extracted into body.system and not present in messages array", () => {
    const messages: ChatMessage[] = [
      msg("system", "You are a helpful assistant"),
      msg("user", "hello"),
      msg("assistant", "hi"),
    ];

    const body = adapter.buildRequestBody(messages, undefined, llmConfig) as Record<string, unknown>;

    expect(body.system).toBe("You are a helpful assistant");

    const convertedMessages = body.messages as Array<Record<string, unknown>>;
    const systemInMessages = convertedMessages.filter(m => m.role === "system");
    expect(systemInMessages).toHaveLength(0);
    expect(convertedMessages).toHaveLength(2);
  });

  // ── Test 7: tool calls in assistant message → tool_use blocks ─────────────────
  it("assistant message with tool_calls produces content array with tool_use blocks", () => {
    const messages: ChatMessage[] = [
      msg("user", "use the tool"),
      msg("assistant", "sure", {
        tool_calls: [
          { id: "tc1", name: "search", arguments: { query: "test" } },
        ],
      }),
    ];

    const converted = getMessages(messages);
    const assistantMsg = converted[converted.length - 1];

    expect(assistantMsg.role).toBe("assistant");
    expect(Array.isArray(assistantMsg.content)).toBe(true);
    const content = assistantMsg.content as Array<Record<string, unknown>>;

    const textBlock = content.find(b => b.type === "text");
    const toolUseBlock = content.find(b => b.type === "tool_use");

    expect(textBlock).toBeDefined();
    expect(textBlock?.text).toBe("sure");

    expect(toolUseBlock).toBeDefined();
    expect(toolUseBlock?.id).toBe("tc1");
    expect(toolUseBlock?.name).toBe("search");
    expect(toolUseBlock?.input).toMatchObject({ query: "test" });
  });

  // ── Test 8: assistant message with tool_calls but no text content ─────────────
  it("assistant message with tool_calls and no text produces only tool_use blocks", () => {
    const messages: ChatMessage[] = [
      msg("user", "call it"),
      msg("assistant", "", {
        tool_calls: [{ id: "tc1", name: "myTool", arguments: { x: 1 } }],
      }),
    ];

    const converted = getMessages(messages);
    const assistantMsg = converted[converted.length - 1];
    const content = assistantMsg.content as Array<Record<string, unknown>>;

    const textBlocks = content.filter(b => b.type === "text");
    const toolUseBlocks = content.filter(b => b.type === "tool_use");

    expect(textBlocks).toHaveLength(0);
    expect(toolUseBlocks).toHaveLength(1);
  });
});
