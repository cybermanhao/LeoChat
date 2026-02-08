import { useState, useMemo } from "react";
import { cn } from "@ai-chatbox/ui";
import { Wrench, Search, Server } from "lucide-react";
import { useMCPStore } from "../../stores/mcp";
import type { MCPTool } from "@ai-chatbox/shared";

interface ToolWithServer {
  tool: MCPTool;
  serverId: string;
  serverName: string;
}

export function MCPToolsTab() {
  const sources = useMCPStore((s) => s.sources);
  const serverStates = useMCPStore((s) => s.serverStates);
  const [search, setSearch] = useState("");
  const [selectedTool, setSelectedTool] = useState<ToolWithServer | null>(null);

  const allServers = sources.flatMap((source) => source.servers);

  const toolsWithServer = useMemo(() => {
    const result: ToolWithServer[] = [];
    for (const server of allServers) {
      const state = serverStates[server.id];
      if (state?.session?.status === "connected" && state.session.tools) {
        for (const tool of state.session.tools) {
          result.push({
            tool,
            serverId: server.id,
            serverName: server.name,
          });
        }
      }
    }
    return result;
  }, [allServers, serverStates]);

  const filteredTools = useMemo(() => {
    if (!search.trim()) return toolsWithServer;
    const q = search.toLowerCase();
    return toolsWithServer.filter(
      (t) =>
        t.tool.name.toLowerCase().includes(q) ||
        t.tool.description?.toLowerCase().includes(q) ||
        t.serverName.toLowerCase().includes(q)
    );
  }, [toolsWithServer, search]);

  if (toolsWithServer.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <Wrench className="h-8 w-8 mb-2 opacity-20" />
        <p className="text-xs">暂无可用工具</p>
        <p className="text-[10px] mt-1">请先连接服务器</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* 左侧工具列表 */}
      <div className="w-56 shrink-0 border-r flex flex-col min-h-0">
        {/* 搜索 */}
        <div className="p-2 border-b">
          <div className="flex items-center gap-1.5 rounded border bg-background px-2 py-1">
            <Search className="h-3 w-3 text-muted-foreground shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索工具..."
              className="flex-1 bg-transparent text-xs outline-none"
            />
          </div>
          <div className="text-[10px] text-muted-foreground mt-1 px-0.5">
            共 {filteredTools.length} 个工具
          </div>
        </div>

        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          {filteredTools.map((item) => {
            const isSelected = selectedTool?.tool.name === item.tool.name && selectedTool?.serverId === item.serverId;
            return (
              <div
                key={`${item.serverId}-${item.tool.name}`}
                className={cn(
                  "px-3 py-1.5 cursor-pointer border-b border-transparent",
                  isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                )}
                onClick={() => setSelectedTool(item)}
              >
                <div className="flex items-center gap-1.5">
                  <Wrench className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="text-xs font-medium truncate">{item.tool.name}</span>
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
        {selectedTool ? (
          <div className="p-3 space-y-3">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{selectedTool.tool.name}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Server className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">{selectedTool.serverName}</span>
              </div>
            </div>

            {selectedTool.tool.description && (
              <div>
                <div className="text-[11px] font-medium text-muted-foreground mb-1">描述</div>
                <p className="text-xs leading-relaxed">{selectedTool.tool.description}</p>
              </div>
            )}

            {selectedTool.tool.inputSchema && (
              <div>
                <div className="text-[11px] font-medium text-muted-foreground mb-1">参数 Schema</div>
                <pre className="rounded bg-muted p-2 text-[11px] overflow-x-auto leading-relaxed">
                  {JSON.stringify(selectedTool.tool.inputSchema, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Wrench className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-xs">选择工具查看详情</p>
          </div>
        )}
      </div>
    </div>
  );
}
