import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChatInput,
  ChatMessage as ChatMessageComponent,
  MessageActions,
  MCPQuickPanel,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@ai-chatbox/ui";
import {
  StreamingContent,
  CodeBlock,
  ActionButtonGroup,
  ActionCardGroup,
} from "@ai-chatbox/ui";
import { parseActionTags, parseCardTags } from "@ai-chatbox/shared";
import { Sparkles, Trash2, RefreshCw, Thermometer, Layers } from "lucide-react";
import { useT } from "../i18n";
import { useChatStore } from "../stores/chat";
import { useMCPStore } from "../stores/mcp";
import { usePromptStore } from "../stores/prompt";
import { mcpApi } from "../lib/api";
import { ModelSelector } from "./ModelSelector";
import { SystemPromptPanel } from "./SystemPromptPanel";

export function ChatArea() {
  const { t } = useT();
  const navigate = useNavigate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversations = useChatStore((s) => s.conversations);
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const input = useChatStore((s) => s.input);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const setInput = useChatStore((s) => s.setInput);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const cancelGeneration = useChatStore((s) => s.cancelGeneration);
  const currentProvider = useChatStore((s) => s.currentProvider);
  const currentModel = useChatStore((s) => s.currentModel);
  const setCurrentModel = useChatStore((s) => s.setCurrentModel);
  const enableMarkdown = useChatStore((s) => s.enableMarkdown);
  const setEnableMarkdown = useChatStore((s) => s.setEnableMarkdown);
  const maxEpochs = useChatStore((s) => s.maxEpochs);
  const setMaxEpochs = useChatStore((s) => s.setMaxEpochs);
  const toolCallStates = useChatStore((s) => s.toolCallStates);
  const executeAction = useChatStore((s) => s.executeAction);
  const uiMode = useChatStore((s) => s.uiMode);
  const temperature = useChatStore((s) => s.temperature);
  const setTemperature = useChatStore((s) => s.setTemperature);
  const contextLevel = useChatStore((s) => s.contextLevel);
  const setContextLevel = useChatStore((s) => s.setContextLevel);

  // 直接计算 messages，确保响应式更新
  const currentConversation = conversations.find((c) => c.id === currentConversationId);
  const messages = currentConversation?.displayMessages || [];

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: "smooth",
        });
      });
    }
  }, []);

  // 新消息时滚动到底部
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages.length, scrollToBottom]);

  // 流式生成时自动滚动（监听最后一条消息的内容变化）
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    if (isGenerating && lastMessage?.role === "assistant") {
      scrollToBottom();
    }
  }, [isGenerating, lastMessage?.content, lastMessage?.followup_content, scrollToBottom]);

  // 将 toolCallStates 转换为 UI 组件需要的格式
  const getToolCallStatesForMessage = useCallback(
    (message: DisplayMessage) => {
      // 从 contentItems 中查找 tool-call 类型的内容项
      const toolCallItems = message.contentItems.filter(item => item.type === 'tool-call');

      if (toolCallItems.length === 0) return [];

      return toolCallItems.map((item) => {
        const toolCall = item.content as ToolCall;
        const state = toolCallStates[toolCall.id];
        return {
          id: toolCall.id,
          name: toolCall.name || '',
          status: (state?.status || "pending") as "pending" | "running" | "success" | "error",
          arguments: toolCall.arguments,
          result: state?.result,
          error: state?.error,
          duration: state?.endTime && state?.startTime
            ? state.endTime - state.startTime
            : undefined,
        };
      });
    },
    [toolCallStates]
  );

  // MCP Store
  const mcpSources = useMCPStore((s) => s.sources);
  const mcpServerStates = useMCPStore((s) => s.serverStates);
  const mcpConnectingServerIds = useMCPStore((s) => s.connectingServerIds);
  const mcpEnabledServerIds = useMCPStore((s) => s.enabledServerIds);
  const toggleMCPServer = useMCPStore((s) => s.toggleServer);
  const getEnabledTools = useMCPStore((s) => s.getEnabledTools);
  const disabledToolIds = useMCPStore((s) => s.disabledToolIds);

  // Chat Store - MCP Tools
  const setMCPTools = useChatStore((s) => s.setMCPTools);

  // 将 connectingServerIds Set 转换为 Record<string, boolean>
  const mcpIsConnecting = useMemo(() => {
    const record: Record<string, boolean> = {};
    mcpConnectingServerIds.forEach(id => {
      record[id] = true;
    });
    return record;
  }, [mcpConnectingServerIds]);

  // 同步 MCP 工具到 Chat Store（过滤禁用的工具）
  useEffect(() => {
    const enabledTools = getEnabledTools();
    setMCPTools(enabledTools);
  }, [getEnabledTools, disabledToolIds, mcpEnabledServerIds, setMCPTools]);

  // 对话框状态
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  // Temperature Popover
  const [tempPopoverOpen, setTempPopoverOpen] = useState(false);
  const tempPopoverRef = useRef<HTMLDivElement>(null);

  // Context Window Popover
  const [ctxPopoverOpen, setCtxPopoverOpen] = useState(false);
  const ctxPopoverRef = useRef<HTMLDivElement>(null);

  // Max Epochs Popover
  const [epochsPopoverOpen, setEpochsPopoverOpen] = useState(false);
  const epochsPopoverRef = useRef<HTMLDivElement>(null);

  // Prompt store
  const activePrompt = usePromptStore((s) => s.activePrompt);
  const customPrompts = usePromptStore((s) => s.customPrompts);
  const mcpPromptCache = usePromptStore((s) => s.mcpPromptCache);
  const cachePromptContent = usePromptStore((s) => s.cachePromptContent);

  // 自动拉取已连接 MCP 服务器的提示词（无必填参数的）
  useEffect(() => {
    for (const source of mcpSources) {
      for (const server of source.servers) {
        const state = mcpServerStates[server.id];
        if (!state?.prompts?.length) continue;
        for (const p of state.prompts) {
          // 跳过有必填参数的提示词
          if (p.arguments?.some((a) => a.required)) continue;
          const key = `${server.id}:${p.name}`;
          if (mcpPromptCache[key]) continue; // 已缓存，跳过
          mcpApi
            .getPrompt(server.id, p.name)
            .then((raw) => {
              const result = raw as { messages?: Array<{ content: string | { text: string } }> };
              const parts: string[] = [];
              if (result.messages?.length) {
                for (const m of result.messages) {
                  const c = m.content;
                  const text = typeof c === "string" ? c : (c as { text: string }).text ?? "";
                  if (text) parts.push(text);
                }
              }
              const content = parts.join("\n");
              if (content) cachePromptContent(server.id, p.name, content);
            })
            .catch((e) => console.error("Failed to auto-fetch MCP prompt", e));
        }
      }
    }
  }, [mcpSources, mcpServerStates, mcpPromptCache, cachePromptContent]);

  // 组合最终 system prompt：所有已缓存的 MCP 提示词 + 激活的自定义提示词
  const selectedPromptContent = useMemo(() => {
    const parts: string[] = [];
    for (const source of mcpSources) {
      for (const server of source.servers) {
        const state = mcpServerStates[server.id];
        for (const p of state?.prompts ?? []) {
          const key = `${server.id}:${p.name}`;
          if (mcpPromptCache[key]) parts.push(mcpPromptCache[key]);
        }
      }
    }
    if (activePrompt?.type === "custom") {
      const custom = customPrompts.find((p) => p.id === activePrompt.id);
      if (custom?.content) parts.push(custom.content);
    }
    return parts.length > 0 ? parts.join("\n\n") : null;
  }, [mcpSources, mcpServerStates, mcpPromptCache, activePrompt, customPrompts]);

  // 点击外部关闭 Temperature Popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tempPopoverRef.current && !tempPopoverRef.current.contains(event.target as Node)) {
        setTempPopoverOpen(false);
      }
    };
    if (tempPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [tempPopoverOpen]);

  // 点击外部关闭 Context Window Popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ctxPopoverRef.current && !ctxPopoverRef.current.contains(event.target as Node)) {
        setCtxPopoverOpen(false);
      }
    };
    if (ctxPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ctxPopoverOpen]);

  // 点击外部关闭 Max Epochs Popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (epochsPopoverRef.current && !epochsPopoverRef.current.contains(event.target as Node)) {
        setEpochsPopoverOpen(false);
      }
    };
    if (epochsPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [epochsPopoverOpen]);

  const handleModelSelect = useCallback(
    (modelId: string) => {
      setCurrentModel(modelId);
    },
    [setCurrentModel]
  );

  const handleClearChat = useCallback(() => {
    // TODO: 实现清空当前对话
    if (confirm(t("chat.confirmClear"))) {
      console.log("Clear chat");
    }
  }, []);

  const handleSend = () => {
    if (input.trim() && !isGenerating) {
      sendMessage(input, selectedPromptContent ?? undefined);
    }
  };

  // 工具栏按钮样式
  const toolbarButtonClass = "h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground";

  const toolbar = (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1 flex-wrap py-1">
        {/* MCP 服务 */}
        <MCPQuickPanel
          sources={mcpSources}
          serverStates={mcpServerStates}
          isConnecting={mcpIsConnecting}
          mcpServerCount={mcpEnabledServerIds.length}
          onToggleServer={toggleMCPServer}
          onServerClick={(serverId) => {
            navigate(`/mcp/servers/${serverId}/edit`);
          }}
          onSettingsClick={() => navigate("/mcp/servers")}
          onAddServer={() => navigate("/mcp/servers/add")}
        />

        {/* 模型选择 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={toolbarButtonClass}
              onClick={() => setModelSelectorOpen(true)}
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">
                {currentProvider}/{currentModel.includes("/") ? currentModel.split("/").pop() : currentModel}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {t("settings.model.selectModel")}
          </TooltipContent>
        </Tooltip>

        {/* 系统提示（仅专业模式） */}
        {uiMode === 'professional' && <SystemPromptPanel />}

        {/* Temperature 按钮（仅专业模式） */}
        {uiMode === 'professional' && (
          <div ref={tempPopoverRef} className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(toolbarButtonClass, tempPopoverOpen && "bg-muted text-foreground")}
                  onClick={() => setTempPopoverOpen(!tempPopoverOpen)}
                >
                  <Thermometer className="h-4 w-4" />
                  <span className="hidden sm:inline">{temperature.toFixed(1)}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {t("chat.temperature")}
              </TooltipContent>
            </Tooltip>
            {tempPopoverOpen && (
              <div className="bg-card border border-border rounded-lg shadow-lg p-3 absolute bottom-full mb-1 z-50 w-48">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-foreground font-medium">{t("chat.temperature")}</span>
                  <span className="text-xs text-muted-foreground">{temperature.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">0</span>
                  <span className="text-[10px] text-muted-foreground">2</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Context Window 按钮（仅专业模式） */}
        {uiMode === 'professional' && (
          <div ref={ctxPopoverRef} className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(toolbarButtonClass, ctxPopoverOpen && "bg-muted text-foreground")}
                  onClick={() => setCtxPopoverOpen(!ctxPopoverOpen)}
                >
                  <Layers className="h-4 w-4" />
                  <span className="hidden sm:inline">{contextLevel === 10 ? "∞" : contextLevel}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {t("chat.contextWindow")}
              </TooltipContent>
            </Tooltip>
            {ctxPopoverOpen && (
              <div className="bg-card border border-border rounded-lg shadow-lg p-3 absolute bottom-full mb-1 z-50 w-48">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-foreground font-medium">{t("chat.contextWindow")}</span>
                  <span className="text-xs text-muted-foreground">{contextLevel === 10 ? "∞" : contextLevel}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={contextLevel}
                  onChange={(e) => setContextLevel(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">1</span>
                  <span className="text-[10px] text-muted-foreground">∞</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 最大循环轮数（仅专业模式） */}
        {uiMode === 'professional' && (
          <div ref={epochsPopoverRef} className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(toolbarButtonClass, epochsPopoverOpen && "bg-muted text-foreground")}
                  onClick={() => setEpochsPopoverOpen(!epochsPopoverOpen)}
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline">{maxEpochs}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {t("chat.maxEpochs")}
              </TooltipContent>
            </Tooltip>
            {epochsPopoverOpen && (
              <div className="bg-card border border-border rounded-lg shadow-lg p-3 absolute bottom-full mb-1 z-50 w-48">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-foreground font-medium">{t("chat.maxEpochs")}</span>
                  <span className="text-xs text-muted-foreground">{maxEpochs}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={maxEpochs}
                  onChange={(e) => setMaxEpochs(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">1</span>
                  <span className="text-[10px] text-muted-foreground">50</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 清空对话 */}
        {messages.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={toolbarButtonClass}
                onClick={handleClearChat}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">{t("chat.clear")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {t("chat.clearConversation")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );

  const inputElement = (
    <ChatInput
      value={input}
      onChange={setInput}
      onSend={handleSend}
      onCancel={cancelGeneration}
      isLoading={isGenerating}
      placeholder={selectedPromptContent ? t("chat.placeholderWithPrompt") : t("chat.placeholderDefault")}
      toolbar={toolbar}
    />
  );

  // 空状态：居中显示欢迎信息和输入框（仅在没有消息且不在生成中时显示）
  if (messages.length === 0 && !isGenerating) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden p-4">
        <div className="w-full max-w-2xl space-y-8">
          {/* 欢迎信息 */}
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight">
              {t("chat.welcome")}
            </h1>
            <p className="mt-3 text-muted-foreground">
              {t("chat.welcomeDescription")}
            </p>
          </div>

          {/* 输入框 */}
          <div className="w-full">{inputElement}</div>

          {/* 快捷提示 */}
          <div
            className="flex flex-wrap justify-center gap-2"
            style={{ marginTop: '32px' }}
          >
            {[
              t("chat.suggestions.code"),
              t("chat.suggestions.explain"),
              t("chat.suggestions.translate"),
              t("chat.suggestions.summarize"),
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setInput(suggestion)}
                className="rounded-full border bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Dialogs */}
        <ModelSelector
          open={modelSelectorOpen}
          onOpenChange={setModelSelectorOpen}
          currentModel={currentModel}
          currentProvider={currentProvider}
          onSelect={handleModelSelect}
        />
      </div>
    );
  }

  // 有消息或正在生成：传统布局 - 输入框固定底部，消息区可滚动
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Messages - 可滚动区域 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 scrollbar-thin"
      >
        <div className="mx-auto max-w-3xl space-y-4">
          {messages.map((message, index) => (
            <ChatMessageComponent
              key={message.id}
              message={message}
              isStreaming={
                isGenerating &&
                index === messages.length - 1 &&
                message.role === "assistant"
              }
              toolCallStates={getToolCallStatesForMessage(message)}
              actions={
                message.role === "assistant" ? (
                  <MessageActions
                    content={message.contentItems
                      .filter(item => item.type === 'text')
                      .map(item => item.content as string)
                      .join(' ')}
                    enableMarkdown={enableMarkdown}
                    onMarkdownToggle={() => setEnableMarkdown(!enableMarkdown)}
                  />
                ) : undefined
              }
              renderContent={(content, isLastTextItem) => {
                const isStreamingMsg = isGenerating && index === messages.length - 1 && message.role === "assistant";
                const { actions: parsedActions, cleanContent: contentWithoutActions } = parseActionTags(content);
                const { cards, columns, cleanContent } = parseCardTags(contentWithoutActions);
                return (
                  <div className="space-y-4">
                    {cleanContent && (
                      <StreamingContent
                        content={cleanContent}
                        isStreaming={isStreamingMsg && isLastTextItem}
                        enableMarkdown={enableMarkdown}
                        renderCodeBlock={(code, language) => (
                          <CodeBlock code={code} language={language} showLineNumbers />
                        )}
                      />
                    )}
                    {cards.length > 0 && (
                      <ActionCardGroup
                        cards={cards}
                        columns={columns as 1 | 2 | 3}
                        isStreaming={isStreamingMsg}
                      />
                    )}
                    {parsedActions.length > 0 && (
                      <ActionButtonGroup
                        actions={parsedActions.map((a) => ({
                          name: a.name,
                          label: a.attributes.label,
                          attributes: a.attributes,
                        }))}
                        isStreaming={isStreamingMsg}
                        onAction={(actionName, attributes) => executeAction(actionName, attributes)}
                      />
                    )}
                  </div>
                );
              }}
            />
          ))}
        </div>
      </div>

      {/* Input Area - 固定在底部 */}
      <div className="flex-shrink-0 border-t p-4">
        <div className="mx-auto max-w-3xl">{inputElement}</div>
      </div>

      {/* Dialogs */}
      <ModelSelector
        open={modelSelectorOpen}
        onOpenChange={setModelSelectorOpen}
        currentModel={currentModel}
        currentProvider={currentProvider}
        onSelect={handleModelSelect}
      />
    </div>
  );
}
