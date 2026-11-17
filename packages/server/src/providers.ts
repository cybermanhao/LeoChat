/**
 * 运行时选择模型 provider：
 * - DeepSeek 且已配置 key：用原生的 @leochat/deepseek（Messages 端点），带联网搜索 / 引用 / 缓存统计、正确的上下文窗口和 token 估算
 * - 其它提供商：继续走 LLMService 的旧桥接（OpenAI 兼容接口）
 * 两种都记录最近一次上游错误（lastError），路由据此生成给客户端的安全错误信息。
 */
import type { ModelRequest, Provider, ProviderEvent } from "@leochat/core";
import { deepseek } from "@leochat/deepseek";
import type { LLMProvider } from "@ai-chatbox/shared";
import { legacyProvider, type LegacyLLM } from "./core-bridge.js";

export interface RunProvider extends Provider {
  /** 最近一次上游错误（只在服务端使用，不发给客户端） */
  lastError: unknown;
  /** 是否是原生 provider（支持服务端工具，例如联网搜索） */
  readonly native: boolean;
}

/** LLMService 里选择 provider 用到的部分 */
export interface ProviderSource extends LegacyLLM {
  resolveProvider?(provider?: LLMProvider, model?: string): LLMProvider;
  getApiKey?(provider: LLMProvider): string | undefined;
}

/** 没有指定模型时，原生 DeepSeek 用的默认模型 */
export const DEFAULT_DEEPSEEK_MODEL = "deepseek-flash";

function recording(p: Provider): RunProvider {
  const self: RunProvider = {
    ...p,
    native: true,
    lastError: undefined,
    async *stream(req: ModelRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent> {
      try {
        yield* p.stream(req, signal);
      } catch (e) {
        self.lastError = e;
        throw e;
      }
    },
  };
  return self;
}

export function selectProvider(
  llm: ProviderSource,
  provider: LLMProvider | undefined,
  model: string | undefined,
  opts: { fetch?: typeof fetch } = {},
): { provider: RunProvider; model: string } {
  const resolved = llm.resolveProvider?.(provider, model) ?? provider;
  const key = resolved ? llm.getApiKey?.(resolved) : undefined;
  if (resolved === "deepseek" && key) {
    return {
      provider: recording(deepseek({ apiKey: key, ...(opts.fetch ? { fetch: opts.fetch } : {}) })),
      model: model || DEFAULT_DEEPSEEK_MODEL,
    };
  }
  return { provider: Object.assign(legacyProvider(llm, provider), { native: false as const }), model: model ?? "" };
}
