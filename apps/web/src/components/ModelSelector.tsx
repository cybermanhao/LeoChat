import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ai-chatbox/ui";
import { Sparkles, Check, ExternalLink } from "lucide-react";
import { useT } from "../i18n";

type LLMProvider = "deepseek" | "openrouter" | "openai";

interface Model {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextWindow?: number;
  pricing?: string;
}

const PROVIDER_INFO: Record<LLMProvider, { name: string; link: string }> = {
  deepseek: { name: "DeepSeek", link: "https://platform.deepseek.com" },
  openai: { name: "OpenAI", link: "https://platform.openai.com" },
  openrouter: { name: "OpenRouter", link: "https://openrouter.ai/models" },
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

  const DEEPSEEK_MODELS = useMemo<Model[]>(() => [
    { id: "deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek", description: t("models.deepseek.chat.description"), contextWindow: 64000, pricing: "¥1 / 1M tokens" },
    { id: "deepseek-reasoner", name: "DeepSeek R1", provider: "DeepSeek", description: t("models.deepseek.reasoner.description"), contextWindow: 64000, pricing: "¥4 / 1M tokens" },
  ], [t]);

  const OPENAI_MODELS = useMemo<Model[]>(() => [
    { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", description: t("models.openai.gpt4o.description"), contextWindow: 128000, pricing: "$2.50 / 1M tokens" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "OpenAI", description: t("models.openai.gpt4oMini.description"), contextWindow: 128000, pricing: "$0.15 / 1M tokens" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", provider: "OpenAI", description: t("models.openai.gpt4Turbo.description"), contextWindow: 128000, pricing: "$10.00 / 1M tokens" },
  ], [t]);

  const OPENROUTER_MODELS = useMemo<Model[]>(() => [
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", provider: "Anthropic", description: t("models.anthropic.sonnet.description"), contextWindow: 200000, pricing: "$3.00 / 1M tokens" },
    { id: "anthropic/claude-3-opus", name: "Claude 3 Opus", provider: "Anthropic", description: t("models.anthropic.opus.description"), contextWindow: 200000, pricing: "$15.00 / 1M tokens" },
    { id: "google/gemini-pro-1.5", name: "Gemini Pro 1.5", provider: "Google", description: t("models.google.geminiPro.description"), contextWindow: 1000000, pricing: "$1.25 / 1M tokens" },
    { id: "openai/gpt-4o", name: "GPT-4o", provider: "OpenAI", description: t("models.common.viaOpenRouter"), contextWindow: 128000, pricing: "$2.50 / 1M tokens" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek Chat", provider: "DeepSeek", description: t("models.common.viaOpenRouter"), contextWindow: 64000, pricing: "$0.14 / 1M tokens" },
  ], [t]);

  const MODELS_BY_PROVIDER = useMemo<Record<LLMProvider, Model[]>>(() => ({
    deepseek: DEEPSEEK_MODELS,
    openai: OPENAI_MODELS,
    openrouter: OPENROUTER_MODELS,
  }), [DEEPSEEK_MODELS, OPENAI_MODELS, OPENROUTER_MODELS]);

  const models = MODELS_BY_PROVIDER[currentProvider] || [];
  const providerInfo = PROVIDER_INFO[currentProvider];

  const filteredModels = models.filter(
    (model) =>
      model.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      model.id.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSelect = (modelId: string) => {
    onSelect(modelId);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            {t("settings.model.selectModel")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.model.defaultProvider")}: {providerInfo.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 搜索框 */}
          <input
            type="text"
            placeholder={t("models.searchPlaceholder")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />

          {/* 模型列表 */}
          <div className="max-h-[400px] space-y-1 overflow-y-auto">
            {filteredModels.map((model) => (
              <button
                key={model.id}
                onClick={() => handleSelect(model.id)}
                className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-muted/50 ${
                  currentModel === model.id
                    ? "border-primary bg-primary/5"
                    : "border-transparent"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{model.name}</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {model.provider}
                    </span>
                    {currentModel === model.id && (
                      <Check className="h-4 w-4 text-primary" />
                    )}
                  </div>
                  {model.description && (
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {model.description}
                    </p>
                  )}
                  <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                    {model.contextWindow && (
                      <span>
                        {t("models.context")}: {(model.contextWindow / 1000).toFixed(0)}K
                      </span>
                    )}
                    {model.pricing && <span>{model.pricing}</span>}
                  </div>
                </div>
              </button>
            ))}
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
