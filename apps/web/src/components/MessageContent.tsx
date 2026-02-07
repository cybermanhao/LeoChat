import ReactMarkdown from "react-markdown";
import {
  StreamingContent,
  CodeBlock,
  ActionButtonGroup,
  ActionCardGroup,
} from "@ai-chatbox/ui";
import { parseActionTags, parseCardTags } from "@ai-chatbox/shared";
import type { DisplayMessage, MessageContentItem, MessageContentType, ToolCall, ToolResult, UICommand, CardData, ActionButtonData } from "@ai-chatbox/shared";
import { useChatStore } from "../stores/chat";

interface MessageContentProps {
  message: DisplayMessage;
  isStreaming?: boolean;
  /** 是否启用 Markdown 渲染 */
  enableMarkdown?: boolean;
}

/**
 * 消息内容渲染器
 *
 * - 根据 bubbleContent 中的内容项类型渲染不同类型的内容
 * - 支持文本、工具调用、工具结果、UI命令、卡片、动作按钮等
 */
export function MessageContent({ message, isStreaming = false, enableMarkdown = true }: MessageContentProps) {
  const { executeAction } = useChatStore();

  const handleAction = (actionName: string, attributes: Record<string, string>) => {
    executeAction(actionName, attributes);
  };

  // 渲染单个内容项
  const renderItem = (item: MessageContentItem, index: number) => {
    switch (item.type) {
      case 'text':
        if (typeof item.content === 'string') {
          // 解析 action 标签
          const { actions, cleanContent: contentWithoutActions } = parseActionTags(item.content);
          // 解析 card 标签
          const { cards, columns, cleanContent } = parseCardTags(contentWithoutActions);

          return (
            <div key={item.id} className="space-y-4">
              {/* 主要内容 - 支持完整的 Markdown 和特殊渲染 */}
              {cleanContent && (
                <StreamingContent
                  content={cleanContent}
                  isStreaming={isStreaming}
                  enableMarkdown={enableMarkdown}
                  renderCodeBlock={(code, language) => (
                    <CodeBlock code={code} language={language} showLineNumbers />
                  )}
                />
              )}

              {/* 卡片组 */}
              {cards.length > 0 && (
                <ActionCardGroup
                  cards={cards}
                  columns={columns as 1 | 2 | 3}
                  isStreaming={isStreaming}
                />
              )}

              {/* Action 按钮 */}
              {actions.length > 0 && (
                <ActionButtonGroup
                  actions={actions.map((a) => ({
                    name: a.name,
                    label: a.attributes.label,
                    attributes: a.attributes,
                  }))}
                  isStreaming={isStreaming}
                  onAction={handleAction}
                />
              )}
            </div>
          );
        }
        return null;

      case 'tool-call':
        // 渲染工具调用
        const toolCall = item.content as ToolCall;
        return (
          <div key={item.id} className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
            <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
              🛠️ 调用工具: {toolCall.name}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              参数: {JSON.stringify(toolCall.arguments)}
            </div>
          </div>
        );

      case 'tool-result':
        // 渲染工具结果
        const toolResult = item.content as ToolResult;
        return (
          <div key={item.id} className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded border border-green-200 dark:border-green-800">
            <div className="text-sm font-medium text-green-700 dark:text-green-300">
              ✅ 工具结果: {toolResult.toolCallId}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {JSON.stringify(toolResult.result, null, 2)}
            </div>
          </div>
        );

      case 'ui-command':
        // 渲染 UI 命令
        const uiCommand = item.content as UICommand;
        return (
          <div key={item.id} className="mt-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded border border-purple-200 dark:border-purple-800">
            <div className="text-sm font-medium text-purple-700 dark:text-purple-300">
              🎛️ UI 命令: {uiCommand.command}
            </div>
            <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
              {JSON.stringify(uiCommand.payload, null, 2)}
            </div>
          </div>
        );

      case 'card':
        // 渲染卡片
        const cardData = item.content as CardData;
        return (
          <div key={item.id} className="mt-2">
            <ActionCardGroup
              cards={[cardData]}
              columns={1}
              isStreaming={isStreaming}
            />
          </div>
        );

      case 'action-button':
        // 渲染动作按钮
        const actionData = item.content as ActionButtonData;
        return (
          <div key={item.id} className="mt-2">
            <ActionButtonGroup
              actions={[actionData]}
              isStreaming={isStreaming}
              onAction={handleAction}
            />
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-2">
      {message.contentItems.map((item, index) => renderItem(item, index))}

      {/* 渲染 reasoning_content（如果存在） */}
      {message.reasoning_content && (
        <div className="mt-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-800">
          <div className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
            💭 思考过程
          </div>
          <div className="text-sm text-gray-700 dark:text-gray-300 mt-1">
            {message.reasoning_content}
          </div>
        </div>
      )}
    </div>
  );
}


/**
 * 简单 Markdown 渲染器（用于非流式内容）
 */
export function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      className="prose prose-sm dark:prose-invert max-w-none"
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const code = String(children).replace(/\n$/, "");

          if (match) {
            return (
              <CodeBlock
                code={code}
                language={match[1]}
                showLineNumbers
              />
            );
          }

          return (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/**
 * 兼容旧接口
 * @deprecated 请使用新的 MessageContent 组件，传入完整的 message 对象
 */
export function LegacyMessageContent({
  content,
  isStreaming = false,
}: {
  content: string;
  isStreaming?: boolean;
}) {
  return (
    <MessageContent
      message={{
        id: "legacy",
        role: "assistant",
        content,
        timestamp: Date.now(),
      }}
      isStreaming={isStreaming}
    />
  );
}
