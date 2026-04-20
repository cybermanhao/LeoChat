import type { LLMProvider, SettingsSlice, SliceCreator } from "./chat-types";

export const createSettingsSlice: SliceCreator<SettingsSlice> = (set, get) => ({
  providerKeys: {
    deepseek: "",
    openrouter: "",
    openai: "",
    moonshot: "",
    "kimi-code": "",
    google: "",
  },
  currentProvider: "deepseek" as LLMProvider,
  currentModel: "deepseek-chat",
  enableMarkdown: true,
  maxEpochs: 10,
  contextLevel: 5,
  uiMode: "simple" as "simple" | "professional",
  temperature: 0.7,
  llmConfig: null,
  mcpTools: [],

  setLLMConfig: (config) => set({ llmConfig: config }),
  setMCPTools: (tools) => set({ mcpTools: tools }),

  setProviderKey: (provider, key) => {
    set((state) => ({
      providerKeys: { ...state.providerKeys, [provider]: key },
    }));
    if (key && key !== "backend") {
      import("../lib/api").then(({ chatApi }) => {
        chatApi.setLLMConfig(provider, key).catch((err) => {
          console.warn("[Chat] Failed to sync API key to backend:", err);
        });
      });
    }
  },

  setCurrentProvider: (provider) => {
    const defaultModels: Record<LLMProvider, string> = {
      deepseek: "deepseek-chat",
      openrouter: "anthropic/claude-3.5-sonnet",
      openai: "gpt-4o",
      moonshot: "moonshot-v1-8k",
      "kimi-code": "kimi-for-coding",
      google: "gemini-2.0-flash",
    };
    set({
      currentProvider: provider,
      currentModel: defaultModels[provider],
    });
  },

  setCurrentModel: (model) => set({ currentModel: model }),
  setEnableMarkdown: (enable) => set({ enableMarkdown: enable }),
  setMaxEpochs: (n) => set({ maxEpochs: Math.min(Math.max(n, 1), 50) }),
  setContextLevel: (level) => set({ contextLevel: Math.min(Math.max(level, 1), 10) }),
  setUiMode: (mode) => set({ uiMode: mode }),
  setTemperature: (t) => set({ temperature: Math.min(Math.max(t, 0), 2) }),

  initFromBackendConfig: (config) => {
    const { availableProviders, defaultProvider } = config;
    if (availableProviders.length > 0 && defaultProvider) {
      const provider = defaultProvider as LLMProvider;
      const defaultModels: Record<LLMProvider, string> = {
        deepseek: "deepseek-chat",
        openrouter: "anthropic/claude-3.5-sonnet",
        openai: "gpt-4o",
        moonshot: "moonshot-v1-8k",
        "kimi-code": "kimi-for-coding",
        google: "gemini-2.0-flash",
      };
      const newProviderKeys: Record<LLMProvider, string> = { ...get().providerKeys };
      availableProviders.forEach((p) => {
        const prov = p as LLMProvider;
        if (!newProviderKeys[prov]) {
          newProviderKeys[prov] = "backend";
        }
      });
      set({
        currentProvider: provider,
        currentModel: defaultModels[provider],
        providerKeys: newProviderKeys,
      });
    }
  },
});
