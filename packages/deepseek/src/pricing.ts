/**
 * DeepSeek 计价（2026-11-14 取自 https://api-docs.deepseek.com/quick_start/pricing）。
 * 价格会变，表格集中在这里，接入前以官方页面为准。
 */
import type { Usage } from "@leochat/core";

interface Rates {
  /** 美元 / 百万 token */
  cacheHit: number;
  cacheMiss: number;
  output: number;
}

/** 闲时价格；忙时是它的 2 倍 */
export const OFF_PEAK_RATES: Record<string, Rates> = {
  "deepseek-flash": { cacheHit: 0.003, cacheMiss: 0.15, output: 0.6 },
  "deepseek-v4-pro": { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 },
};

/** 工具费用：美元 / 次 */
export const TOOL_FEES = {
  search: 0.75 / 1000,
  fetch: 0.75 / 1000,
  /** 美元 / 页 */
  ocrPage: 0.225 / 1000,
} as const;

/**
 * 忙时：UTC 01:00–04:00、06:00–10:00，周一到周五。
 * 官方说明还排除中国法定节假日，这里没有节假日表，节假日也按忙时计（略高估）。
 */
export function isPeak(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const h = at.getUTCHours();
  return (h >= 1 && h < 4) || (h >= 6 && h < 10);
}

export function priceUsage(model: string, usage: Usage, at: Date): number | undefined {
  const base = OFF_PEAK_RATES[model];
  if (!base) return undefined;
  const k = isPeak(at) ? 2 : 1;
  const hit = usage.cacheHitTokens ?? 0;
  const miss = usage.cacheMissTokens ?? Math.max(0, usage.inputTokens - hit);
  const tokens = (hit * base.cacheHit + miss * base.cacheMiss + usage.outputTokens * base.output) * k;
  // 服务端工具调用费用。按 web_search_requests 计；它与 tool_search 的关系待对账单确认（见设计文档 §13）
  const tools = (usage.serverToolCalls?.web_search ?? 0) * TOOL_FEES.search + (usage.serverToolCalls?.read_url ?? 0) * TOOL_FEES.fetch;
  return tokens / 1_000_000 + tools;
}
