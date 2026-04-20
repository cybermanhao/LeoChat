import { describe, it, expect } from "vitest";
import { filterHistory, replayableToInternal } from "../history.js";
import type { ChatMessage } from "@ai-chatbox/shared";

describe("filterHistory", () => {
  it("过滤掉 role=system 的消息", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "system", content: "sys", timestamp: 1000 },
      { id: "2", role: "user", content: "hello", timestamp: 1001 },
    ];
    const result = filterHistory(messages);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
  });

  it("保留 user / assistant / tool 消息", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "q", timestamp: 1000 },
      { id: "2", role: "assistant", content: "a", timestamp: 1001 },
      { id: "3", role: "tool", content: "res", tool_call_id: "tc1", timestamp: 1002 },
    ];
    const result = filterHistory(messages);
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
  });

  it("空数组输入返回空数组", () => {
    expect(filterHistory([])).toEqual([]);
  });

  it("保留 tool_calls 和 tool_call_id 字段", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "",
        timestamp: 1000,
        tool_calls: [{ id: "tc1", name: "search", arguments: { q: "test" }, status: "completed" as const }],
      },
    ];
    const result = filterHistory(messages);
    expect(result[0].tool_calls?.[0].name).toBe("search");
  });
});

describe("replayableToInternal", () => {
  it("正确映射 role / content / timestamp 字段", () => {
    const result = replayableToInternal([
      { id: "abc", role: "user", content: "hello", timestamp: 9999 },
    ]);
    expect(result[0]).toMatchObject({
      id: "abc",
      role: "user",
      content: "hello",
      timestamp: 9999,
    });
  });

  it("id 缺失时自动生成", () => {
    const result = replayableToInternal([
      { role: "user", content: "hi" },
    ]);
    expect(typeof result[0].id).toBe("string");
    expect(result[0].id.length).toBeGreaterThan(0);
  });

  it("空数组输入返回空数组", () => {
    expect(replayableToInternal([])).toEqual([]);
  });
});
