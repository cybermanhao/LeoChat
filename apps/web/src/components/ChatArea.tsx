import { useEffect, useRef, useState, useCallback } from "react";
import {
  ChatInput,
  ScrollArea,
  ChatMessage as ChatMessageComponent,
  ChatToolbar,
} from "@ai-chatbox/ui";
import { useChatStore } from "../stores/chat";
import { MessageContent } from "./MessageContent";
import { MCPDialog } from "./MCPDialog";
import { ModelSelector } from "./ModelSelector";

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

  // 直接计算 messages，确保响应式更新
  const messages = conversations.find((c) => c.id === currentConversationId)?.messages || [];

  // 对话框状态
  const [mcpDialogOpen, setMcpDialogOpen] = useState(false);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  // MCP 服务器数量（TODO: 从实际状态获取）
  const [mcpServerCount] = useState(0);

  // 功能开关
  const [webSearchEnabled, setWebSearchEnabled] = useState(false);

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

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (input.trim() && !isGenerating) {
      sendMessage(input);
    }
  };

  const inputElement = (
    <ChatInput
      value={input}
      onChange={setInput}
      onSend={handleSend}
      onCancel={cancelGeneration}
      isLoading={isGenerating}
      placeholder="输入消息，或使用 @tool 调用 MCP 工具..."
      toolbar={
        <ChatToolbar
          onMCPClick={() => setMcpDialogOpen(true)}
          onModelClick={() => setModelSelectorOpen(true)}
          onWebSearchClick={() => setWebSearchEnabled(!webSearchEnabled)}
          onMarkdownClick={() => setEnableMarkdown(!enableMarkdown)}
          onClearClick={messages.length > 0 ? handleClearChat : undefined}
          mcpServerCount={mcpServerCount}
          currentModel={currentModel.includes("/") ? currentModel.split("/").pop() : currentModel}
          currentProvider={currentProvider}
          webSearchEnabled={webSearchEnabled}
          markdownEnabled={enableMarkdown}
        />
      }
    />
  );

  // 空状态：居中显示欢迎信息和输入框
  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-4">
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

  // 有消息：传统布局
  return (
    <div className="flex flex-1 flex-col">
      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
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
            >
              <MessageContent
                message={message}
                isStreaming={
                  isGenerating &&
                  index === messages.length - 1 &&
                  message.role === "assistant"
                }
                enableMarkdown={enableMarkdown}
              />
            </ChatMessageComponent>
          ))}
        </div>
      </ScrollArea>

      {/* Input Area - 固定在底部 */}
      <div className="border-t p-4">
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
