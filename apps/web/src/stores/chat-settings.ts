import type { LLMProvider, SettingsSlice, SliceCreator } from "./chat-types";
import { DEFAULT_MODEL_BY_PROVIDER } from "../lib/model-catalog";

export const createSettingsSlice: SliceCreator<SettingsSlice> = (set, get) => ({
  providerKeys: {
    deepseek: "",
    openrouter: "",
    openai: "",
    moonshot: "",
    kimi: "",
    google: "",
  },
  currentProvider: "deepseek" as LLMProvider,
  currentModel: "deepseek-v4-flash",
  enableMarkdown: true,
  maxEpochs: 50,
  unlimitedEpochs: false,
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
    set({
      currentProvider: provider,
      currentModel: DEFAULT_MODEL_BY_PROVIDER[provider],
    });
  },

  setCurrentModel: (model) => set({ currentModel: model }),
  setEnableMarkdown: (enable) => set({ enableMarkdown: enable }),
  setMaxEpochs: (n) => set({ maxEpochs: Math.min(Math.max(n, 1), 50) }),
  setUnlimitedEpochs: (v) => set({ unlimitedEpochs: v }),
  setContextLevel: (level) => set({ contextLevel: Math.min(Math.max(level, 1), 10) }),
  setUiMode: (mode) => set({ uiMode: mode }),
  setTemperature: (t) => set({ temperature: Math.min(Math.max(t, 0), 2) }),

  initFromBackendConfig: (config) => {
    const { availableProviders, defaultProvider } = config;
    if (availableProviders.length > 0 && defaultProvider) {
      const provider = defaultProvider as LLMProvider;
      const newProviderKeys: Record<LLMProvider, string> = { ...get().providerKeys };
      availableProviders.forEach((p) => {
        const prov = p as LLMProvider;
        if (!newProviderKeys[prov]) {
          newProviderKeys[prov] = "backend";
        }
      });
      set({
        currentProvider: provider,
        currentModel: DEFAULT_MODEL_BY_PROVIDER[provider],
        providerKeys: newProviderKeys,
      });
    }
  },
});
