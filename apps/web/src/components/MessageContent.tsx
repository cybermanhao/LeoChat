import ReactMarkdown from "react-markdown";
import {
  StreamingContent,
  CodeBlock,
  ActionButtonGroup,
} from "@ai-chatbox/ui";
import { parseActionTags } from "@ai-chatbox/shared";
import type { ChatMessage } from "@ai-chatbox/shared";
import { useChatStore } from "../stores/chat";

interface MessageContentProps {
  message: ChatMessage;
  isStreaming?: boolean;
  /** 是否启用 Markdown 渲染 */
  enableMarkdown?: boolean;
}

/**
 * 消息内容渲染器
 *
 * - content: 支持 Markdown、Mermaid、代码块、Action 按钮等特殊渲染
 * - reasoning_content: 仅作为普通文本显示，不解析特殊语法
 */
export function MessageContent({ message, isStreaming = false, enableMarkdown = true }: MessageContentProps) {
  const { executeAction } = useChatStore();
  const { content, reasoning_content } = message;

  // 只解析 content 中的 action 标签（不解析 reasoning_content）
  const { actions, cleanContent } = parseActionTags(content || "");

  const handleAction = (actionName: string, attributes: Record<string, string>) => {
    executeAction(actionName, attributes);
  };

  return (
    <div className="space-y-4">
      {/* 推理内容 - 作为普通文本显示，不解析特殊语法 */}
      {reasoning_content && (
        <ReasoningContent
          content={reasoning_content}
          isStreaming={isStreaming && !content}
        />
      )}

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

/**
 * 推理内容渲染器 - 仅显示纯文本，不解析 Mermaid、按钮等
 */
interface ReasoningContentProps {
  content: string;
  isStreaming?: boolean;
}

function ReasoningContent({ content, isStreaming = false }: ReasoningContentProps) {
  return (
    <div className="rounded-lg border border-muted bg-muted/30 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        <span>Thinking</span>
      </div>
      {/* 纯文本渲染 - 保留换行，不解析 Markdown */}
      <div
        className={`whitespace-pre-wrap text-sm text-muted-foreground ${
          isStreaming ? "streaming-cursor" : ""
        }`}
      >
        {content}
      </div>
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
