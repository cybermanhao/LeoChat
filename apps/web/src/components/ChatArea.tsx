import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import {
  ChatInput,
  ChatMessage as ChatMessageComponent,
  MessageActions,
  MCPQuickPanel,
  PromptPanel,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
  type PromptItem,
} from "@ai-chatbox/ui";
import {
  StreamingContent,
  CodeBlock,
  ActionButtonGroup,
  ActionCardGroup,
} from "@ai-chatbox/ui";
import { parseActionTags, parseCardTags } from "@ai-chatbox/shared";
import { Sparkles, Globe, FileText, Trash2 } from "lucide-react";
import { useChatStore } from "../stores/chat";
import { useMCPStore } from "../stores/mcp";
import { MCPDialog } from "./MCPDialog";
import { ModelSelector } from "./ModelSelector";
import { mcpApi } from "../lib/api";

export function ChatArea() {
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
  const toolCallStates = useChatStore((s) => s.toolCallStates);
  const executeAction = useChatStore((s) => s.executeAction);

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
  const mcpIsConnecting = useMCPStore((s) => s.isConnecting);
  const mcpEnabledServerIds = useMCPStore((s) => s.enabledServerIds);
  const toggleMCPServer = useMCPStore((s) => s.toggleServer);
  const openMCPDetailDialog = useMCPStore((s) => s.openDetailDialog);

  // 对话框状态
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState<string | undefined>();
  const [selectedPromptContent, setSelectedPromptContent] = useState<string | undefined>();

  // 功能开关
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

  // 从 MCP 服务获取可用的 prompts
  const availablePrompts = useMemo<PromptItem[]>(() => {
    const prompts: PromptItem[] = [];
    for (const source of mcpSources) {
      for (const server of source.servers) {
        const state = mcpServerStates[server.id];
        if (state?.prompts) {
          for (const prompt of state.prompts) {
            prompts.push({
              serverId: server.id,
              serverName: server.name,
              name: prompt.name,
              description: prompt.description,
            });
          }
        }
      }
    }
    return prompts;
  }, [mcpSources, mcpServerStates]);

  // 处理 prompt 选择
  const handlePromptSelect = useCallback(async (prompt: PromptItem | null) => {
    if (!prompt) {
      setSelectedPrompt(undefined);
      setSelectedPromptContent(undefined);
      return;
    }

    const promptId = `${prompt.serverId}:${prompt.name}`;
    setSelectedPrompt(promptId);

    // 获取 prompt 内容
    try {
      const result = await mcpApi.getPrompt(prompt.serverId, prompt.name);
      if (result.messages && result.messages.length > 0) {
        const content = result.messages[0].content;
        if (typeof content === "string") {
          setSelectedPromptContent(content);
        } else if (content && typeof content === "object" && "text" in content) {
          setSelectedPromptContent((content as { text: string }).text);
        }
      }
    } catch (error) {
      console.error("Failed to get prompt content:", error);
    }
  }, []);

  const handleModelSelect = useCallback(
    (modelId: string) => {
      setCurrentModel(modelId);
    },
    [setCurrentModel]
  );

  const handleClearChat = useCallback(() => {
    // TODO: 实现清空当前对话
    if (confirm("确定要清空当前对话吗？")) {
      console.log("Clear chat");
    }
  }, []);

  const handleSend = () => {
    if (input.trim() && !isGenerating) {
      sendMessage(input, selectedPromptContent);
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
            openMCPDetailDialog(serverId);
            setMcpDialogOpen(true);
          }}
          onSettingsClick={() => setMcpDialogOpen(true)}
          onAddServer={() => setMcpDialogOpen(true)}
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
            选择模型
          </TooltipContent>
        </Tooltip>

        {/* 系统提示 */}
        <PromptPanel
          prompts={availablePrompts}
          selectedPrompt={selectedPrompt}
          onSelect={handlePromptSelect}
        />

        {/* 联网搜索 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={webSearchEnabled ? "secondary" : "ghost"}
              size="sm"
              className={cn(toolbarButtonClass, webSearchEnabled && "bg-secondary text-foreground")}
              onClick={() => setWebSearchEnabled(!webSearchEnabled)}
            >
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">联网搜索</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            联网搜索
          </TooltipContent>
        </Tooltip>

        {/* Markdown 渲染 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant={enableMarkdown ? "secondary" : "ghost"}
              size="sm"
              className={cn(toolbarButtonClass, enableMarkdown && "bg-secondary text-foreground")}
              onClick={() => setEnableMarkdown(!enableMarkdown)}
            >
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">{enableMarkdown ? "Markdown" : "纯文本"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {enableMarkdown ? "Markdown 渲染" : "纯文本"}
          </TooltipContent>
        </Tooltip>

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
                <span className="hidden sm:inline">清空</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              清空对话
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
      placeholder={selectedPromptContent ? "已启用系统提示..." : "输入消息，或使用 @tool 调用 MCP 工具..."}
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
              欢迎使用 LeoChat
            </h1>
            <p className="mt-3 text-muted-foreground">
              开始对话，或使用 MCP 工具与您的环境交互
            </p>
          </div>

          {/* 输入框 */}
          <div className="w-full">{inputElement}</div>

          {/* 快捷提示 */}
          <div className="flex flex-wrap justify-center gap-2">
            {[
              "帮我写一段代码",
              "解释这个概念",
              "翻译成英文",
              "总结这篇文章",
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
        <MCPDialog open={mcpDialogOpen} onOpenChange={setMcpDialogOpen} />
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
              renderContent={(content) => {
                const isStreamingMsg = isGenerating && index === messages.length - 1 && message.role === "assistant";
                const { actions: parsedActions, cleanContent: contentWithoutActions } = parseActionTags(content);
                const { cards, columns, cleanContent } = parseCardTags(contentWithoutActions);
                return (
                  <div className="space-y-4">
                    {cleanContent && (
                      <StreamingContent
                        content={cleanContent}
                        isStreaming={isStreamingMsg}
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
      <MCPDialog open={mcpDialogOpen} onOpenChange={setMcpDialogOpen} />
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
