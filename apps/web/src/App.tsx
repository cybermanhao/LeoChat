import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ChatLayout } from "./components/ChatLayout";
import { useThemeStore } from "./stores/theme";
import { useChatStore } from "./stores/chat";
import { useMCPStore } from "./stores/mcp";
import { TooltipProvider } from "@ai-chatbox/ui";
import { chatApi } from "./lib/api";
import { initializeI18n } from "./i18n";

// Layout
import { AppLayout } from "./components/layout/AppLayout";

// Pages
import { KnowledgeBasePage } from "./pages/KnowledgeBase";
import { SettingsPage } from "./pages/Settings";

// MCP Pages
import { MCPSettingsLayout } from "./pages/settings/MCPSettingsLayout";
import { MCPServersPage } from "./pages/settings/MCPServers";
import { MCPServerEditPage } from "./pages/settings/MCPServerEdit";
import { MCPServerAddPage } from "./pages/settings/MCPServerAdd";
import { MCPToolsPage } from "./pages/settings/MCPTools";
import { MCPResourcesPage } from "./pages/settings/MCPResources";
import { MCPPromptsPage } from "./pages/settings/MCPPrompts";
import { MCPStatsPage } from "./pages/settings/MCPStats";

function AppInit({ children }: { children: React.ReactNode }) {
  const { currentTheme, applyTheme } = useThemeStore();
  const initFromBackendConfig = useChatStore((s) => s.initFromBackendConfig);
  const initBuiltinServers = useMCPStore((s) => s.initBuiltinServers);
  const autoConnectAll = useMCPStore((s) => s.autoConnectAll);

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme, applyTheme]);

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

  // 启动时从后端获取 LLM 配置
  useEffect(() => {
    chatApi.getLLMConfig().then((config) => {
      if (config.backendConfigured) {
        initFromBackendConfig(config);
        console.log("[App] Backend LLM config loaded:", config);
      }
    }).catch((err) => {
      console.warn("[App] Failed to load backend LLM config:", err);
    });
  }, [initFromBackendConfig]);

  return <>{children}</>;
}

export function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <AppInit>
          <Routes>
            {/* Main Layout with Activity Bar */}
            <Route element={<AppLayout />}>
              {/* Chat */}
              <Route path="/" element={<ChatLayout />} />

              {/* MCP Management */}
              <Route path="/mcp" element={<MCPSettingsLayout />}>
                <Route index element={<Navigate to="/mcp/servers" replace />} />
                <Route path="servers" element={<MCPServersPage />} />
                <Route path="servers/add" element={<MCPServerAddPage />} />
                <Route path="servers/:serverId/edit" element={<MCPServerEditPage />} />
                <Route path="tools" element={<MCPToolsPage />} />
                <Route path="resources" element={<MCPResourcesPage />} />
                <Route path="prompts" element={<MCPPromptsPage />} />
                <Route path="stats" element={<MCPStatsPage />} />
              </Route>

              {/* Knowledge Base */}
              <Route path="/knowledge" element={<KnowledgeBasePage />} />

              {/* Settings */}
              <Route path="/settings" element={<SettingsPage />} />
            </Route>

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppInit>
      </BrowserRouter>
    </TooltipProvider>
  );
}
