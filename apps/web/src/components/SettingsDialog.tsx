import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
} from "@ai-chatbox/ui";
import { Settings, Eye, EyeOff, ExternalLink, Check } from "lucide-react";
import { useChatStore } from "../stores/chat";
import { t } from "../i18n";

type LLMProvider = "deepseek" | "openrouter" | "openai";

interface ProviderConfig {
  name: string;
  placeholder: string;
  description: string;
  link: string;
  linkText: string;
}

const PROVIDER_CONFIGS: Record<LLMProvider, ProviderConfig> = {
  deepseek: {
    name: "DeepSeek",
    placeholder: t("settings.api.keyPlaceholder"),
    description: t("settings.api.descriptionDeepSeek"),
    link: "https://platform.deepseek.com/api_keys",
    linkText: t("settings.api.linkTextDeepSeek"),
  },
  openrouter: {
    name: "OpenRouter",
    placeholder: t("settings.api.keyPlaceholder"),
    description: t("settings.api.descriptionOpenRouter"),
    link: "https://openrouter.ai/keys",
    linkText: t("settings.api.linkTextOpenRouter"),
  },
  openai: {
    name: "OpenAI",
    placeholder: t("settings.api.keyPlaceholder"),
    description: t("settings.api.descriptionOpenAI"),
    link: "https://platform.openai.com/api-keys",
    linkText: t("settings.api.linkTextOpenAI"),
  },
};

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const { providerKeys, setProviderKey, currentProvider, setCurrentProvider } = useChatStore();

  const [localKeys, setLocalKeys] = useState<Record<LLMProvider, string>>({
    deepseek: "",
    openrouter: "",
    openai: "",
  });
  const [showKeys, setShowKeys] = useState<Record<LLMProvider, boolean>>({
    deepseek: false,
    openrouter: false,
    openai: false,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalKeys({
        deepseek: providerKeys.deepseek || "",
        openrouter: providerKeys.openrouter || "",
        openai: providerKeys.openai || "",
      });
      setSaved(false);
    }
  }, [open, providerKeys]);

  const handleSave = () => {
    // 保存所有非空的 API Key
    Object.entries(localKeys).forEach(([provider, key]) => {
      if (key.trim()) {
        setProviderKey(provider as LLMProvider, key.trim());
      }
    });

    // 如果当前提供商没有 key，自动切换到有 key 的提供商
    if (!localKeys[currentProvider]?.trim()) {
      const availableProvider = (Object.entries(localKeys) as [LLMProvider, string][])
        .find(([, key]) => key.trim())?.[0];
      if (availableProvider) {
        setCurrentProvider(availableProvider);
      }
    }

    setSaved(true);
    setTimeout(() => {
      onOpenChange(false);
    }, 500);
  };

  const toggleShowKey = (provider: LLMProvider) => {
    setShowKeys((prev) => ({ ...prev, [provider]: !prev[provider] }));
  };

  const hasAnyKey = Object.values(localKeys).some((key) => key.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            {t("settings.api.title")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.api.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* 当前提供商选择 */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{t("settings.model.defaultProvider")}</label>
            <div className="flex gap-2">
              {(Object.keys(PROVIDER_CONFIGS) as LLMProvider[]).map((provider) => (
                <button
                  key={provider}
                  onClick={() => setCurrentProvider(provider)}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                    currentProvider === provider
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  {PROVIDER_CONFIGS[provider].name}
                </button>
              ))}
            </div>
          </div>

          {/* API Keys */}
          {(Object.entries(PROVIDER_CONFIGS) as [LLMProvider, ProviderConfig][]).map(
            ([provider, config]) => (
              <div key={provider} className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  {provider === 'deepseek' ? t("settings.api.descriptionDeepSeek") : 
                   provider === 'openrouter' ? t("settings.api.descriptionOpenRouter") : 
                   t("settings.api.descriptionOpenAI")} API Key
                  {localKeys[provider]?.trim() && (
                    <span className="text-xs text-green-500">✓ {t("settings.api.getConfigured")}</span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showKeys[provider] ? "text" : "password"}
                    value={localKeys[provider]}
                    onChange={(e) =>
                      setLocalKeys((prev) => ({ ...prev, [provider]: e.target.value }))
                    }
                    placeholder={config.placeholder}
                    className="w-full rounded-md border bg-background px-3 py-2 pr-10 text-sm outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey(provider)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  >
                    {showKeys[provider] ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h4 w-4" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">{config.description}</p>
                <a
                  href={config.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  {config.linkText}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            )
          )}

          {/* 保存按钮 */}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={!hasAnyKey}>
              {saved ? (
                <>
                  <Check className="mr-1 h-4 w-4" />
                  {t("settings.api.saveSuccess")}
                </>
              ) : (
                t("common.save")
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
