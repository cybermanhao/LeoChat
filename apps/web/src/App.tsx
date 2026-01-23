import { useEffect } from "react";
import { ChatLayout } from "./components/ChatLayout";
import { useThemeStore } from "./stores/theme";
import { useChatStore } from "./stores/chat";
import { TooltipProvider } from "@ai-chatbox/ui";
import { chatApi } from "./lib/api";

export function App() {
  const { currentTheme, applyTheme } = useThemeStore();
  const initFromBackendConfig = useChatStore((s) => s.initFromBackendConfig);

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme, applyTheme]);

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
      <div className="flex h-screen flex-col">
        <ChatLayout />
      </div>
    </TooltipProvider>
  );
}
