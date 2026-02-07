import * as React from "react";
import { Copy, Check, FileText, FileCode } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export interface MessageActionsProps {
  content: string;
  enableMarkdown?: boolean;
  onMarkdownToggle?: () => void;
  className?: string;
}

const MessageActions = React.forwardRef<HTMLDivElement, MessageActionsProps>(
  ({ content, enableMarkdown, onMarkdownToggle, className }, ref) => {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = React.useCallback(async () => {
      try {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    }, [content]);

    return (
      <div
        ref={ref}
        className={cn(
          "sticky top-0 z-10 flex items-center gap-1 pb-2 -mt-1",
          "bg-gradient-to-b from-muted via-muted to-transparent",
          className
        )}
      >
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onMarkdownToggle}
          title={enableMarkdown ? "切换为纯文本" : "切换为 Markdown"}
        >
          {enableMarkdown ? (
            <FileCode className="h-3.5 w-3.5 mr-1" />
          ) : (
            <FileText className="h-3.5 w-3.5 mr-1" />
          )}
          {enableMarkdown ? "MD" : "文本"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={handleCopy}
          title="复制内容"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 mr-1 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 mr-1" />
          )}
          {copied ? "已复制" : "复制"}
        </Button>
      </div>
    );
  }
);
MessageActions.displayName = "MessageActions";

export { MessageActions };
