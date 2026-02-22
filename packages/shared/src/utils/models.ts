/**
 * 模型 context window 限制映射（token 数）
 * 用于 TaskLoop 的 token 感知截断
 */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  // DeepSeek
  "deepseek-chat": 64000,
  "deepseek-reasoner": 64000,
  // OpenAI
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  // Anthropic (via OpenRouter)
  "anthropic/claude-3.5-sonnet": 200000,
  "anthropic/claude-3-opus": 200000,
  // Google (via OpenRouter)
  "google/gemini-pro-1.5": 1000000,
  // OpenAI via OpenRouter
  "openai/gpt-4o": 128000,
  // DeepSeek via OpenRouter
  "deepseek/deepseek-chat": 64000,
  // Moonshot
  "moonshot-v1-8k": 8000,
  "moonshot-v1-32k": 32000,
  "moonshot-v1-128k": 128000,
};

/**
 * 获取模型的 context window 限制（token 数）
 * 返回 0 表示未知/不限制
 */
export function getModelContextLimit(model: string): number {
  return MODEL_CONTEXT_LIMITS[model] ?? 0;
}

/**
 * 档位 → 消息数映射（0 = 不限制，依赖 token 感知截断兜底）
 */
export const CONTEXT_LEVEL_MAP: Record<number, number> = {
  1: 4,
  2: 8,
  3: 12,
  4: 20,
  5: 30,
  6: 40,
  7: 50,
  8: 60,
  9: 80,
  10: 0,
};
