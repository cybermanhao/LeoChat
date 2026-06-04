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
      status: "pending" as const,
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

  it("部分完成：tc-1 有 result，tc-2 没有 → 只补 tc-2，插到 assistant 紧后", () => {
    const msgs: ContextMessage[] = [
      userMsg("run tools"),
      assistantMsg("calling...", ["tc-1", "tc-2"]),
      toolResultMsg("tc-1"), // tc-1 完成了
      // tc-2 中断
    ];
    const result = patchIncompleteToolCalls(msgs);

    expect(result).toHaveLength(4); // 3 + 1 个补丁
    // 补丁插到 assistant（index 1）紧后 → index 2，tc-1 result 被推到 index 3
    expect(result[2].role).toBe("tool");
    expect(result[2].tool_call_id).toBe("tc-2");
    expect(result[3].tool_call_id).toBe("tc-1");
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

  // ── 关键回归：补丁必须插入 assistant 消息紧后方，而非 append 末尾 ──────────

  it("孤立 tool_call 后有孤立 user 消息 → 补丁插到 assistant 紧后，孤立 user 被裁剪", () => {
    // 末尾的 user("继续") 是上次中断时遗留的孤立用户消息，没有 LLM 响应跟随，
    // 应被裁剪；否则下次 sendMessage 会产生两条连续 user 消息导致 400。
    const msgs: ContextMessage[] = [
      userMsg("first"),
      assistantMsg("calling...", ["tc-1"]),
      // tc-1 result 缺失
      { id: "u2", role: "user", content: "继续", timestamp: 0 },
    ];
    const result = patchIncompleteToolCalls(msgs);

    expect(result).toHaveLength(3);
    // 补丁在 index 2（assistant 紧后），孤立 user 已被裁剪
    expect(result[2].role).toBe("tool");
    expect(result[2].tool_call_id).toBe("tc-1");
  });

  it("多轮：中间某轮孤立，后续有完整轮 → 孤立轮就地修补，后续轮不受影响", () => {
    const msgs: ContextMessage[] = [
      userMsg("first"),
      assistantMsg("round1", ["tc-1"]),
      // tc-1 缺失（中断）
      { id: "u2", role: "user", content: "继续", timestamp: 0 },
      assistantMsg("round2", ["tc-2"]),
      toolResultMsg("tc-2"),
    ];
    const result = patchIncompleteToolCalls(msgs);

    expect(result).toHaveLength(6);
    // 补丁在 index 2（round1 assistant 紧后）
    expect(result[2].role).toBe("tool");
    expect(result[2].tool_call_id).toBe("tc-1");
    // user 继续在 index 3
    expect(result[3].role).toBe("user");
    // round2 assistant 在 index 4，tc-2 result 在 index 5
    expect(result[4].role).toBe("assistant");
    expect(result[5].tool_call_id).toBe("tc-2");
  });

  it("多个孤立 tool_call 在同一 assistant → 所有补丁都插到该 assistant 紧后，末尾孤立 user 被裁剪", () => {
    const msgs: ContextMessage[] = [
      userMsg("go"),
      assistantMsg("multi-tool", ["tc-a", "tc-b"]),
      // 两个都缺，末尾孤立 user
      { id: "u2", role: "user", content: "继续", timestamp: 0 },
    ];
    const result = patchIncompleteToolCalls(msgs);

    expect(result).toHaveLength(4); // 2 original (without trailing user) + 2 patches
    expect(result[2].tool_call_id).toBe("tc-a");
    expect(result[3].tool_call_id).toBe("tc-b");
  });

  it("末尾孤立 user 消息（无任何 LLM 响应）→ 直接裁剪", () => {
    // 生成被中止，LLM 尚未响应，contextMessages 末尾只有用户消息
    const msgs: ContextMessage[] = [
      userMsg("hello"),
    ];
    const result = patchIncompleteToolCalls(msgs);
    expect(result).toHaveLength(0);
  });

  it("末尾是 tool result（非 user）→ 不裁剪", () => {
    const msgs: ContextMessage[] = [
      userMsg("go"),
      assistantMsg("calling", ["tc-1"]),
      { id: "tr1", role: "tool", content: "ok", tool_call_id: "tc-1", timestamp: 0 },
    ];
    const result = patchIncompleteToolCalls(msgs);
    expect(result).toBe(msgs); // no-op, same reference
  });
});
