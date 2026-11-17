/**
 * core-bridge：core 消息转成 LLMService 用的旧消息格式（legacyProvider 发请求前用）。
 */
import { describe, it, expect } from "vitest";
import type { Message } from "@leochat/core";
import { toLegacyMessages } from "../core-bridge.js";

describe("toLegacyMessages", () => {
  it("splits a core tool message into one legacy tool message per result and keeps reasoning and tool calls", () => {
    const core: Message[] = [
      { id: "u", role: "user", content: [{ type: "text", text: "hi" }] },
      {
        id: "a",
        role: "assistant",
        content: [
          { type: "thinking", text: "r" },
          { type: "text", text: "checking" },
          { type: "tool_use", id: "t1", name: "x", arguments: '{"a":1}', input: { a: 1 } },
          { type: "tool_use", id: "t2", name: "y", arguments: "{}", input: {} },
        ],
      },
      {
        id: "r",
        role: "tool",
        content: [
          { type: "tool_result", toolUseId: "t1", content: [{ type: "text", text: "one" }] },
          { type: "tool_result", toolUseId: "t2", content: [{ type: "text", text: "two" }] },
        ],
      },
    ];
    const legacy = toLegacyMessages(core, "sys");
    expect(legacy.map((m) => [m.role, m.content, m.tool_call_id ?? null])).toEqual([
      ["system", "sys", null],
      ["user", "hi", null],
      ["assistant", "checking", null],
      ["tool", "one", "t1"],
      ["tool", "two", "t2"],
    ]);
    expect(legacy[2]).toMatchObject({ reasoning_content: "r", tool_calls: [{ id: "t1", arguments: { a: 1 } }, { id: "t2" }] });
  });
});
