import { describe, it, expect } from "vitest";
import { patchIncompleteToolCalls } from "../context-repair.js";
import type { ContextMessage } from "@ai-chatbox/shared";

// ── 辅助函数 ──────────────────────────────────────────────────────────────────

function userMsg(content: string): ContextMessage {
  return { id: "u1", role: "user", content, timestamp: 0 };
}

function assistantMsg(content: string, toolCallIds?: string[]): ContextMessage {
  return {
    id: "a1",
    role: "assistant",
    content,
    timestamp: 0,
    tool_calls: toolCallIds?.map((id) => ({
      id,
      name: "some_tool",
      arguments: {},
    })),
  };
}

function toolResultMsg(toolCallId: string, content = "result"): ContextMessage {
  return { id: `tr-${toolCallId}`, role: "tool", content, tool_call_id: toolCallId, timestamp: 0 };
}

// ── 测试 ───────────────────────────────────────────────────────────────────────

describe("patchIncompleteToolCalls", () => {
  it("无工具调用时原样返回（相同引用）", () => {
    const msgs: ContextMessage[] = [userMsg("hi"), assistantMsg("hello")];
    const result = patchIncompleteToolCalls(msgs);
    expect(result).toBe(msgs); // 同一引用，no-op
  });

  it("工具调用已完成时原样返回（相同引用）", () => {
    const msgs: ContextMessage[] = [
      userMsg("run tool"),
      assistantMsg("ok", ["tc-1"]),
      toolResultMsg("tc-1"),
    ];
    const result = patchIncompleteToolCalls(msgs);
    expect(result).toBe(msgs);
  });

  it("用户中断：单个未完成的工具调用 → 补一条取消 tool_result", () => {
    const msgs: ContextMessage[] = [
      userMsg("run tool"),
      assistantMsg("calling...", ["tc-1"]),
      // tc-1 的 tool_result 缺失（用户中断）
    ];
    const result = patchIncompleteToolCalls(msgs);

    expect(result).not.toBe(msgs); // 返回新数组
    expect(result).toHaveLength(3); // 原 2 条 + 1 个补丁
    const patch = result[2];
    expect(patch.role).toBe("tool");
    expect(patch.tool_call_id).toBe("tc-1");
    expect(patch.content).toMatch(/中断/);
  });

  it("用户中断：多个工具调用都缺 result → 每个都补", () => {
    const msgs: ContextMessage[] = [
      userMsg("run tools"),
      assistantMsg("calling...", ["tc-1", "tc-2", "tc-3"]),
    ];
    const result = patchIncompleteToolCalls(msgs);

    expect(result).toHaveLength(5); // 2 + 3 个补丁
    const patches = result.slice(2);
    expect(patches.map((p) => p.tool_call_id)).toEqual(["tc-1", "tc-2", "tc-3"]);
    patches.forEach((p) => expect(p.role).toBe("tool"));
  });

  it("部分完成：tc-1 有 result，tc-2 没有 → 只补 tc-2", () => {
    const msgs: ContextMessage[] = [
      userMsg("run tools"),
      assistantMsg("calling...", ["tc-1", "tc-2"]),
      toolResultMsg("tc-1"), // tc-1 完成了
      // tc-2 中断
    ];
    const result = patchIncompleteToolCalls(msgs);

    expect(result).toHaveLength(4); // 3 + 1 个补丁
    const patch = result[3];
    expect(patch.tool_call_id).toBe("tc-2");
  });

  it("成功完成的历史（含多轮工具调用）→ no-op", () => {
    const msgs: ContextMessage[] = [
      userMsg("hello"),
      assistantMsg("calling...", ["tc-1"]),
      toolResultMsg("tc-1"),
      assistantMsg("also calling", ["tc-2"]),
      toolResultMsg("tc-2"),
      assistantMsg("done"),
    ];
    const result = patchIncompleteToolCalls(msgs);
    expect(result).toBe(msgs);
  });

  it("多轮对话中最后一轮被中断 → 只补最后一轮", () => {
    const msgs: ContextMessage[] = [
      userMsg("first"),
      assistantMsg("round1", ["tc-1"]),
      toolResultMsg("tc-1"),
      assistantMsg("round2 done"),
      userMsg("second"),
      assistantMsg("round3", ["tc-2"]), // 这轮中断了
    ];
    const result = patchIncompleteToolCalls(msgs);

    expect(result).toHaveLength(7);
    expect(result[6].tool_call_id).toBe("tc-2");
  });

  it("空数组 → 原样返回", () => {
    const msgs: ContextMessage[] = [];
    expect(patchIncompleteToolCalls(msgs)).toBe(msgs);
  });
});
