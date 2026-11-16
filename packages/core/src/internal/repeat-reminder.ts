/**
 * 重复工具调用提醒（参考 dsh packages/guard/repeat-tool-reminder）。
 * 只检测完全相同的调用（同一工具、同样的参数，忽略键顺序）。达到阈值时，把提醒追加在这次工具结果后面：
 * 第一个阈值给温和提醒，之后给详细提醒。提醒只是建议，不拦截调用。新的用户消息（插话、后续消息）清零计数。
 */
import type { ToolResultBlock, ToolUseBlock } from "../blocks";

export interface RepeatReminderOptions {
  /** 默认 [3, 5, 8]（与 dsh 相同） */
  thresholds?: number[];
  /** 只跟踪这些工具（支持 * 通配）；空表示全部 */
  include?: string[];
  /** 不跟踪这些工具（支持 * 通配）。不跟踪的调用既不计数也不打断计数 */
  exclude?: string[];
  /** 详细提醒里显示多少字符的参数，默认 500 */
  argumentsPreviewChars?: number;
}

const GENTLE =
  "You are repeating the exact same tool call with identical arguments. " +
  "Carefully analyze the previous result before calling again: if the task is not complete, " +
  "try a different approach or different arguments instead of repeating the call.";

function detailed(tool: string, count: number, args: string): string {
  return (
    "Repeated tool call detected:\n" +
    `- tool: ${tool}\n` +
    `- consecutive_calls: ${count}\n` +
    `- arguments: ${args}\n` +
    "The repeated calls are not making progress. Do not call this tool with these exact arguments again. " +
    "Inspect the latest result and choose a different action, different arguments, or finish the task if enough evidence has been gathered."
  );
}

function sortJson(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortJson);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortJson((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}

const wildcard = (p: string) => new RegExp(`^${p.replace(/[|\\{}()[\]^$+?.]/g, "\\$&").replaceAll("*", ".*")}$`);

export interface RepeatTracker {
  /** 按调用顺序观察一批结果；达到阈值时在对应结果后追加提醒，返回被提醒的调用 */
  observe(calls: ToolUseBlock[], results: ToolResultBlock[]): Array<{ tool: string; count: number }>;
  reset(): void;
}

export function createRepeatTracker(opts: RepeatReminderOptions = {}): RepeatTracker {
  const thresholds = [...(opts.thresholds ?? [3, 5, 8])].sort((a, b) => a - b);
  if (thresholds.length === 0 || thresholds.some((t) => !Number.isInteger(t) || t < 2) || new Set(thresholds).size !== thresholds.length) {
    throw new RangeError("repeatToolReminder: thresholds must be distinct integers >= 2");
  }
  const thresholdSet = new Set(thresholds);
  const include = (opts.include ?? []).map(wildcard);
  const exclude = (opts.exclude ?? []).map(wildcard);
  const preview = opts.argumentsPreviewChars ?? 500;
  let chain: { key: string; count: number } | null = null;

  const tracked = (name: string) => (include.length === 0 || include.some((r) => r.test(name))) && !exclude.some((r) => r.test(name));

  return {
    observe(calls, results) {
      const reminded: Array<{ tool: string; count: number }> = [];
      for (const call of calls) {
        if (!tracked(call.name)) continue;
        const canonical = JSON.stringify(sortJson(call.input ?? call.arguments));
        const key = JSON.stringify([call.name, canonical]);
        const count = chain && chain.key === key ? chain.count + 1 : 1;
        chain = { key, count };
        if (!thresholdSet.has(count)) continue;
        const result = results.find((r) => r.toolUseId === call.id);
        if (!result) continue; // 暂停式审批中的调用还没有结果
        const args = canonical.length > preview ? `${canonical.slice(0, preview)}… (+${canonical.length - preview} more chars)` : canonical;
        result.content = [...result.content, { type: "text", text: `\n\n${count === thresholds[0] ? GENTLE : detailed(call.name, count, args)}` }];
        reminded.push({ tool: call.name, count });
      }
      return reminded;
    },
    reset() {
      chain = null;
    },
  };
}
