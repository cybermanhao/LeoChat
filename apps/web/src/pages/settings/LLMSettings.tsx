import { useState, useEffect, useMemo, useRef } from "react";
import { Check, Eye, EyeOff, ExternalLink, Sparkles, RefreshCw, Search } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import { chatApi } from "../../lib/api";
import { useChatStore, type LLMProvider } from "../../stores/chat";
import { useModelCatalog } from "../../lib/model-catalog";
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

  const [localKey, setLocalKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [modelSearch, setModelSearch] = useState("");
  const [customModelInput, setCustomModelInput] = useState("");

  // 模型目录：OpenRouter 走动态获取 + 24h 缓存，其它 provider 用精选兜底
  const catalog = useModelCatalog(currentProvider, providerKeys[currentProvider] || "", t);

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
    setSaveError(null);
    setModelSearch("");
  }, [currentProvider, providerKeys]);

  const handleSaveKey = async () => {
    const key = localKey.trim();
    if (!key || syncing) return;
    setSaveError(null);
    setSaved(false);
    setSyncing(true);
    // 本地持久化；同步交给下面这次 await（sync:false 避免 store 再发一次 POST）
    setProviderKey(currentProvider, key, { sync: false });
    try {
      // 显式等待后端确认拿到 key —— 失败时给出可见反馈，否则聊天会以笼统的 502 失败
      await chatApi.setLLMConfig(currentProvider, key);
      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "同步到后端失败");
    } finally {
      setSyncing(false);
    }
  };

  const currentProviderInfo = PROVIDERS.find((p) => p.id === currentProvider)!;
  const hasKey = !!(localKey.trim() || (providerKeys[currentProvider] && providerKeys[currentProvider] !== ""));

  const visibleModels = catalog.models.filter(
    (m) =>
      !modelSearch ||
      m.id.toLowerCase().includes(modelSearch.toLowerCase()) ||
      m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );
  const currentInList = catalog.models.some((m) => m.id === currentModel);

  const applyCustomModel = () => {
    const id = customModelInput.trim();
    if (id) {
      setCurrentModel(id);
      setCustomModelInput("");
    }
  };

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
              onChange={(e) => { setLocalKey(e.target.value); setSaved(false); setSaveError(null); }}
              placeholder={t("settings.api.keyPlaceholder")}
              className="w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary"
              onKeyDown={(e) => { if (e.key === "Enter") void handleSaveKey(); }}
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
              onClick={() => void handleSaveKey()}
              disabled={!localKey.trim() || syncing}
              className={cn(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
                saved
                  ? "bg-green-500/10 text-green-500"
                  : localKey.trim() && !syncing
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {syncing ? (
                "验证中..."
              ) : saved ? (
                <span className="flex items-center gap-1">
                  <Check className="h-3.5 w-3.5" />
                  {t("settings.api.saveSuccess")}
                </span>
              ) : (
                t("common.save")
              )}
            </button>
          </div>

          {saveError && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
              后端未确认收到 key：{saveError}
              <span className="block text-muted-foreground mt-0.5">key 已本地保存，可刷新页面重试，或检查后端是否运行。</span>
            </div>
          )}
        </div>
      </div>

      {/* --- 区块 C: 模型选择 --- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            {t("settings.model.selectModel")}
            {catalog.source === "api" && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                实时 · {catalog.models.length}
              </span>
            )}
          </h3>
          <button
            onClick={catalog.refresh}
            disabled={catalog.loading || !catalog.canRefresh}
            title={!catalog.canRefresh ? t("settings.api.configureKeyFirst", { provider: currentProviderInfo.name }) : "刷新模型列表"}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
              catalog.canRefresh
                ? "text-primary hover:bg-primary/10 border border-primary/30"
                : "text-muted-foreground border border-border cursor-not-allowed opacity-50"
            )}
          >
            <RefreshCw className={cn("h-3 w-3", catalog.loading && "animate-spin")} />
            {catalog.loading ? "刷新中..." : "刷新"}
          </button>
        </div>

        {!hasKey && (
          <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/5 p-3 text-sm text-yellow-800 dark:text-yellow-200">
            {t("settings.api.configureKeyFirst", { provider: currentProviderInfo.name })}
          </div>
        )}

        {catalog.error && (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
            获取失败：{catalog.error}
          </div>
        )}

        {/* 自定义模型输入 —— 列表未收录时的兜底入口 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={customModelInput}
            onChange={(e) => setCustomModelInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") applyCustomModel();
            }}
            placeholder="输入模型 ID（列表没有的也能用）"
            className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={applyCustomModel}
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
        {currentModel && !currentInList && (
          <div className="flex items-center gap-2 rounded-lg border border-primary bg-primary/5 px-3 py-2">
            <Check className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-sm font-medium text-foreground flex-1 truncate">{currentModel}</span>
            <span className="text-xs text-muted-foreground">当前使用</span>
          </div>
        )}

        {/* 搜索框（列表 > 8 条时显示） */}
        {catalog.models.length > 8 && (
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              placeholder={t("models.searchPlaceholder")}
              className="w-full rounded-md border bg-background pl-8 pr-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        )}

        {/* 模型列表 */}
        <div className="max-h-72 overflow-y-auto space-y-1.5">
          {visibleModels.map((model) => {
            const isSelected = currentModel === model.id;
            const showId = model.name !== model.id;
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
                    <span className="font-medium text-sm truncate">{model.name}</span>
                    {isSelected && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                  {showId && <p className="text-[11px] text-muted-foreground/70 font-mono truncate">{model.id}</p>}
                  {model.description && <p className="text-xs text-muted-foreground mt-0.5">{model.description}</p>}
                  {(model.contextWindow || model.pricing) && (
                    <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                      {model.contextWindow ? <span>{(model.contextWindow / 1000).toFixed(0)}K ctx</span> : null}
                      {model.pricing ? <span>{model.pricing}</span> : null}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
          {visibleModels.length === 0 && (
            <div className="py-4 text-center text-xs text-muted-foreground">无匹配模型</div>
          )}
        </div>
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
