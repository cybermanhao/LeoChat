/** 内置停止条件（C4，参考 Vercel AI SDK 的 stopWhen） */
import type { StopCondition } from "./run-types";

const STEP_COUNT = new WeakSet<StopCondition>();

/** 用来把步数上限触发的停止报告为 reason: "max_steps" */
export function isStepCountCondition(c: StopCondition): boolean {
  return STEP_COUNT.has(c);
}

/** 已经跑满 n 个 step 时停止 */
export function stepCount(n: number): StopCondition {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`stepCount: n must be a positive integer, got ${n}`);
  const cond: StopCondition = ({ steps }) => steps.length >= n;
  STEP_COUNT.add(cond);
  return cond;
}

/** 最近一个 step 调用了指定工具之一时停止 */
export function hasToolCall(...names: string[]): StopCondition {
  const wanted = new Set(names);
  return ({ steps }) => steps.at(-1)?.toolCalls.some((c) => wanted.has(c.name)) ?? false;
}

/** 累计费用超过阈值（美元）时停止。provider 没有提供 price() 时永远不会触发 */
export function costAbove(usd: number): StopCondition {
  return ({ costUsd }) => costUsd !== undefined && costUsd > usd;
}

export const DEFAULT_STOP_WHEN: StopCondition[] = [stepCount(10)];

export function normalizeStopWhen(s: StopCondition | StopCondition[] | undefined): StopCondition[] {
  if (s === undefined) return DEFAULT_STOP_WHEN;
  return Array.isArray(s) ? s : [s];
}
