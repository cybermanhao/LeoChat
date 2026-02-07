import * as React from "react";
import { ChevronRight, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import { ToolCallBlock, type ToolCallStatus } from "./tool-call-block";
import type { DisplayMessage, ToolCall, MessageContentItem } from "@ai-chatbox/shared";

/**
 * 工具调用状态
 */
export interface ToolCallState {
  id: string;
  name: string;
  status: ToolCallStatus;
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  duration?: number;
}

export interface ChatMessageProps {
  message: DisplayMessage;
  isStreaming?: boolean;
  toolCallStates?: ToolCallState[];
  /** 自定义渲染文本内容（每个 text contentItem 调用一次） */
  renderContent?: (content: string) => React.ReactNode;
  /** 在内容区顶部显示的操作按钮 */
  actions?: React.ReactNode;
  /** @deprecated 使用 renderContent 代替 */
  children?: React.ReactNode;
}

const ChatMessage = React.forwardRef<HTMLDivElement, ChatMessageProps>(
  ({ message, isStreaming, toolCallStates, renderContent, actions, children }, ref) => {
    const [reasoningExpanded, setReasoningExpanded] = React.useState(false);

    const isUser = message.role === "user";
    const isAssistant = message.role === "assistant";
    const isToolResult = message.role === "tool";

    // 工具结果消息不单独显示
    if (isToolResult) {
      return null;
    }

    const reasoningContent = message.reasoning_content;
    const hasReasoning = Boolean(reasoningContent);

    // 判断是否有文本内容（任意 text item）
    const hasTextContent = message.contentItems.some(
      item => item.type === 'text' && Boolean(item.content as string)
    );
    // 判断是否有工具调用
    const hasToolCalls = message.contentItems.some(item => item.type === 'tool-call');

    // streaming cursor 只在最后一项是文本时显示
    const lastItem = message.contentItems[message.contentItems.length - 1];
    const showStreamingCursor = isStreaming && (!lastItem || lastItem.type === 'text');

    // 判断思考是否完成：有内容输出或不再 streaming
    const isThinkingComplete = hasReasoning && (hasTextContent || !isStreaming);

    // 渲染单个 contentItem
    const renderItem = (item: MessageContentItem) => {
      if (item.type === 'text') {
        const content = item.content as string;
        if (!content) return null;

        if (renderContent) {
          return (
            <div key={item.id} className="px-4 py-2">
              {renderContent(content)}
            </div>
          );
        }
        // fallback: 使用 children（兼容旧版）或纯文本
        if (children) {
          return (
            <div key={item.id} className="px-4 py-2">
              {children}
            </div>
          );
        }
        return (
          <div key={item.id} className="px-4 py-2">
            <div className="prose prose-sm dark:prose-invert max-w-none">
              {content}
            </div>
          </div>
        );
      }

      if (item.type === 'tool-call') {
        const toolCall = item.content as ToolCall;
        const state = toolCallStates?.find((s) => s.id === toolCall.id);
        return (
          <div key={item.id} className="px-2 py-1">
            <ToolCallBlock
              id={toolCall.id}
              name={toolCall.name || 'unknown'}
              status={state?.status || "pending"}
              arguments={toolCall.arguments}
              result={state?.result}
              error={state?.error}
              duration={state?.duration}
            />
          </div>
        );
      }

      return null;
    };

    const hasContent = hasTextContent || hasToolCalls || hasReasoning;

    return (
      <div
        ref={ref}
        className={cn(
          "group flex gap-3 py-4",
          isUser && "flex-row-reverse"
        )}
        data-message-id={message.id}
      >
        {/* 头像 */}
        <Avatar className="h-8 w-8 shrink-0">
          {isUser ? (
            <>
              <AvatarImage src="/user-avatar.png" alt="User" />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                U
              </AvatarFallback>
            </>
          ) : (
            <>
              <AvatarImage src="/ai-avatar.png" alt="AI" />
              <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                AI
              </AvatarFallback>
            </>
          )}
        </Avatar>

        {/* 消息内容区 */}
        <div
          className={cn(
            "flex max-w-[80%] flex-col gap-2",
            isUser && "items-end"
          )}
        >
          {/* 统一气泡容器 */}
          <div
            className={cn(
              "rounded-lg overflow-hidden",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
              showStreamingCursor && isAssistant && "streaming-cursor"
            )}
          >
            {/* Reasoning 折叠区域 - 在内容之前 */}
            {hasReasoning && (
              <div className="px-4 pt-2 pb-0">
                <div className="-mx-2">
                  <button
                    onClick={() => setReasoningExpanded(!reasoningExpanded)}
                    className="flex items-center gap-1.5 w-full px-2 py-1 rounded hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                  >
                    <ChevronRight
                      className={cn(
                        "h-3 w-3 transition-transform",
                        reasoningExpanded && "rotate-90"
                      )}
                    />
                    <span className="text-xs opacity-60">思考过程</span>
                    <span className="flex-1" />
                    {isThinkingComplete ? (
                      <span className="text-[10px] opacity-50">思考完成</span>
                    ) : (
                      <Loader2 className="h-3 w-3 animate-spin opacity-50" />
                    )}
                  </button>
                  {reasoningExpanded && (
                    <div className="mt-1 px-2 py-2 text-xs opacity-70 whitespace-pre-wrap bg-black/5 dark:bg-white/5 rounded">
                      {reasoningContent}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            {actions && isAssistant && (
              <div className="px-4 pt-2 pb-0">
                {actions}
              </div>
            )}

            {/* 按 contentItems 顺序逐项渲染 */}
            {message.contentItems.map(renderItem)}

            {/* 如果没有任何内容但 streaming，显示占位 */}
            {!hasContent && isStreaming && (
              <div className="px-4 py-2">
                <span className="inline-block w-2 h-4 bg-current/30 animate-pulse" />
              </div>
            )}
          </div>

          {/* Token 信息 - 在气泡外部 */}
          {message.metadata?.tokens && (
            <span className="text-xs text-muted-foreground">
              {message.metadata.tokens.output} tokens
            </span>
          )}
        </div>
      </div>
    );
  }
);
ChatMessage.displayName = "ChatMessage";

export { ChatMessage };
