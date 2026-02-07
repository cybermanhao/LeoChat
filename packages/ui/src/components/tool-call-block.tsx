import * as React from "react";
import { cn } from "../lib/utils";
import { ChevronDown, ChevronUp, Loader2, Check, X, Wrench } from "lucide-react";
import { ActionCardGroup, type ActionCardData } from "./action-card";

export type ToolCallStatus = "pending" | "running" | "success" | "error";

/**
 * 简单解析 card 标签（避免循环依赖 shared 包）
 */
function parseCardTagsSimple(content: string): {
  cards: ActionCardData[];
  columns: number;
  hasCards: boolean;
} {
  const cards: ActionCardData[] = [];
  let columns = 2;

  // 解析 <cards columns="N"> 容器
  const cardsContainerRegex = /<cards(?:\s+columns="(\d+)")?\s*>([\s\S]*?)<\/cards>/g;
  let match;
  while ((match = cardsContainerRegex.exec(content)) !== null) {
    if (match[1]) {
      columns = Math.min(Math.max(parseInt(match[1], 10), 1), 3);
    }
    const innerContent = match[2];
    parseCardsFromContent(innerContent, cards);
  }

  // 解析独立的 <card /> 标签
  const cleanContent = content.replace(cardsContainerRegex, "");
  parseCardsFromContent(cleanContent, cards);

  return { cards, columns, hasCards: cards.length > 0 };
}

function parseCardsFromContent(content: string, cards: ActionCardData[]): void {
  const cardRegex = /<card\s+([^/>]*)\s*\/>/g;
  let match;
  while ((match = cardRegex.exec(content)) !== null) {
    const card = parseCardAttrs(match[1]);
    if (card.title || card.image) {
      cards.push(card);
    }
  }
}

function parseCardAttrs(attrsStr: string): ActionCardData {
  const card: ActionCardData = {};
  const attrRegex = /(\w+)="([^"]*)"/g;
  let match;
  while ((match = attrRegex.exec(attrsStr)) !== null) {
    const key = match[1] as keyof ActionCardData;
    if (["title", "description", "image", "link", "linkText"].includes(key)) {
      // 反转义 HTML 实体
      card[key] = match[2]
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
    }
  }
  return card;
}

export interface ToolCallBlockProps {
  id: string;
  name: string;
  status: ToolCallStatus;
  arguments?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  duration?: number;
  className?: string;
}

const statusConfig: Record<
  ToolCallStatus,
  {
    label: string;
    icon: React.ReactNode;
    containerClass: string;
    headerClass: string;
  }
> = {
  pending: {
    label: "等待中",
    icon: <Wrench className="h-4 w-4 text-muted-foreground" />,
    containerClass: "border-muted-foreground/20 bg-muted/30",
    headerClass: "text-muted-foreground",
  },
  running: {
    label: "调用中",
    icon: <Loader2 className="h-4 w-4 text-primary animate-spin" />,
    containerClass: "border-primary/30 bg-primary/5",
    headerClass: "text-primary",
  },
  success: {
    label: "完成",
    icon: <Check className="h-4 w-4 text-green-500" />,
    containerClass: "border-green-500/30 bg-green-500/5",
    headerClass: "text-green-600 dark:text-green-400",
  },
  error: {
    label: "失败",
    icon: <X className="h-4 w-4 text-destructive" />,
    containerClass: "border-destructive/30 bg-destructive/5",
    headerClass: "text-destructive",
  },
};

export function ToolCallBlock({
  name,
  status,
  arguments: args,
  result,
  error,
  duration,
  className,
}: ToolCallBlockProps) {
  const [expanded, setExpanded] = React.useState(false);
  const config = statusConfig[status];
  const hasDetails = args || result || error;

  return (
    <div
      className={cn(
        "rounded-md border transition-all duration-200",
        config.containerClass,
        className
      )}
    >
      {/* Header - 可点击展开 */}
      <div
        className={cn(
          "flex items-center gap-2 px-3 py-2",
          hasDetails && "cursor-pointer hover:bg-black/5 dark:hover:bg-white/5"
        )}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* Status Icon */}
        {config.icon}

        {/* Tool Name & Status */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <span className="font-medium text-sm truncate">{name}</span>
          <span className={cn("text-xs", config.headerClass)}>
            [{config.label}]
          </span>
          {duration !== undefined && status === "success" && (
            <span className="text-xs text-muted-foreground">
              {duration}ms
            </span>
          )}
        </div>

        {/* Expand Toggle */}
        {hasDetails && (
          <div className="flex items-center text-xs text-muted-foreground">
            <span className="mr-1">{expanded ? "收起" : "详情"}</span>
            {expanded ? (
              <ChevronUp className="h-3 w-3" />
            ) : (
              <ChevronDown className="h-3 w-3" />
            )}
          </div>
        )}
      </div>

      {/* Loading Animation */}
      {status === "running" && (
        <div className="h-0.5 bg-muted overflow-hidden">
          <div
            className="h-full bg-primary"
            style={{
              animation: "indeterminate-progress 1.5s ease-in-out infinite",
            }}
          />
        </div>
      )}

      {/* Expanded Details */}
      {expanded && hasDetails && (
        <div className="px-3 py-2 border-t border-current/10 space-y-2 text-xs">
          {/* Arguments */}
          {args && Object.keys(args).length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1 font-medium">参数:</div>
              <pre className="bg-background/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {/* Result */}
          {result !== undefined && status === "success" && (
            <ResultDisplay result={result} />
          )}

          {/* Error */}
          {error && (
            <div>
              <div className="text-destructive mb-1 font-medium">错误:</div>
              <pre className="bg-destructive/5 rounded p-2 text-destructive overflow-x-auto whitespace-pre-wrap break-all">
                {error}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 工具结果显示组件 - 自动检测并渲染卡片
 */
function ResultDisplay({ result }: { result: unknown }) {
  const resultStr = typeof result === "string" ? result : JSON.stringify(result, null, 2);
  const { cards, columns, hasCards } = parseCardTagsSimple(resultStr);

  if (hasCards) {
    return (
      <div>
        <div className="text-muted-foreground mb-1 font-medium">结果:</div>
        <ActionCardGroup cards={cards} columns={columns as 1 | 2 | 3} />
      </div>
    );
  }

  return (
    <div>
      <div className="text-muted-foreground mb-1 font-medium">结果:</div>
      <pre className="bg-background/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-40">
        {resultStr}
      </pre>
    </div>
  );
}

// CSS for indeterminate progress
const progressStyle = `
@keyframes indeterminate-progress {
  0% {
    width: 0%;
    margin-left: 0%;
  }
  50% {
    width: 30%;
    margin-left: 35%;
  }
  100% {
    width: 0%;
    margin-left: 100%;
  }
}
`;

// Inject animation styles
if (typeof document !== "undefined") {
  const id = "tool-call-block-styles";
  if (!document.getElementById(id)) {
    const styleEl = document.createElement("style");
    styleEl.id = id;
    styleEl.textContent = progressStyle;
    document.head.appendChild(styleEl);
  }
}
