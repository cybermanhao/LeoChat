export type ServerToolKind = "web_search" | "read_url";

/**
 * 统一后的 token 用量。
 * inputTokens 一律表示**全部输入**（含缓存命中部分）。Anthropic 风格的 input_tokens 不含缓存读取，
 * adapter 负责换算（设计文档 §13 Spike 2）。
 */
export interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  reasoningTokens?: number;
  serverToolCalls?: Partial<Record<ServerToolKind | "image_search", number>>;
}

export type FinishReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "stop_sequence" | "other";

export function emptyUsage(): Usage {
  return { inputTokens: 0, outputTokens: 0 };
}

function addOptional(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
}

/** 把两份用量相加（用于把多个 step 的用量累计成整次运行的用量） */
export function addUsage(a: Usage, b: Usage): Usage {
  const out: Usage = {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
  const hit = addOptional(a.cacheHitTokens, b.cacheHitTokens);
  const miss = addOptional(a.cacheMissTokens, b.cacheMissTokens);
  const reasoning = addOptional(a.reasoningTokens, b.reasoningTokens);
  if (hit !== undefined) out.cacheHitTokens = hit;
  if (miss !== undefined) out.cacheMissTokens = miss;
  if (reasoning !== undefined) out.reasoningTokens = reasoning;
  if (a.serverToolCalls || b.serverToolCalls) {
    const merged: Record<string, number> = { ...a.serverToolCalls };
    for (const [k, v] of Object.entries(b.serverToolCalls ?? {})) merged[k] = (merged[k] ?? 0) + (v ?? 0);
    out.serverToolCalls = merged;
  }
  return out;
}
