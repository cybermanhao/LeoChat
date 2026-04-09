import type { ToolCallRecord } from "@leochat/sdk";

/**
 * 打印工具调用（到 stderr，不污染 stdout 管道输出）
 */
export function printToolCall(name: string, args: Record<string, unknown>): void {
  const argsStr = JSON.stringify(args);
  const preview = argsStr.length > 120 ? argsStr.slice(0, 120) + "…" : argsStr;
  process.stderr.write(`\x1b[33m[tool]\x1b[0m ${name} ${preview}\n`);
}

/**
 * 打印工具结果摘要（到 stderr）
 */
export function printToolResult(id: string, duration?: number): void {
  const durationStr = duration !== undefined ? ` (${duration}ms)` : "";
  process.stderr.write(`\x1b[32m[done]\x1b[0m ${id}${durationStr}\n`);
}

/**
 * 打印所有工具调用的汇总（运行结束后，可选）
 */
export function printToolSummary(toolCalls: ToolCallRecord[]): void {
  if (toolCalls.length === 0) return;
  process.stderr.write(`\n\x1b[2m─── ${toolCalls.length} tool call(s) ───\x1b[0m\n`);
  for (const tc of toolCalls) {
    const status = tc.error ? "\x1b[31m✗\x1b[0m" : "\x1b[32m✓\x1b[0m";
    const durationStr = tc.duration !== undefined ? ` ${tc.duration}ms` : "";
    process.stderr.write(`  ${status} ${tc.name}${durationStr}\n`);
  }
}
