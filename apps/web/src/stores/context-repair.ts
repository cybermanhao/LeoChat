import type { ContextMessage } from "@ai-chatbox/shared";

/**
 * 当生成被中断时，检查 contextMessages 中是否有未完成的工具调用
 * （assistant 消息有 tool_calls 但后面缺少对应的 tool result），
 * 对每个缺失的 tool_call 补一条取消 tool_result，插入到紧接该 assistant 消息之后
 * 而非 append 到末尾（末尾可能已有新的 user 消息，导致结构非法）。
 *
 * 成功完成时 contextMessages 已由 internalMessages 替换，不存在孤立 tool_calls，
 * 此函数为 no-op（返回原数组引用不变）。
 */
export function patchIncompleteToolCalls(
  messages: ContextMessage[]
): ContextMessage[] {
  let result = messages;
  let offset = 0; // tracks index shift after each insertion

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !msg.tool_calls?.length) continue;

    const missingPatches: ContextMessage[] = [];

    for (const tc of msg.tool_calls) {
      const hasResult = messages
        .slice(i + 1)
        .some((m) => m.role === "tool" && m.tool_call_id === tc.id);
      if (!hasResult) {
        missingPatches.push({
          id: `cancelled-${tc.id}`,
          role: "tool",
          content: "此工具调用已被用户中断，结果未返回。",
          tool_call_id: tc.id,
          timestamp: Date.now(),
        });
      }
    }

    if (missingPatches.length > 0) {
      if (result === messages) result = [...messages]; // copy on first write
      // Insert patches right after this assistant message (adjusted for prior insertions)
      const insertAt = i + 1 + offset;
      result.splice(insertAt, 0, ...missingPatches);
      offset += missingPatches.length;
    }
  }

  return result;
}
