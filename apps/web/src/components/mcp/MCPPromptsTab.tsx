import { useState, useMemo } from "react";
import { cn } from "@ai-chatbox/ui";
import { MessageSquare, Server } from "lucide-react";
import { t } from "../../i18n";
import { useMCPStore } from "../../stores/mcp";

interface PromptWithServer {
  prompt: { name: string; description?: string; arguments?: Array<{ name: string; description?: string; required?: boolean }> };
  serverId: string;
  serverName: string;
}

export function MCPPromptsTab() {
  const sources = useMCPStore((s) => s.sources);
  const serverStates = useMCPStore((s) => s.serverStates);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptWithServer | null>(null);

  const allServers = sources.flatMap((source) => source.servers);

  const promptsWithServer = useMemo(() => {
    const result: PromptWithServer[] = [];
    for (const server of allServers) {
      const state = serverStates[server.id];
      if (state?.prompts) {
        for (const prompt of state.prompts) {
          result.push({
            prompt,
            serverId: server.id,
            serverName: server.name,
          });
        }
      }
    }
    return result;
  }, [allServers, serverStates]);

  if (promptsWithServer.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
        <p className="text-xs">{t("mcp.promptsDetail.empty")}</p>
        <p className="text-[10px] mt-1">{t("mcp.promptsDetail.emptyDescription")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* 左侧列表 */}
      <div className="w-56 shrink-0 border-r flex flex-col min-h-0">
        <div className="p-2 border-b">
          <span className="text-[10px] text-muted-foreground">{t("mcp.promptsDetail.totalCount", { count: promptsWithServer.length })}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {promptsWithServer.map((item, i) => {
            const isSelected = selectedPrompt === item;
            return (
              <div
                key={`${item.serverId}-${item.prompt.name}-${i}`}
                className={cn(
                  "px-3 py-1.5 cursor-pointer border-b border-transparent",
                  isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                )}
                onClick={() => setSelectedPrompt(item)}
              >
                <div className="flex items-center gap-1.5">
                  <MessageSquare className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="text-xs font-medium truncate">{item.prompt.name}</span>
                </div>
                <div className="flex items-center gap-1 mt-0.5 ml-4.5">
                  <Server className="h-2.5 w-2.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground truncate">{item.serverName}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 右侧详情 */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedPrompt ? (
          <div className="p-3 space-y-3">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{selectedPrompt.prompt.name}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Server className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">{selectedPrompt.serverName}</span>
              </div>
            </div>

            {selectedPrompt.prompt.description && (
              <div>
                <div className="text-[11px] font-medium text-muted-foreground mb-1">{t("mcp.promptsDetail.description")}</div>
                <p className="text-xs leading-relaxed">{selectedPrompt.prompt.description}</p>
              </div>
            )}

            {selectedPrompt.prompt.arguments && selectedPrompt.prompt.arguments.length > 0 && (
              <div>
                <div className="text-[11px] font-medium text-muted-foreground mb-1">{t("mcp.promptsDetail.arguments")}</div>
                <div className="space-y-1.5">
                  {selectedPrompt.prompt.arguments.map((arg) => (
                    <div key={arg.name} className="rounded bg-muted p-2">
                      <div className="flex items-center gap-1.5">
                        <code className="text-xs font-medium">{arg.name}</code>
                        {arg.required && (
                          <span className="text-[10px] px-1 py-0.5 rounded bg-red-500/10 text-red-600">{t("mcp.promptsDetail.required")}</span>
                        )}
                      </div>
                      {arg.description && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{arg.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-xs">{t("mcp.promptsDetail.selectToView")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
