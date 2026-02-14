import { useMemo } from "react";
import { Button, cn } from "@ai-chatbox/ui";
import {
  Server,
  Loader2,
  Trash2,
  Pencil,
  Plug,
  Unplug,
  Terminal,
  Globe,
  Zap,
} from "lucide-react";
import type { MCPServerConfig } from "@ai-chatbox/shared";

interface ServerCardProps {
  server: MCPServerConfig;
  version?: string | null;
  isLoading?: boolean;
  isConnected?: boolean;
  isReconnecting?: boolean;
  isAutoConnect?: boolean;
  error?: string;
  onToggle: (active: boolean) => void;
  onDelete?: () => void;
  onEdit: () => void;
  onAutoConnectToggle?: () => void;
}

function StatusBadge({
  connected,
  error,
  loading,
  reconnecting,
}: {
  connected?: boolean;
  error?: string;
  loading?: boolean;
  reconnecting?: boolean;
}) {
  if (reconnecting) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-orange-500/10 text-orange-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        重连中
      </span>
    );
  }
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-yellow-500/10 text-yellow-600">
        <Loader2 className="h-3 w-3 animate-spin" />
        连接中
      </span>
    );
  }
  if (error) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-red-500/10 text-red-600">
        <span className="h-2 w-2 rounded-full bg-red-500" />
        错误
      </span>
    );
  }
  if (connected) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-green-500/10 text-green-600">
        <span className="h-2 w-2 rounded-full bg-green-500" />
        已连接
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-gray-500/10 text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-gray-400" />
      未连接
    </span>
  );
}

export function ServerCard({
  server,
  version,
  isLoading = false,
  isConnected = false,
  isReconnecting = false,
  isAutoConnect = false,
  error,
  onToggle,
  onDelete,
  onEdit,
}: ServerCardProps) {
  const TransportIcon = server.transport === "stdio" ? Terminal : Globe;

  // 从服务器配置中提取描述（需要扩展 MCPServerConfig 类型）
  const description = (server as any).description || "";

  // 截断描述到 3 行
  const truncatedDescription = useMemo(() => {
    if (!description) return "";
    const lines = description.split("\n");
    if (lines.length > 3) {
      return lines.slice(0, 3).join("\n") + "...";
    }
    return description;
  }, [description]);

  const displayTags = (server as any).tags || [];

  return (
    <div
      className={cn(
        "group relative h-[125px] rounded-lg border bg-card p-4 transition-all hover:shadow-md hover:border-primary/50 cursor-pointer",
        !isConnected && !isLoading && "opacity-60",
        isLoading && "opacity-80 cursor-wait"
      )}
      onClick={onEdit}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Logo or Icon */}
          <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center shrink-0">
            <Server className="h-4 w-4 text-primary" />
          </div>

          {/* Name and Status */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm truncate">{server.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <StatusBadge connected={isConnected} error={error} loading={isLoading} reconnecting={isReconnecting} />
              {isAutoConnect && (
                <span title="自动连接">
                  <Zap className="h-3 w-3 text-yellow-500 shrink-0" />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons (visible on hover) */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="删除"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={(e) => {
              e.stopPropagation();
              onToggle(!isConnected);
            }}
            disabled={isLoading}
            title={isConnected ? "断开连接" : "连接"}
          >
            {isLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : isConnected ? (
              <Unplug className="h-3.5 w-3.5" />
            ) : (
              <Plug className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>

      {/* Description Body */}
      <div className="flex-1 mb-2 min-h-0">
        {description ? (
          <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">
            {truncatedDescription}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">暂无描述</p>
        )}
      </div>

      {/* Footer: Version, Transport, Tags */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        {version && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">
            {version}
          </span>
        )}
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted">
          <TransportIcon className="h-3 w-3" />
          {server.transport === "stdio" ? "STDIO" : "HTTP"}
        </span>
        {(server as any).provider && (
          <span className="px-1.5 py-0.5 rounded bg-muted truncate max-w-[100px]">
            {(server as any).provider}
          </span>
        )}
        {displayTags.slice(0, 2).map((tag: string) => (
          <span key={tag} className="px-1.5 py-0.5 rounded bg-muted truncate max-w-[80px]">
            {tag}
          </span>
        ))}
        {displayTags.length > 2 && (
          <span className="px-1.5 py-0.5 rounded bg-muted">
            +{displayTags.length - 2}
          </span>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="absolute bottom-2 left-4 right-4 text-[10px] text-red-500 truncate">
          {error}
        </div>
      )}
    </div>
  );
}
