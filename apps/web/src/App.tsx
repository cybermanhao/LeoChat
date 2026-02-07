import { useEffect } from "react";
import { ChatLayout } from "./components/ChatLayout";
import { useThemeStore } from "./stores/theme";
import { useChatStore } from "./stores/chat";
import { useMCPStore } from "./stores/mcp";
import { TooltipProvider } from "@ai-chatbox/ui";
import { chatApi } from "./lib/api";

export function App() {
  const { currentTheme, applyTheme } = useThemeStore();
  const initFromBackendConfig = useChatStore((s) => s.initFromBackendConfig);
  const initBuiltinServers = useMCPStore((s) => s.initBuiltinServers);

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme, applyTheme]);

  // 初始化内置 MCP 服务
  useEffect(() => {
    initBuiltinServers();
  }, [initBuiltinServers]);

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

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col overflow-hidden bg-background text-foreground">
        <ChatLayout />
      </div>
    </TooltipProvider>
  );
}
