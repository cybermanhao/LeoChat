import { useState, useEffect, useMemo, useRef } from "react";
import { Check, Eye, EyeOff, ExternalLink, Sparkles, RefreshCw, Search } from "lucide-react";
import { chatApi } from "../../lib/api";
import { cn } from "@ai-chatbox/ui";
import { useChatStore, type LLMProvider } from "../../stores/chat";
import { useT } from "../../i18n";

// --- Provider 配置 ---

interface ProviderInfo {
  id: LLMProvider;
  name: string;
  description: string;
  link: string;
  linkText: string;
  color: string;
}

// --- 模型列表 ---

interface Model {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  pricing: string;
}

// --- 组件 ---

export function LLMSettings() {
  const { t } = useT();
  const currentProvider = useChatStore((s) => s.currentProvider);
  const currentModel = useChatStore((s) => s.currentModel);
  const providerKeys = useChatStore((s) => s.providerKeys);
  const contextLevel = useChatStore((s) => s.contextLevel);
  const setCurrentProvider = useChatStore((s) => s.setCurrentProvider);
  const setCurrentModel = useChatStore((s) => s.setCurrentModel);
  const setProviderKey = useChatStore((s) => s.setProviderKey);
  const setContextLevel = useChatStore((s) => s.setContextLevel);

  const PROVIDERS = useMemo<ProviderInfo[]>(() => [
    {
      id: "deepseek",
      name: "DeepSeek",
      description: t("settings.api.descriptionDeepSeek"),
      link: "https://platform.deepseek.com/api_keys",
      linkText: t("settings.api.linkTextDeepSeek"),
      color: "bg-blue-500",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      description: t("settings.api.descriptionOpenRouter"),
      link: "https://openrouter.ai/keys",
      linkText: t("settings.api.linkTextOpenRouter"),
      color: "bg-purple-500",
    },
    {
      id: "openai",
      name: "OpenAI",
      description: t("settings.api.descriptionOpenAI"),
      link: "https://platform.openai.com/api-keys",
      linkText: t("settings.api.linkTextOpenAI"),
      color: "bg-green-500",
    },
    {
      id: "moonshot",
      name: "Moonshot (Kimi)",
      description: t("settings.api.descriptionMoonshot"),
      link: "https://platform.moonshot.cn/console/api-keys",
      linkText: t("settings.api.linkTextMoonshot"),
      color: "bg-yellow-500",
    },
    {
      id: "kimi",
      name: "Kimi (Coding)",
      description: "Kimi k2.6 coding model — api.kimi.com/coding",
      link: "https://platform.moonshot.cn/console/api-keys",
      linkText: "获取 API Key",
      color: "bg-cyan-500",
    },
  ], [t]);

  const MODELS_BY_PROVIDER = useMemo<Record<LLMProvider, Model[]>>(() => ({
    deepseek: [
      { id: "deepseek-chat", name: "DeepSeek Chat", description: t("models.deepseek.chat.description"), contextWindow: 64000, pricing: "¥1/1M tokens" },
      { id: "deepseek-reasoner", name: "DeepSeek R1", description: t("models.deepseek.reasoner.description"), contextWindow: 64000, pricing: "¥4/1M tokens" },
    ],
    openrouter: [
      { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", description: t("models.anthropic.sonnet.description"), contextWindow: 200000, pricing: "$3/1M" },
      { id: "anthropic/claude-3-opus", name: "Claude 3 Opus", description: t("models.anthropic.opus.description"), contextWindow: 200000, pricing: "$15/1M" },
      { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5", description: t("models.google.geminiPro.description"), contextWindow: 1000000, pricing: "$1.25/1M" },
      { id: "openai/gpt-4o", name: "GPT-4o (via OR)", description: t("models.common.viaOpenRouter"), contextWindow: 128000, pricing: "$2.50/1M" },
      { id: "deepseek/deepseek-chat", name: "DeepSeek (via OR)", description: t("models.common.viaOpenRouter"), contextWindow: 64000, pricing: "$0.14/1M" },
    ],
    openai: [
      { id: "gpt-4o", name: "GPT-4o", description: t("models.openai.gpt4o.description"), contextWindow: 128000, pricing: "$2.50/1M" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini", description: t("models.openai.gpt4oMini.description"), contextWindow: 128000, pricing: "$0.15/1M" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo", description: t("models.openai.gpt4Turbo.description"), contextWindow: 128000, pricing: "$10/1M" },
    ],
    moonshot: [
      { id: "moonshot-v1-8k", name: "Moonshot v1 8K", description: t("models.moonshot.8k.description"), contextWindow: 8000, pricing: "¥12/1M tokens" },
      { id: "moonshot-v1-32k", name: "Moonshot v1 32K", description: t("models.moonshot.32k.description"), contextWindow: 32000, pricing: "¥24/1M tokens" },
      { id: "moonshot-v1-128k", name: "Moonshot v1 128K", description: t("models.moonshot.128k.description"), contextWindow: 128000, pricing: "¥60/1M tokens" },
    ],
    kimi: [
      { id: "kimi-code", name: "Kimi k2.6", description: "Kimi coding model with 262K context", contextWindow: 262144, pricing: "" },
      { id: "kimi-for-coding", name: "Kimi k2.6 (upstream ID)", description: "Upstream model ID alias", contextWindow: 262144, pricing: "" },
    ],
    google: [
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", description: "Fast and efficient Gemini model", contextWindow: 1000000, pricing: "$0.10/1M" },
      { id: "gemini-2.0-flash-thinking-exp", name: "Gemini 2.0 Flash Thinking", description: "Gemini with extended thinking", contextWindow: 1000000, pricing: "$0.10/1M" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", description: "Powerful multimodal model", contextWindow: 2000000, pricing: "$1.25/1M" },
    ],
  }), [t]);

  const [localKey, setLocalKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  // 模型获取状态
  const [fetchedModels, setFetchedModels] = useState<string[]>([]);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [modelSearch, setModelSearch] = useState("");
  const [customModelInput, setCustomModelInput] = useState("");

  useEffect(() => {
    return () => {
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
    };
  }, []);

  // 切换 provider 时重置状态
  useEffect(() => {
    const key = providerKeys[currentProvider] || "";
    setLocalKey(key === "backend" ? "" : key);
    setShowKey(false);
    setSaved(false);
    setFetchedModels([]);
    setFetchError(null);
    setModelSearch("");
  }, [currentProvider, providerKeys]);

  const handleFetchModels = async () => {
    setFetchingModels(true);
    setFetchError(null);
    try {
      const models = await chatApi.getModels(currentProvider);
      setFetchedModels(models);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "获取失败");
    } finally {
      setFetchingModels(false);
    }
  };

  const handleSaveKey = () => {
    if (localKey.trim()) {
      setProviderKey(currentProvider, localKey.trim());
      setSaved(true);
      if (savedTimerRef.current) {
        clearTimeout(savedTimerRef.current);
      }
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    }
  };

  const currentProviderInfo = PROVIDERS.find((p) => p.id === currentProvider)!;
  const models = MODELS_BY_PROVIDER[currentProvider] || [];
  const hasKey = !!(providerKeys[currentProvider] && providerKeys[currentProvider] !== "");

  return (
    <div className="space-y-8">
      {/* 标题 */}
      <div>
        <h2 className="text-xl font-bold mb-2">{t("settings.model.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("settings.model.description")}</p>
      </div>

      {/* --- 区块 A: 服务商选择 --- */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">{t("settings.model.defaultProvider")}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {PROVIDERS.map((provider) => {
            const isSelected = currentProvider === provider.id;
            const configured = providerKeys[provider.id] && providerKeys[provider.id] !== "";
            return (
              <button
                key={provider.id}
                onClick={() => setCurrentProvider(provider.id)}
                className={cn(
                  "relative rounded-lg border-2 p-4 text-left transition-all hover:shadow-md",
                  isSelected
                    ? "border-primary shadow-md"
                    : "border-border hover:border-primary/50"
                )}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                    <Check className="h-3 w-3 text-primary-foreground" />
                  </div>
                )}
                <div className="flex items-center gap-2 mb-1">
                  <div className={cn("h-2.5 w-2.5 rounded-full", provider.color)} />
                  <span className="font-medium text-sm">{provider.name}</span>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{provider.description}</p>
                {configured && (
                  <span className="inline-block mt-2 text-xs text-green-500">
                    {t("settings.api.getConfigured")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* --- 区块 B: API Key --- */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">
          {currentProviderInfo.name} API Key
        </h3>
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="relative">
            <input
              type={showKey ? "text" : "password"}
              value={localKey}
              onChange={(e) => { setLocalKey(e.target.value); setSaved(false); }}
              placeholder={t("settings.api.keyPlaceholder")}
              className="w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => { if (e.key === "Enter") handleSaveKey(); }}
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            >
              {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between">
            <a
              href={currentProviderInfo.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              {currentProviderInfo.linkText}
              <ExternalLink className="h-3 w-3" />
            </a>
            <button
              onClick={handleSaveKey}
              disabled={!localKey.trim()}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                saved
                  ? "bg-green-500/10 text-green-500"
                  : localKey.trim()
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {saved ? (
                <span className="flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" />
                  {t("settings.api.saveSuccess")}
                </span>
              ) : (
                t("common.save")
              )}
            </button>
          </div>
        </div>
      </div>

      {/* --- 区块 C: 模型选择 --- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {t("settings.model.selectModel")}
          </h3>
          <button
            onClick={handleFetchModels}
            disabled={fetchingModels || !hasKey}
            title={!hasKey ? t("settings.api.configureKeyFirst", { provider: currentProviderInfo.name }) : "从 API 获取模型列表"}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              hasKey
                ? "text-primary hover:bg-primary/10 border border-primary/30"
                : "text-muted-foreground border border-border cursor-not-allowed opacity-50"
            )}
          >
            <RefreshCw className={cn("h-3 w-3", fetchingModels && "animate-spin")} />
            {fetchingModels ? "获取中..." : "获取模型列表"}
          </button>
        </div>

        {!hasKey && (
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 text-sm text-yellow-800 dark:text-yellow-200">
            {t("settings.api.configureKeyFirst", { provider: currentProviderInfo.name })}
          </div>
        )}

        {fetchError && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
            获取失败：{fetchError}
          </div>
        )}

        {/* 自定义模型输入 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customModelInput}
            onChange={(e) => setCustomModelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && customModelInput.trim()) {
                setCurrentModel(customModelInput.trim());
                setCustomModelInput("");
              }
            }}
            placeholder="输入自定义模型 ID，如 kimi-k2.6..."
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={() => {
              if (customModelInput.trim()) {
                setCurrentModel(customModelInput.trim());
                setCustomModelInput("");
              }
            }}
            disabled={!customModelInput.trim()}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
              customModelInput.trim()
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            使用
          </button>
        </div>

        {/* 当前选中的模型（不在列表里时显示） */}
        {currentModel && !models.some(m => m.id === currentModel) && !fetchedModels.includes(currentModel) && (
          <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary/5 px-3 py-2">
            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-sm font-medium text-foreground flex-1 truncate">{currentModel}</span>
            <span className="text-xs text-muted-foreground">当前使用</span>
          </div>
        )}

        {/* 从 API 获取的模型列表 */}
        {fetchedModels.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-medium">API 模型列表</span>
              <span className="text-xs">({fetchedModels.length})</span>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                type="text"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
                placeholder="搜索模型..."
                className="w-full rounded-md border bg-background pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div className="max-h-52 overflow-y-auto space-y-1 rounded-lg border bg-card p-1">
              {fetchedModels
                .filter(id => !modelSearch || id.toLowerCase().includes(modelSearch.toLowerCase()))
                .map((id) => {
                  const isSelected = currentModel === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setCurrentModel(id)}
                      className={cn(
                        "w-full flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-muted/50",
                        isSelected ? "bg-primary/10 text-primary font-medium" : "text-foreground"
                      )}
                    >
                      {isSelected && <Check className="h-3.5 w-3.5 shrink-0" />}
                      <span className={cn("truncate", !isSelected && "pl-5")}>{id}</span>
                    </button>
                  );
                })}
              {fetchedModels.filter(id => !modelSearch || id.toLowerCase().includes(modelSearch.toLowerCase())).length === 0 && (
                <div className="py-4 text-center text-xs text-muted-foreground">无匹配模型</div>
              )}
            </div>
          </div>
        )}

        {/* 预设模型（未获取 API 列表时显示） */}
        {fetchedModels.length === 0 && (
          <div className="space-y-1.5">
            {models.map((model) => {
              const isSelected = currentModel === model.id;
              return (
                <button
                  key={model.id}
                  onClick={() => setCurrentModel(model.id)}
                  className={cn(
                    "w-full flex items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50",
                    isSelected ? "border-primary bg-primary/5" : "border-border"
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{model.name}</span>
                      {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      <span>{(model.contextWindow / 1000).toFixed(0)}K ctx</span>
                      <span>{model.pricing}</span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* --- 区块 D: 记忆深度 --- */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">{t("settings.model.contextDepth")}</h3>
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">{t("settings.model.contextDepthLabel")}</label>
            <span className="text-sm text-muted-foreground">
              {contextLevel === 10 ? t("settings.model.contextDepthFull") : `${contextLevel} / 10`}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("settings.model.contextDepthDescription")}
          </p>
          <input
            type="range"
            min={1}
            max={10}
            step={1}
            value={contextLevel}
            onChange={(e) => setContextLevel(Number(e.target.value))}
            className="w-full accent-primary"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t("settings.model.contextDepthShort")}</span>
            <span>{t("settings.model.contextDepthFull")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
