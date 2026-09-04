import { useCallback, useEffect, useMemo, useState } from "react";
import { getServerBaseUrl } from "./api";
import type { LLMProvider } from "../stores/chat";
import type { TranslationKey } from "../i18n";

/**
 * 单一模型目录来源 —— LLMSettings 与 ModelSelector 共用。
 *
 * - OpenRouter：默认走动态获取（`POST /api/llm/models`），带 24h localStorage 缓存，
 *   下方 CURATED 仅作离线/无 key 兜底。
 * - 其它 provider：目录小且稳定，用 CURATED，手动「刷新」仍可拉取。
 */

export interface CatalogModel {
  id: string;
  name: string;
  description?: string;
  contextWindow?: number;
  pricing?: string;
}

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

// ─── 精选兜底列表 ────────────────────────────────────────────────

export function getCuratedModels(t: TFn): Record<LLMProvider, CatalogModel[]> {
  return {
    deepseek: [
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", description: t("models.deepseek.chat.description"), contextWindow: 64000, pricing: "¥1 / 1M tokens" },
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", description: t("models.deepseek.reasoner.description"), contextWindow: 64000, pricing: "¥4 / 1M tokens" },
    ],
    openrouter: [
      { id: "deepseek/deepseek-chat", name: "DeepSeek V3", description: t("models.common.viaOpenRouter"), contextWindow: 64000, pricing: "$0.14 / 1M tokens" },
      { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5", description: t("models.anthropic.sonnet.description"), contextWindow: 200000, pricing: "$1 / 1M tokens" },
      { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku", description: t("models.common.viaOpenRouter"), contextWindow: 200000, pricing: "$0.25 / 1M tokens" },
      { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", description: t("models.openai.gpt4oMini.description"), contextWindow: 128000, pricing: "$0.15 / 1M tokens" },
      { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite", description: t("models.google.geminiFlash.description"), contextWindow: 1000000, pricing: "$0.10 / 1M tokens" },
      { id: "google/gemini-2.5-flash", name: "Gemini 2.5 Flash", description: t("models.google.geminiFlash.description"), contextWindow: 1000000, pricing: "$0.30 / 1M tokens" },
      { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", description: t("models.common.viaOpenRouter"), contextWindow: 131000, pricing: "$0.12 / 1M tokens" },
      { id: "x-ai/grok-4.20", name: "Grok 4.20", description: t("models.common.viaOpenRouter"), contextWindow: 131000, pricing: "$1.25 / 1M tokens" },
    ],
    openai: [
      { id: "gpt-4o", name: "GPT-4o", description: t("models.openai.gpt4o.description"), contextWindow: 128000, pricing: "$2.50 / 1M tokens" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", description: t("models.openai.gpt4oMini.description"), contextWindow: 128000, pricing: "$0.15 / 1M tokens" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", description: t("models.openai.gpt4Turbo.description"), contextWindow: 128000, pricing: "$10.00 / 1M tokens" },
    ],
    moonshot: [
      { id: "moonshot-v1-8k", name: "Moonshot v1 8K", description: t("models.moonshot.8k.description"), contextWindow: 8000, pricing: "¥12 / 1M tokens" },
      { id: "moonshot-v1-32k", name: "Moonshot v1 32K", description: t("models.moonshot.32k.description"), contextWindow: 32000, pricing: "¥24 / 1M tokens" },
      { id: "moonshot-v1-128k", name: "Moonshot v1 128K", description: t("models.moonshot.128k.description"), contextWindow: 128000, pricing: "¥60 / 1M tokens" },
    ],
    kimi: [
      { id: "kimi-code", name: "Kimi k2.6", description: t("models.kimiCode.description"), contextWindow: 262144 },
      { id: "kimi-for-coding", name: "Kimi k2.6 (upstream ID)", description: t("models.kimiCode.description"), contextWindow: 262144 },
    ],
    google: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: t("models.google.geminiFlash.description"), contextWindow: 1000000, pricing: "$0.10 / 1M tokens" },
      { id: "gemini-2.0-flash-thinking-exp", name: "Gemini 2.0 Flash Thinking", description: t("models.google.geminiFlashThinking.description"), contextWindow: 1000000, pricing: "$0.10 / 1M tokens" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: t("models.google.geminiPro.description"), contextWindow: 2000000, pricing: "$1.25 / 1M tokens" },
    ],
  };
}

/** provider 首次选中时的默认 model（必须是当前可用的 slug）。 */
export const DEFAULT_MODEL_BY_PROVIDER: Record<LLMProvider, string> = {
  deepseek: "deepseek-v4-flash",
  openrouter: "deepseek/deepseek-chat",
  openai: "gpt-4o-mini",
  moonshot: "moonshot-v1-8k",
  kimi: "kimi-code",
  google: "gemini-2.0-flash",
};

// ─── 动态列表噪音过滤 ────────────────────────────────────────────

/** 去掉批处理/图像等对聊天无意义的条目。 */
export function filterModelIds(ids: string[]): string[] {
  return ids.filter((id) => {
    if (id.endsWith(":batch")) return false;
    if (id.includes("-image") || id.includes("image-")) return false;
    return true;
  });
}

// ─── Hook ────────────────────────────────────────────────────────

const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const cacheKey = (p: string) => `leochat-models:${p}`;

interface Cache {
  ids: string[];
  ts: number;
}

function readCache(provider: string): Cache | null {
  try {
    const raw = localStorage.getItem(cacheKey(provider));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cache;
    return Array.isArray(parsed.ids) ? parsed : null;
  } catch {
    return null;
  }
}

export interface ModelCatalog {
  /** API 列表（若已获取）与精选列表合并后的结果。 */
  models: CatalogModel[];
  loading: boolean;
  error: string | null;
  /** "api" 表示当前展示的是从 provider 拉取的实时列表。 */
  source: "api" | "curated";
  /** 强制忽略缓存重新拉取。 */
  refresh: () => void;
}

/**
 * @param provider 当前 provider
 * @param apiKey   当前 provider 的 key（空 / "backend" 视为无 key）
 * @param t        翻译函数
 */
export function useModelCatalog(provider: LLMProvider, apiKey: string, t: TFn): ModelCatalog {
  const curated = useMemo(() => getCuratedModels(t)[provider] ?? [], [provider, t]);
  const [apiIds, setApiIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const keyValid = !!apiKey && apiKey !== "backend";

  const doFetch = useCallback(
    async (force: boolean) => {
      if (!keyValid) return;
      if (!force) {
        const cached = readCache(provider);
        if (cached && cached.ids.length && Date.now() - cached.ts < CACHE_TTL) {
          setApiIds(cached.ids);
          return;
        }
      }
      setLoading(true);
      setError(null);
      try {
        const base = await getServerBaseUrl();
        const res = await fetch(`${base}/api/llm/models`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey }),
        });
        if (!res.ok) {
          const e = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(e.error || `HTTP ${res.status}`);
        }
        const data = (await res.json()) as { models?: string[] };
        const ids = filterModelIds(data.models ?? []);
        if (ids.length === 0) throw new Error("provider 未返回可用模型");
        setApiIds(ids);
        try {
          localStorage.setItem(cacheKey(provider), JSON.stringify({ ids, ts: Date.now() } satisfies Cache));
        } catch {
          /* localStorage 不可用时静默降级 */
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "fetch failed");
      } finally {
        setLoading(false);
      }
    },
    [provider, apiKey, keyValid]
  );

  // provider 切换：先用缓存回填
  useEffect(() => {
    setError(null);
    setApiIds(readCache(provider)?.ids ?? []);
  }, [provider]);

  // OpenRouter：有 key 就自动拉取（缓存新鲜时不发请求）
  useEffect(() => {
    if (provider === "openrouter" && keyValid) void doFetch(false);
  }, [provider, keyValid, doFetch]);

  const models = useMemo<CatalogModel[]>(() => {
    if (apiIds.length === 0) return curated;
    const meta = new Map(curated.map((m) => [m.id, m]));
    return apiIds.map((id) => meta.get(id) ?? { id, name: id });
  }, [apiIds, curated]);

  return {
    models,
    loading,
    error,
    source: apiIds.length ? "api" : "curated",
    refresh: () => void doFetch(true),
  };
}
