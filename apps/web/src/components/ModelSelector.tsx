import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ai-chatbox/ui";
import { Sparkles, Check, ExternalLink, RefreshCw } from "lucide-react";
import { useT } from "../i18n";
import { useChatStore, type LLMProvider } from "../stores/chat";
import { useModelCatalog } from "../lib/model-catalog";

const PROVIDER_INFO: Record<LLMProvider, { name: string; link: string }> = {
  deepseek: { name: "DeepSeek", link: "https://platform.deepseek.com" },
  openai: { name: "OpenAI", link: "https://platform.openai.com" },
  openrouter: { name: "OpenRouter", link: "https://openrouter.ai/models" },
  moonshot: { name: "Moonshot (Kimi)", link: "https://platform.moonshot.cn" },
  kimi: { name: "Kimi (Coding)", link: "https://platform.moonshot.cn/console/api-keys" },
  google: { name: "Google Gemini", link: "https://aistudio.google.com/app/apikey" },
};

interface ModelSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentModel?: string;
  currentProvider: LLMProvider;
  onSelect: (modelId: string) => void;
}

export function ModelSelector({
  open,
  onOpenChange,
  currentModel,
  currentProvider,
  onSelect,
}: ModelSelectorProps) {
  const { t } = useT();
  const [searchQuery, setSearchQuery] = useState("");
  const [customInput, setCustomInput] = useState("");

  const providerKeys = useChatStore((s) => s.providerKeys);
  const catalog = useModelCatalog(currentProvider, providerKeys[currentProvider] || "", t);

  const providerInfo = PROVIDER_INFO[currentProvider];

  const filteredModels = catalog.models.filter(
    (model) =>
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (modelId: string) => {
    onSelect(modelId);
    onOpenChange(false);
  };

  const applyCustom = () => {
    const id = customInput.trim();
    if (id) handleSelect(id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {t("settings.model.selectModel")}
            {catalog.source === "api" && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                实时 · {catalog.models.length}
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {t("settings.model.defaultProvider")}: {providerInfo.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 搜索框 */}
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={t("models.searchPlaceholder")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={catalog.refresh}
              disabled={catalog.loading}
              title="刷新模型列表"
              className="flex items-center gap-1 rounded-md border border-primary/30 px-2.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10 disabled:opacity-50"
            >
              <RefreshCw className={catalog.loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            </button>
          </div>

          {catalog.error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
              获取失败：{catalog.error}
            </div>
          )}

          {/* 模型列表 */}
          <div className="max-h-[360px] space-y-1 overflow-y-auto">
            {filteredModels.map((model) => {
              const showId = model.name !== model.id;
              return (
                <button
                  key={model.id}
                  onClick={() => handleSelect(model.id)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
                    currentModel === model.id
                      ? "border-primary bg-primary/5"
                      : "border-transparent"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium truncate">{model.name}</span>
                      {currentModel === model.id && (
                        <Check className="h-4 w-4 text-primary shrink-0" />
                      )}
                    </div>
                    {showId && (
                      <p className="text-[11px] font-mono text-muted-foreground/70 truncate">{model.id}</p>
                    )}
                    {model.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {model.description}
                      </p>
                    )}
                    {(model.contextWindow || model.pricing) && (
                      <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                        {model.contextWindow ? (
                          <span>
                            {t("models.context")}: {(model.contextWindow / 1000).toFixed(0)}K
                          </span>
                        ) : null}
                        {model.pricing ? <span>{model.pricing}</span> : null}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
            {filteredModels.length === 0 && (
              <div className="py-6 text-center text-xs text-muted-foreground">无匹配模型</div>
            )}
          </div>

          {/* 自定义模型输入 */}
          <div className="flex gap-2 border-t pt-3">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") applyCustom();
              }}
              placeholder="输入模型 ID（列表没有的也能用）"
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={applyCustom}
              disabled={!customInput.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              使用
            </button>
          </div>

          {/* 提供商链接 */}
          <div className="flex items-center justify-between border-t pt-3 text-sm text-muted-foreground">
            <span>{providerInfo.name}</span>
            <a
              href={providerInfo.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              {t("models.viewAllModels")}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
