import * as React from "react";
import {
  Server,
  Settings,
  Sparkles,
  Trash2,
  History,
  ImageIcon,
  Code2,
  Globe,
  FileText,
  MessageSquareText,
} from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";

export interface ToolbarAction {
  id: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  badge?: string | number;
}

export interface ChatToolbarProps {
  actions?: ToolbarAction[];
  onMCPClick?: () => void;
  onModelClick?: () => void;
  onProviderClick?: () => void;
  onSettingsClick?: () => void;
  onClearClick?: () => void;
  onHistoryClick?: () => void;
  onWebSearchClick?: () => void;
  onImageGenClick?: () => void;
  onCodeClick?: () => void;
  onMarkdownClick?: () => void;
  onPromptClick?: () => void;
  mcpServerCount?: number;
  currentModel?: string;
  currentProvider?: string;
  currentPrompt?: string;
  webSearchEnabled?: boolean;
  imageGenEnabled?: boolean;
  codeEnabled?: boolean;
  markdownEnabled?: boolean;
  className?: string;
}

const ChatToolbar = React.forwardRef<HTMLDivElement, ChatToolbarProps>(
  (
    {
      actions,
      onMCPClick,
      onModelClick,
      onProviderClick,
      onSettingsClick,
      onClearClick,
      onHistoryClick,
      onWebSearchClick,
      onImageGenClick,
      onCodeClick,
      onMarkdownClick,
      onPromptClick,
      mcpServerCount = 0,
      currentModel,
      currentProvider,
      currentPrompt,
      webSearchEnabled = false,
      imageGenEnabled = false,
      codeEnabled = false,
      markdownEnabled = true,
      className,
    },
    ref
  ) => {
    // 默认按钮配置
    const defaultActions: ToolbarAction[] = [
      ...(onMCPClick
        ? [
            {
              id: "mcp",
              icon: <Server className="h-4 w-4" />,
              label: `MCP 服务${mcpServerCount > 0 ? ` (${mcpServerCount})` : ""}`,
              onClick: onMCPClick,
              badge: mcpServerCount > 0 ? mcpServerCount : undefined,
            },
          ]
        : []),
      ...(onModelClick
        ? [
            {
              id: "model",
              icon: <Sparkles className="h-4 w-4" />,
              label: currentProvider
                ? `${currentProvider}/${currentModel || "模型"}`
                : (currentModel || "选择模型"),
              onClick: onProviderClick || onModelClick,
            },
          ]
        : []),
      ...(onPromptClick
        ? [
            {
              id: "prompt",
              icon: <MessageSquareText className="h-4 w-4" />,
              label: currentPrompt || "系统提示",
              onClick: onPromptClick,
              active: !!currentPrompt,
            },
          ]
        : []),
      ...(onWebSearchClick
        ? [
            {
              id: "web-search",
              icon: <Globe className="h-4 w-4" />,
              label: "联网搜索",
              onClick: onWebSearchClick,
              active: webSearchEnabled,
            },
          ]
        : []),
      ...(onImageGenClick
        ? [
            {
              id: "image-gen",
              icon: <ImageIcon className="h-4 w-4" />,
              label: "图片生成",
              onClick: onImageGenClick,
              active: imageGenEnabled,
            },
          ]
        : []),
      ...(onCodeClick
        ? [
            {
              id: "code",
              icon: <Code2 className="h-4 w-4" />,
              label: "代码执行",
              onClick: onCodeClick,
              active: codeEnabled,
            },
          ]
        : []),
      ...(onMarkdownClick
        ? [
            {
              id: "markdown",
              icon: <FileText className="h-4 w-4" />,
              label: markdownEnabled ? "Markdown 渲染" : "纯文本",
              onClick: onMarkdownClick,
              active: markdownEnabled,
            },
          ]
        : []),
      ...(onHistoryClick
        ? [
            {
              id: "history",
              icon: <History className="h-4 w-4" />,
              label: "历史记录",
              onClick: onHistoryClick,
            },
          ]
        : []),
      ...(onClearClick
        ? [
            {
              id: "clear",
              icon: <Trash2 className="h-4 w-4" />,
              label: "清空对话",
              onClick: onClearClick,
            },
          ]
        : []),
      ...(onSettingsClick
        ? [
            {
              id: "settings",
              icon: <Settings className="h-4 w-4" />,
              label: "设置",
              onClick: onSettingsClick,
            },
          ]
        : []),
    ];

    const allActions = actions || defaultActions;

    if (allActions.length === 0) {
      return null;
    }

    return (
      <TooltipProvider delayDuration={300}>
        <div
          ref={ref}
          className={cn(
            "flex items-center gap-1 flex-wrap py-1",
            className
          )}
        >
          {allActions.map((action) => (
            <Tooltip key={action.id}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={action.active ? "secondary" : "ghost"}
                  size="sm"
                  className={cn(
                    "h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground",
                    action.active && "bg-secondary text-foreground"
                  )}
                  onClick={action.onClick}
                  disabled={action.disabled}
                >
                  {action.icon}
                  <span className="hidden sm:inline">{action.label}</span>
                  {action.badge !== undefined && (
                    <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
                      {action.badge}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {action.label}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    );
  }
);
ChatToolbar.displayName = "ChatToolbar";

export { ChatToolbar };
