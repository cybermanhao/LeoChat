import { useState, useMemo } from "react";
import { cn } from "@ai-chatbox/ui";
import { FileText, Server } from "lucide-react";
import { useMCPStore } from "../../stores/mcp";

interface ResourceWithServer {
  resource: { uri: string; name?: string; description?: string; mimeType?: string };
  serverId: string;
  serverName: string;
}

export function MCPResourcesTab() {
  const sources = useMCPStore((s) => s.sources);
  const serverStates = useMCPStore((s) => s.serverStates);
  const [selectedResource, setSelectedResource] = useState<ResourceWithServer | null>(null);

  const allServers = sources.flatMap((source) => source.servers);

  const resourcesWithServer = useMemo(() => {
    const result: ResourceWithServer[] = [];
    for (const server of allServers) {
      const state = serverStates[server.id];
      if (state?.resources) {
        for (const resource of state.resources) {
          result.push({
            resource,
            serverId: server.id,
            serverName: server.name,
          });
        }
      }
    }
    return result;
  }, [allServers, serverStates]);

  if (resourcesWithServer.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
        <FileText className="h-8 w-8 mb-2 opacity-20" />
        <p className="text-xs">暂无可用资源</p>
        <p className="text-[10px] mt-1">已连接的服务器未提供资源</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* 左侧列表 */}
      <div className="w-56 shrink-0 border-r flex flex-col min-h-0">
        <div className="p-2 border-b">
          <span className="text-[10px] text-muted-foreground">共 {resourcesWithServer.length} 个资源</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {resourcesWithServer.map((item, i) => {
            const isSelected = selectedResource === item;
            return (
              <div
                key={`${item.serverId}-${item.resource.uri}-${i}`}
                className={cn(
                  "px-3 py-1.5 cursor-pointer border-b border-transparent",
                  isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                )}
                onClick={() => setSelectedResource(item)}
              >
                <div className="flex items-center gap-1.5">
                  <FileText className="h-3 w-3 shrink-0 opacity-60" />
                  <span className="text-xs font-medium truncate">{item.resource.name || item.resource.uri}</span>
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
        {selectedResource ? (
          <div className="p-3 space-y-3">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium text-sm">{selectedResource.resource.name || "Resource"}</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Server className="h-3 w-3 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">{selectedResource.serverName}</span>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">URI</div>
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded break-all">{selectedResource.resource.uri}</code>
            </div>

            {selectedResource.resource.mimeType && (
              <div>
                <div className="text-[11px] font-medium text-muted-foreground mb-1">MIME Type</div>
                <span className="text-xs">{selectedResource.resource.mimeType}</span>
              </div>
            )}

            {selectedResource.resource.description && (
              <div>
                <div className="text-[11px] font-medium text-muted-foreground mb-1">描述</div>
                <p className="text-xs leading-relaxed">{selectedResource.resource.description}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FileText className="h-8 w-8 mb-2 opacity-20" />
            <p className="text-xs">选择资源查看详情</p>
          </div>
        )}
      </div>
    </div>
  );
}
