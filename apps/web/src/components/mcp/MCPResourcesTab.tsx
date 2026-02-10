import { useState, useMemo, useEffect } from "react";
import { cn, Button } from "@ai-chatbox/ui";
import { FileText, Server, Download, Image as ImageIcon } from "lucide-react";
import { useMCPStore } from "../../stores/mcp";
import { mcpApi } from "../../lib/api";
import ReactMarkdown from "react-markdown";

interface ResourceWithServer {
  resource: { uri: string; name?: string; description?: string; mimeType?: string };
  serverId: string;
  serverName: string;
}

export function MCPResourcesTab() {
  const sources = useMCPStore((s) => s.sources);
  const serverStates = useMCPStore((s) => s.serverStates);
  const [selectedResource, setSelectedResource] = useState<ResourceWithServer | null>(null);
  const [resourceContent, setResourceContent] = useState<string | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

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

  // 获取资源内容
  useEffect(() => {
    if (!selectedResource) {
      setResourceContent(null);
      return;
    }

    const fetchContent = async () => {
      setIsLoadingContent(true);
      setContentError(null);
      try {
        const response = await mcpApi.readResource(
          selectedResource.serverId,
          selectedResource.resource.uri
        );
        // 假设 API 返回 { contents: [{ text: string }] }
        if (response.contents && response.contents[0]) {
          setResourceContent(response.contents[0].text || response.contents[0].blob);
        } else {
          setResourceContent(null);
        }
      } catch (error) {
        console.error("Failed to fetch resource:", error);
        setContentError("加载资源内容失败");
        setResourceContent(null);
      } finally {
        setIsLoadingContent(false);
      }
    };

    fetchContent();
  }, [selectedResource]);

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

            {/* 内容预览 */}
            <div>
              <div className="text-[11px] font-medium text-muted-foreground mb-1">内容预览</div>
              {isLoadingContent ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <span className="text-xs">加载中...</span>
                </div>
              ) : contentError ? (
                <div className="flex items-center justify-center py-8 text-red-600">
                  <span className="text-xs">{contentError}</span>
                </div>
              ) : resourceContent ? (
                <div className="rounded border bg-muted/30 p-3 max-h-96 overflow-y-auto">
                  {selectedResource.resource.mimeType?.startsWith("image/") ? (
                    // 图片预览
                    <div className="flex flex-col items-center gap-2">
                      <ImageIcon className="h-12 w-12 text-muted-foreground/40" />
                      <img
                        src={`data:${selectedResource.resource.mimeType};base64,${resourceContent}`}
                        alt={selectedResource.resource.name || "Resource"}
                        className="max-w-full rounded"
                      />
                    </div>
                  ) : selectedResource.resource.mimeType?.includes("markdown") ||
                    selectedResource.resource.uri.endsWith(".md") ? (
                    // Markdown 预览
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <ReactMarkdown>{resourceContent}</ReactMarkdown>
                    </div>
                  ) : (
                    // 纯文本
                    <pre className="text-xs whitespace-pre-wrap break-words">{resourceContent}</pre>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <span className="text-xs">暂无内容</span>
                </div>
              )}
            </div>
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
