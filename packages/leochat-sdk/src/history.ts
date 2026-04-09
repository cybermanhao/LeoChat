import type { ChatMessage } from "@ai-chatbox/shared";
import type { ReplayableMessage } from "./types";

/**
 * 把 TaskLoop 内部消息历史过滤为可公开的 ReplayableMessage[]。
 *
 * 过滤规则：
 * - 去掉 system message（宿主注入的 systemPrompt 和 skill 内容）
 * - 只保留 user / assistant / tool 消息
 * - 不做深度复制以外的任何变形（保留 tool_calls、tool_call_id 等字段）
 */
export function filterHistory(internalMessages: ChatMessage[]): ReplayableMessage[] {
  return internalMessages
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "tool")
    .map((m) => {
      const msg: ReplayableMessage = {
        role: m.role as "user" | "assistant" | "tool",
        content: m.content,
        id: m.id,
        timestamp: m.timestamp,
      };

      if (m.tool_calls?.length) {
        msg.tool_calls = m.tool_calls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments as Record<string, unknown>,
          status: tc.status,
          result: tc.result,
        }));
      }

      if (m.tool_call_id) {
        msg.tool_call_id = m.tool_call_id;
      }

      return msg;
    });
}

/**
 * 把 ReplayableMessage[] 转换回 TaskLoop 可接受的 ChatMessage[]（用于多轮对话）。
 * history 中不含 system message，TaskLoop 构造时会通过 systemPrompt 选项重新注入。
 */
export function replayableToInternal(history: ReplayableMessage[]): ChatMessage[] {
  return history.map((m) => ({
    id: m.id ?? crypto.randomUUID(),
    role: m.role,
    content: m.content,
    timestamp: m.timestamp ?? Date.now(),
    tool_calls: m.tool_calls as ChatMessage["tool_calls"],
    tool_call_id: m.tool_call_id,
  }));
}
