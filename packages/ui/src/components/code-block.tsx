import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export interface CodeBlockProps {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
  highlightLines?: number[];
  className?: string;
  onCopy?: (code: string) => void;
}

const CodeBlock = React.forwardRef<HTMLDivElement, CodeBlockProps>(
  (
    {
      code,
      language = "plaintext",
      showLineNumbers = false,
      highlightLines = [],
      className,
      onCopy,
    },
    ref
  ) => {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = async () => {
      try {
        await navigator.clipboard.writeText(code);
        setCopied(true);
        onCopy?.(code);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error("Failed to copy:", err);
      }
    };

    const lines = code.split("\n");

    return (
      <div
        ref={ref}
        className={cn(
          "group relative rounded-lg border bg-muted/50 overflow-hidden",
          className
        )}
      >
        {/* Header with language and copy button */}
        <div className="flex items-center justify-between border-b bg-muted/80 px-4 py-2">
          <span className="text-xs font-medium text-muted-foreground">
            {language}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            <span className="sr-only">Copy code</span>
          </Button>
        </div>

        {/* Code content */}
        <div className="overflow-x-auto p-4">
          <pre className="text-sm">
            <code className={`language-${language}`}>
              {showLineNumbers ? (
                <table className="border-collapse">
                  <tbody>
                    {lines.map((line, i) => {
                      const lineNumber = i + 1;
                      const isHighlighted = highlightLines.includes(lineNumber);
                      return (
                        <tr
                          key={i}
                          className={cn(
                            isHighlighted && "bg-primary/10"
                          )}
                        >
                          <td className="select-none pr-4 text-right text-muted-foreground">
                            {lineNumber}
                          </td>
                          <td className="whitespace-pre">{line}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                code
              )}
            </code>
          </pre>
        </div>
      </div>
    );
  }
);
CodeBlock.displayName = "CodeBlock";

export { CodeBlock };
