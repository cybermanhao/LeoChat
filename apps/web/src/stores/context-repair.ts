import type { ContextMessage } from "@ai-chatbox/shared";

/**
 * 学习 Claude Code 的做法：
 * 当生成被中断时，检查 contextMessages 中是否有未完成的工具调用
 * （assistant 消息有 tool_calls 但后面缺少对应的 tool result），
 * 对每个缺失的 tool_call 补一条取消 tool_result，保持历史合法。
 * 只修改 contextMessages（LLM 上下文），不影响 displayMessages（UI 显示）。
 *
 * 成功完成时 contextMessages 已由 internalMessages 替换，不存在孤立 tool_calls，
 * 此函数为 no-op（返回原数组引用不变）。
 */
export function patchIncompleteToolCalls(
  messages: ContextMessage[]
): ContextMessage[] {
  const patches: ContextMessage[] = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role !== "assistant" || !msg.tool_calls?.length) continue;

    for (const tc of msg.tool_calls) {
      const hasResult = messages
        .slice(i + 1)
        .some((m) => m.role === "tool" && m.tool_call_id === tc.id);
      if (!hasResult) {
        patches.push({
          id: `cancelled-${tc.id}`,
          role: "tool",
          content: "此工具调用已被用户中断，结果未返回。",
          tool_call_id: tc.id,
          timestamp: Date.now(),
        });
      }
    }
  }

  return patches.length > 0 ? [...messages, ...patches] : messages;
}
