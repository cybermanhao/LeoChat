import * as React from "react";
import { Settings, ChevronDown, ChevronRight, Plus, Loader2, Server } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Switch } from "./switch";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import type { MCPSource, MCPServerState } from "@ai-chatbox/shared";

export interface MCPQuickPanelProps {
  sources: MCPSource[];
  serverStates: Record<string, MCPServerState>;
  isConnecting: Record<string, boolean>;
  onToggleServer: (serverId: string) => void;
  onServerClick: (serverId: string) => void;
  onSettingsClick: () => void;
  onAddServer: () => void;
  mcpServerCount?: number;
  trigger?: React.ReactNode;
}

export function MCPQuickPanel({
  sources,
  serverStates,
  isConnecting,
  onToggleServer,
  onServerClick,
  onSettingsClick,
  onAddServer,
  mcpServerCount = 0,
  trigger,
}: MCPQuickPanelProps) {
  const [open, setOpen] = React.useState(false);
  const [expandedSources, setExpandedSources] = React.useState<string[]>(["builtin", "custom"]);

  const toggleSource = (sourceId: string) => {
    setExpandedSources((prev) =>
      prev.includes(sourceId)
        ? prev.filter((id) => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  const defaultTrigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
    >
      <Server className="h-4 w-4" />
      <span className="hidden sm:inline">MCP</span>
      {mcpServerCount > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-primary-foreground">
          {mcpServerCount}
        </span>
      )}
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {trigger || defaultTrigger}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-56 max-w-[90vw] p-0 bg-popover"
      >
        {/* Header */}
        <div className="flex items-center justify-between h-9 px-3 border-b">
          <span className="text-xs font-medium">MCP 服务</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => {
              setOpen(false);
              onSettingsClick();
            }}
          >
            <Settings className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Content */}
        <div className="max-h-60 overflow-y-auto">
          {sources.map((source) => (
            <div key={source.id} className="border-b last:border-b-0">
              {/* Source Header */}
              <button
                className="flex items-center gap-1.5 w-full h-8 px-3 hover:bg-muted/50 text-left"
                onClick={() => toggleSource(source.id)}
              >
                {expandedSources.includes(source.id) ? (
                  <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <span className="text-xs font-medium truncate">{source.name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto shrink-0">
                  {source.servers.length}
                </span>
              </button>

              {/* Server List */}
              {expandedSources.includes(source.id) && (
                <div className="pb-1">
                  {source.servers.length === 0 ? (
                    <div className="px-7 py-1.5 text-xs text-muted-foreground">
                      暂无服务
                    </div>
                  ) : (
                    source.servers.map((server) => {
                      const state = serverStates[server.id];
                      const connecting = isConnecting[server.id];
                      const connected = state?.session?.status === "connected";
                      const hasError = !!state?.error;
                      const toolCount = state?.session?.tools?.length || 0;

                      return (
                        <div
                          key={server.id}
                          className="flex items-center gap-2 h-7 px-3 hover:bg-muted/50 group"
                        >
                          {/* Status Indicator */}
                          <div
                            className={cn(
                              "w-1.5 h-1.5 rounded-full shrink-0",
                              connecting && "bg-yellow-500 animate-pulse",
                              connected && "bg-green-500",
                              hasError && "bg-red-500",
                              !connecting && !connected && !hasError && "bg-gray-400"
                            )}
                          />

                          {/* Server Name */}
                          <button
                            className="flex-1 min-w-0 text-left"
                            onClick={() => {
                              setOpen(false);
                              onServerClick(server.id);
                            }}
                          >
                            <span className="text-xs truncate block max-w-[100px]">
                              {server.name}
                            </span>
                          </button>

                          {/* Tool Count */}
                          {connected && toolCount > 0 && (
                            <span className="text-[10px] text-muted-foreground shrink-0">
                              {toolCount}
                            </span>
                          )}

                          {/* Toggle Switch */}
                          <div className="shrink-0">
                            {connecting ? (
                              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                            ) : (
                              <Switch
                                checked={connected}
                                onCheckedChange={() => onToggleServer(server.id)}
                                className="scale-75"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t">
          <button
            className="flex items-center gap-1.5 w-full h-8 px-3 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50"
            onClick={() => {
              setOpen(false);
              onAddServer();
            }}
          >
            <Plus className="h-3 w-3" />
            添加服务
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
