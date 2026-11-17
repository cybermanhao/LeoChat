/** LLM 提供商配置（设置页与 LLMService 使用） */

/**
 * LLM 配置
 */
export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  baseURL?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;

  // 额外 headers（如 OpenRouter 需要）
  headers?: Record<string, string>;
}

/**
 * 支持的 LLM 提供商
 */
export type LLMProvider =
  | "openrouter"
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "moonshot"
  | "kimi"
  | "custom";
