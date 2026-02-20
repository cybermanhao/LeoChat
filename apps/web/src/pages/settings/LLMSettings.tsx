import { useState, useEffect, useMemo } from "react";
import { Check, Eye, EyeOff, ExternalLink, Sparkles } from "lucide-react";
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
  const setCurrentProvider = useChatStore((s) => s.setCurrentProvider);
  const setCurrentModel = useChatStore((s) => s.setCurrentModel);
  const setProviderKey = useChatStore((s) => s.setProviderKey);

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
  }), [t]);

  const [localKey, setLocalKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);

  // 切换 provider 时同步 key 到本地输入框
  useEffect(() => {
    const key = providerKeys[currentProvider] || "";
    setLocalKey(key === "backend" ? "" : key);
    setShowKey(false);
    setSaved(false);
  }, [currentProvider, providerKeys]);

  const handleSaveKey = () => {
    if (localKey.trim()) {
      setProviderKey(currentProvider, localKey.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
        <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5" />
          {t("settings.model.selectModel")}
        </h3>
        {!hasKey && (
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 text-sm text-yellow-800 dark:text-yellow-200">
            {t("settings.api.configureKeyFirst", { provider: currentProviderInfo.name })}
          </div>
        )}
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
      </div>
    </div>
  );
}
