import * as React from "react";
import { MessageSquareText, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";

export interface PromptItem {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
}

export interface PromptPanelProps {
  prompts: PromptItem[];
  selectedPrompt?: string;
  onSelect: (prompt: PromptItem | null) => void;
  trigger?: React.ReactNode;
  className?: string;
}

const PromptPanel = React.forwardRef<HTMLDivElement, PromptPanelProps>(
  ({ prompts, selectedPrompt, onSelect, trigger, className }, ref) => {
    const [open, setOpen] = React.useState(false);

    const currentPromptName = selectedPrompt
      ? prompts.find(p => `${p.serverId}:${p.name}` === selectedPrompt)?.name
      : undefined;

    const defaultTrigger = (
      <Button
        type="button"
        variant={selectedPrompt ? "secondary" : "ghost"}
        size="sm"
        className={cn(
          "h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground",
          selectedPrompt && "bg-secondary text-foreground"
        )}
      >
        <MessageSquareText className="h-4 w-4" />
        <span className="hidden sm:inline">
          {currentPromptName || "系统提示"}
        </span>
      </Button>
    );

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {trigger || defaultTrigger}
        </PopoverTrigger>
        <PopoverContent
          ref={ref}
          side="top"
          align="start"
          sideOffset={8}
          className={cn("w-72 p-0 bg-popover border shadow-lg", className)}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b bg-popover">
            <MessageSquareText className="h-4 w-4" />
            <span className="text-sm font-medium">系统提示词</span>
          </div>

          {/* Content */}
          <div className="max-h-60 overflow-y-auto bg-popover">
            {/* No prompt option */}
            <button
              className={cn(
                "w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left",
                "hover:bg-muted transition-colors bg-popover",
                !selectedPrompt && "bg-muted"
              )}
              onClick={() => {
                onSelect(null);
                setOpen(false);
              }}
            >
              <div className="w-4 h-4 flex items-center justify-center shrink-0">
                {!selectedPrompt && <Check className="h-3 w-3" />}
              </div>
              <div>
                <div className="font-medium">无</div>
                <div className="text-xs text-muted-foreground">不使用系统提示</div>
              </div>
            </button>

            {prompts.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4 px-4 bg-popover">
                暂无可用的提示词，请先连接 MCP 服务
              </div>
            ) : (
              prompts.map((prompt) => {
                const promptId = `${prompt.serverId}:${prompt.name}`;
                const isSelected = selectedPrompt === promptId;

                return (
                  <button
                    key={promptId}
                    className={cn(
                      "w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left",
                      "hover:bg-muted transition-colors bg-popover",
                      isSelected && "bg-muted"
                    )}
                    onClick={() => {
                      onSelect(prompt);
                      setOpen(false);
                    }}
                  >
                    <div className="w-4 h-4 flex items-center justify-center shrink-0">
                      {isSelected && <Check className="h-3 w-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{prompt.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {prompt.serverName}
                        {prompt.description && ` · ${prompt.description}`}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }
);
PromptPanel.displayName = "PromptPanel";

export { PromptPanel };
