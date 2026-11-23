import { useEffect, useState } from "react";
import { BrowserRouter, HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { ChatLayout } from "./components/ChatLayout";
import { useThemeStore } from "./stores/theme";
import { useChatStore } from "./stores/chat";
import { useMCPStore } from "./stores/mcp";
import { TooltipProvider } from "@ai-chatbox/ui";
import { chatApi } from "./lib/api";
import { initializeI18n } from "./i18n";
import { migrateFromLocalStorage, getChatStorageAdapter } from "./lib/chat-persistence";
import { LoadingScreen } from "./components/LoadingScreen";
import { useOnboardingStore } from "./stores/onboarding";
import { OnboardingWizard } from "./components/OnboardingWizard";

// Electron production uses file:// protocol, which requires HashRouter
const isFileProtocol = window.location.protocol === "file:";
const Router = isFileProtocol ? HashRouter : BrowserRouter;

// Layout
import { AppLayout } from "./components/layout/AppLayout";

// Pages
import { KnowledgeBasePage } from "./pages/KnowledgeBase";
import { SettingsLayout, SettingsIndexRedirect, LegacyMcpRedirect, GeneralSettings, AboutSettings } from "./pages/Settings";
import { AppearanceSettings } from "./pages/settings/AppearanceSettings";
import { LLMSettings } from "./pages/settings/LLMSettings";
import { NetworkSettings } from "./pages/settings/NetworkSettings";

// MCP Pages
import { MCPSettingsLayout } from "./pages/settings/MCPSettingsLayout";
import { MCPServersPage } from "./pages/settings/MCPServers";
import { MCPServerEditPage } from "./pages/settings/MCPServerEdit";
import { MCPServerAddPage } from "./pages/settings/MCPServerAdd";
import { MCPToolsPage } from "./pages/settings/MCPTools";
import { MCPResourcesPage } from "./pages/settings/MCPResources";
import { MCPPromptsPage } from "./pages/settings/MCPPrompts";
import { MCPStatsPage } from "./pages/settings/MCPStats";

function ThemeInit() {
  const { currentTheme, applyTheme } = useThemeStore();
  useEffect(() => { applyTheme(currentTheme); }, [currentTheme, applyTheme]);
  return null;
}

/** Waits for the Electron main process to signal the server is ready. */
function useServerReady(): boolean {
  // In web/dev mode the server is always already running.
  const [ready, setReady] = useState(!isFileProtocol);

  useEffect(() => {
    if (!isFileProtocol) return;
    const electronAPI = (window as unknown as {
      electronAPI?: { invoke?: (ch: string) => Promise<unknown> }
    }).electronAPI;

    if (!electronAPI?.invoke) {
      setReady(true);
      return;
    }

    // invoke("server:port") blocks in the main process until serverPortPromise
    // resolves — no race condition: works whether server is already ready or not.
    electronAPI.invoke("server:port")
      .then(() => setReady(true))
      .catch(() => setReady(true));
  }, []);

  return ready;
}

function AppInit({ children }: { children: React.ReactNode }) {
  const { currentTheme, applyTheme } = useThemeStore();
  const initFromBackendConfig = useChatStore((s) => s.initFromBackendConfig);
  const initBuiltinServers = useMCPStore((s) => s.initBuiltinServers);
  const autoConnectAll = useMCPStore((s) => s.autoConnectAll);

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme, applyTheme]);

  useEffect(() => {
    migrateFromLocalStorage("ai-chatbox-chat", getChatStorageAdapter());
    // @ts-ignore - Vite env types
    if (import.meta.env.DEV) {
      window.__devClearHistory = () => {
        void useChatStore.getState().clearAllConversations();
        console.log("[Dev] All chat history cleared");
      };
    }
  }, []);

  // 会话保存在本地 server：等持久化的设置（含当前会话 id）恢复后，再拉会话列表
  useEffect(() => {
    const load = () => void useChatStore.getState().loadConversations();
    if (useChatStore.persist.hasHydrated()) {
      load();
      return;
    }
    return useChatStore.persist.onFinishHydration(load);
  }, []);

  // 初始化国际化系统
  useEffect(() => {
    initializeI18n();
  }, []);

  // 初始化内置 MCP 服务
  useEffect(() => {
    initBuiltinServers();
  }, [initBuiltinServers]);

  // 延迟自动连接 MCP 服务器，确保 GUI 已渲染
  useEffect(() => {
    const timer = setTimeout(() => {
      autoConnectAll();
    }, 1000);
    return () => clearTimeout(timer);
  }, [autoConnectAll]);

  // 启动时从后端获取 LLM 配置，并同步本地保存的 API keys 到后端
  useEffect(() => {
    let cancelled = false;
    chatApi.getLLMConfig().then((config) => {
      if (cancelled) return;
      if (config.backendConfigured) {
        initFromBackendConfig(config);
        console.log("[App] Backend LLM config loaded:", config);
      }
      const keys = useChatStore.getState().providerKeys;
      Object.entries(keys).forEach(([provider, key]) => {
        if (key && key !== "backend") {
          chatApi.setLLMConfig(provider, key).catch(() => {});
        }
      });
    }).catch((err) => {
      if (!cancelled) {
        console.warn("[App] Failed to load backend LLM config:", err);
      }
    });
    return () => { cancelled = true; };
  }, [initFromBackendConfig]);

  return <>{children}</>;
}

export function App() {
  const serverReady = useServerReady();
  const onboardingCompleted = useOnboardingStore((s) => s.onboardingCompleted);

  if (!serverReady) {
    return (
      <div className="h-full animate-in fade-in duration-200">
        <LoadingScreen />
      </div>
    );
  }

  if (!onboardingCompleted) {
    return (
      <TooltipProvider>
        <ThemeInit />
        <OnboardingWizard />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Router>
        <AppInit>
          <Routes>
            {/* Main Layout with Activity Bar */}
            <Route element={<AppLayout />}>
              {/* Chat */}
              <Route path="/" element={<ChatLayout />} />

              {/* Knowledge Base */}
              <Route path="/knowledge" element={<KnowledgeBasePage />} />

              {/* Settings（MCP 并入设置：/settings/mcp/*） */}
              <Route path="/settings" element={<SettingsLayout />}>
                <Route index element={<SettingsIndexRedirect />} />
                <Route path="general" element={<GeneralSettings />} />
                <Route path="appearance" element={<AppearanceSettings />} />
                <Route path="model" element={<LLMSettings />} />
                <Route path="network" element={<NetworkSettings />} />
                <Route path="about" element={<AboutSettings />} />
                <Route path="mcp" element={<MCPSettingsLayout />}>
                  <Route index element={<Navigate to="servers" replace />} />
                  <Route path="servers" element={<MCPServersPage />} />
                  <Route path="servers/add" element={<MCPServerAddPage />} />
                  <Route path="servers/:serverId/edit" element={<MCPServerEditPage />} />
                  <Route path="tools" element={<MCPToolsPage />} />
                  <Route path="resources" element={<MCPResourcesPage />} />
                  <Route path="prompts" element={<MCPPromptsPage />} />
                  <Route path="stats" element={<MCPStatsPage />} />
                </Route>
              </Route>

              {/* 旧的 MCP 一级页面 → 设置里的 MCP */}
              <Route path="/mcp/*" element={<LegacyMcpRedirect />} />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppInit>
      </Router>
    </TooltipProvider>
  );
}
