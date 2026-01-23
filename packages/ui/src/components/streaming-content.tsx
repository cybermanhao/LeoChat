import * as React from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { cn } from "../lib/utils";
import { CodeBlockSkeleton, MermaidSkeleton, TableSkeleton } from "./skeleton";

/**
 * 自定义 Markdown 组件 - 链接使用高对比度样式
 */
const markdownComponents: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-link hover:text-link-hover active:text-link-active visited:opacity-80 underline underline-offset-2 font-medium transition-colors"
    >
      {children}
    </a>
  ),
  // 内联代码样式
  code: ({ className, children, ...props }) => {
    // 如果有 language class，说明是代码块内的 code，不处理
    if (className?.includes("language-")) {
      return <code className={className} {...props}>{children}</code>;
    }
    // 内联代码
    return (
      <code
        className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono"
        {...props}
      >
        {children}
      </code>
    );
  },
  // 段落不要添加多余的 margin
  p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
  // 列表样式
  ul: ({ children }) => <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>,
  // 引用样式
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  // 粗体
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
};

export interface StreamingContentProps {
  content: string;
  isStreaming: boolean;
  className?: string;
  /** 是否启用 Markdown 渲染，默认 true */
  enableMarkdown?: boolean;
  onCodeBlockComplete?: (code: string, language: string) => void;
  renderCodeBlock?: (code: string, language: string) => React.ReactNode;
  renderMermaid?: (code: string) => React.ReactNode;
  renderTable?: (html: string) => React.ReactNode;
}

interface ParsedBlock {
  type: "text" | "code" | "mermaid" | "table";
  content: string;
  language?: string;
  isComplete: boolean;
}

function parseContent(content: string, isStreaming: boolean): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  let remaining = content;

  // Regex patterns
  const codeBlockPattern = /```(\w+)?\n?([\s\S]*?)(?:```|$)/g;
  const tablePattern = /<table[\s\S]*?(?:<\/table>|$)/gi;

  let lastIndex = 0;
  let match;

  // Find code blocks
  while ((match = codeBlockPattern.exec(remaining)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      const textBefore = remaining.slice(lastIndex, match.index);
      if (textBefore.trim()) {
        blocks.push({
          type: "text",
          content: textBefore,
          isComplete: true,
        });
      }
    }

    const language = match[1] || "plaintext";
    const code = match[2];
    const isComplete = match[0].endsWith("```");

    if (language === "mermaid") {
      blocks.push({
        type: "mermaid",
        content: code,
        isComplete: isComplete || !isStreaming,
      });
    } else {
      blocks.push({
        type: "code",
        content: code,
        language,
        isComplete: isComplete || !isStreaming,
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < remaining.length) {
    const remainingText = remaining.slice(lastIndex);

    // Check for incomplete table
    const tableMatch = tablePattern.exec(remainingText);
    if (tableMatch) {
      const beforeTable = remainingText.slice(0, tableMatch.index);
      if (beforeTable.trim()) {
        blocks.push({
          type: "text",
          content: beforeTable,
          isComplete: true,
        });
      }

      const isTableComplete = tableMatch[0].includes("</table>");
      blocks.push({
        type: "table",
        content: tableMatch[0],
        isComplete: isTableComplete || !isStreaming,
      });

      const afterTable = remainingText.slice(
        tableMatch.index + tableMatch[0].length
      );
      if (afterTable.trim()) {
        blocks.push({
          type: "text",
          content: afterTable,
          isComplete: true,
        });
      }
    } else if (remainingText.trim()) {
      blocks.push({
        type: "text",
        content: remainingText,
        isComplete: true,
      });
    }
  }

  return blocks;
}

const StreamingContent = React.forwardRef<HTMLDivElement, StreamingContentProps>(
  (
    {
      content,
      isStreaming,
      className,
      enableMarkdown = true,
      renderCodeBlock,
      renderMermaid,
      renderTable,
    },
    ref
  ) => {
    const blocks = React.useMemo(
      () => parseContent(content, isStreaming),
      [content, isStreaming]
    );

    return (
      <div ref={ref} className={cn("space-y-4", className)}>
        {blocks.map((block, index) => {
          const key = `${block.type}-${index}`;

          switch (block.type) {
            case "text":
              return (
                <div
                  key={key}
                  className={cn(
                    "prose prose-sm dark:prose-invert max-w-none",
                    !enableMarkdown && "whitespace-pre-wrap",
                    isStreaming &&
                      index === blocks.length - 1 &&
                      "streaming-cursor"
                  )}
                >
                  {enableMarkdown ? (
                    <ReactMarkdown components={markdownComponents}>
                      {block.content}
                    </ReactMarkdown>
                  ) : (
                    block.content
                  )}
                </div>
              );

            case "code":
              if (!block.isComplete) {
                return (
                  <CodeBlockSkeleton key={key} language={block.language} />
                );
              }
              return renderCodeBlock ? (
                <React.Fragment key={key}>
                  {renderCodeBlock(block.content, block.language || "plaintext")}
                </React.Fragment>
              ) : (
                <pre
                  key={key}
                  className="rounded-lg border bg-muted p-4 overflow-x-auto"
                >
                  <code className={`language-${block.language}`}>
                    {block.content}
                  </code>
                </pre>
              );

            case "mermaid":
              if (!block.isComplete) {
                return <MermaidSkeleton key={key} />;
              }
              return renderMermaid ? (
                <React.Fragment key={key}>
                  {renderMermaid(block.content)}
                </React.Fragment>
              ) : (
                <pre
                  key={key}
                  className="rounded-lg border bg-muted p-4 overflow-x-auto"
                >
                  <code>{block.content}</code>
                </pre>
              );

            case "table":
              if (!block.isComplete) {
                return <TableSkeleton key={key} />;
              }
              return renderTable ? (
                <React.Fragment key={key}>
                  {renderTable(block.content)}
                </React.Fragment>
              ) : (
                <div
                  key={key}
                  className="overflow-x-auto"
                  dangerouslySetInnerHTML={{ __html: block.content }}
                />
              );

            default:
              return null;
          }
        })}
      </div>
    );
  }
);
StreamingContent.displayName = "StreamingContent";

export { StreamingContent };
