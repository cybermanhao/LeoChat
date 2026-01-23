import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ai-chatbox/ui";
import { Sparkles, Check, ExternalLink } from "lucide-react";

type LLMProvider = "deepseek" | "openrouter" | "openai";

interface Model {
  id: string;
  name: string;
  provider: string;
  description?: string;
  contextWindow?: number;
  pricing?: string;
}

// DeepSeek 官方直连模型
const DEEPSEEK_MODELS: Model[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    provider: "DeepSeek",
    description: "通用对话模型，高性价比",
    contextWindow: 64000,
    pricing: "¥1 / 1M tokens",
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek R1",
    provider: "DeepSeek",
    description: "推理增强模型，支持思维链",
    contextWindow: 64000,
    pricing: "¥4 / 1M tokens",
  },
];

// OpenAI 官方直连模型
const OPENAI_MODELS: Model[] = [
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "最强大的多模态模型",
    contextWindow: 128000,
    pricing: "$2.50 / 1M tokens",
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "OpenAI",
    description: "快速且经济实惠",
    contextWindow: 128000,
    pricing: "$0.15 / 1M tokens",
  },
  {
    id: "gpt-4-turbo",
    name: "GPT-4 Turbo",
    provider: "OpenAI",
    description: "强大的推理能力",
    contextWindow: 128000,
    pricing: "$10.00 / 1M tokens",
  },
];

// OpenRouter 模型（通过 OpenRouter 代理）
const OPENROUTER_MODELS: Model[] = [
  {
    id: "anthropic/claude-3.5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    description: "出色的编程和推理能力",
    contextWindow: 200000,
    pricing: "$3.00 / 1M tokens",
  },
  {
    id: "anthropic/claude-3-opus",
    name: "Claude 3 Opus",
    provider: "Anthropic",
    description: "最强大的 Claude 模型",
    contextWindow: 200000,
    pricing: "$15.00 / 1M tokens",
  },
  {
    id: "google/gemini-pro-1.5",
    name: "Gemini Pro 1.5",
    provider: "Google",
    description: "超长上下文窗口",
    contextWindow: 1000000,
    pricing: "$1.25 / 1M tokens",
  },
  {
    id: "openai/gpt-4o",
    name: "GPT-4o",
    provider: "OpenAI",
    description: "通过 OpenRouter 访问",
    contextWindow: 128000,
    pricing: "$2.50 / 1M tokens",
  },
  {
    id: "deepseek/deepseek-chat",
    name: "DeepSeek Chat",
    provider: "DeepSeek",
    description: "通过 OpenRouter 访问",
    contextWindow: 64000,
    pricing: "$0.14 / 1M tokens",
  },
];

const MODELS_BY_PROVIDER: Record<LLMProvider, Model[]> = {
  deepseek: DEEPSEEK_MODELS,
  openai: OPENAI_MODELS,
  openrouter: OPENROUTER_MODELS,
};

const PROVIDER_INFO: Record<LLMProvider, { name: string; link: string }> = {
  deepseek: { name: "DeepSeek 官方", link: "https://platform.deepseek.com" },
  openai: { name: "OpenAI 官方", link: "https://platform.openai.com" },
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
  const [searchQuery, setSearchQuery] = useState("");

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
            选择模型
          </DialogTitle>
          <DialogDescription>
            当前服务商: {providerInfo.name}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 搜索框 */}
          <input
            type="text"
            placeholder="搜索模型..."
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
                        上下文: {(model.contextWindow / 1000).toFixed(0)}K
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
              查看所有模型
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
