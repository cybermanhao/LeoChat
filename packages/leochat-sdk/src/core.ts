import { TaskLoop } from "@ai-chatbox/mcp-core";
import type { TaskLoopOptions } from "@ai-chatbox/shared";

export type { TaskLoop };

/**
 * 低层 API：创建 TaskLoop 实例（SDK 上下文版）。
 *
 * 与直接 new TaskLoop() 的区别：强制禁用 useBackendProxy，
 * 确保 SDK 用户只使用直连模式。
 *
 * 适合需要精细控制事件流的高级用法。常规用途请使用 LeoAgent。
 *
 * @example
 * ```ts
 * import { createTaskLoop } from "@leochat/sdk/core";
 *
 * const loop = createTaskLoop({
 *   chatId: "my-script",
 *   llmConfig: { provider: "openrouter", apiKey: "...", model: "..." },
 *   onToolCall: async (name, args) => myToolExecutor(name, args),
 * });
 *
 * loop.subscribe((event) => {
 *   if (event.type === "update") process.stdout.write(event.delta.content_delta ?? "");
 * });
 *
 * await loop.start("生成报告");
 * ```
 */
export function createTaskLoop(
  opts: Omit<TaskLoopOptions, "useBackendProxy" | "backendURL">
): TaskLoop {
  return new TaskLoop({ ...opts, useBackendProxy: false });
}
