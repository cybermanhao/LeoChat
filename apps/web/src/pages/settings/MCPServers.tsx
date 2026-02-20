import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { Button } from "@ai-chatbox/ui";
import { useT } from "../../i18n";
import { useMCPStore } from "../../stores/mcp";
import { ServerCard } from "../../components/mcp/ServerCard";
import { ServerErrorBoundary } from "../../components/mcp/ServerErrorBoundary";

export function MCPServersPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const sources = useMCPStore((s) => s.sources);
  const serverStates = useMCPStore((s) => s.serverStates);
  const connectingServerIds = useMCPStore((s) => s.connectingServerIds);
  const serverVersions = useMCPStore((s) => s.serverVersions);
  const enabledServerIds = useMCPStore((s) => s.enabledServerIds);
  const autoConnectServerIds = useMCPStore((s) => s.autoConnectServerIds);
  const toggleServer = useMCPStore((s) => s.toggleServer);
  const removeServer = useMCPStore((s) => s.removeServer);
  const setAutoConnect = useMCPStore((s) => s.setAutoConnect);
  const autoConnectAll = useMCPStore((s) => s.autoConnectAll);

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 获取所有服务器
  const allServers = sources.flatMap((source) => source.servers);

  const handleDelete = (serverId: string) => {
    if (confirmDelete === serverId) {
      removeServer(serverId);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(serverId);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  // 判断是否为自定义服务器（只有自定义的才能删除）
  const isCustomServer = (serverId: string) => {
    const customSource = sources.find((s) => s.id === "custom");
    return customSource?.servers.some((s) => s.id === serverId) ?? false;
  };

  const handleEditServer = (serverId: string) => {
    navigate(`/mcp/servers/${serverId}/edit`);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await autoConnectAll();
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Top Bar */}
      <div className="flex-none h-14 border-b bg-card px-6 flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          {t("mcp.refresh")}
        </Button>
      </div>

      {/* Server Cards Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {allServers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <p className="text-sm">{t("mcp.serversDetail.empty")}</p>
            <p className="text-xs mt-2">{t("mcp.serversDetail.emptyHint")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {allServers.map((server) => {
              const state = serverStates[server.id];
              const isConnected = enabledServerIds.includes(server.id);
              const isLoading = connectingServerIds.has(server.id);
              const isReconnecting = state?.session?.status === "reconnecting";
              const version = serverVersions[server.id];
              const isAutoConnect = autoConnectServerIds.includes(server.id);

              return (
                <ServerErrorBoundary
                  key={server.id}
                  onDelete={
                    isCustomServer(server.id)
                      ? () => handleDelete(server.id)
                      : undefined
                  }
                >
                  <ServerCard
                    server={server}
                    version={version}
                    isLoading={isLoading}
                    isConnected={isConnected}
                    isReconnecting={isReconnecting}
                    isAutoConnect={isAutoConnect}
                    error={state?.error}
                    onToggle={() => toggleServer(server.id)}
                    onDelete={
                      isCustomServer(server.id)
                        ? () => handleDelete(server.id)
                        : undefined
                    }
                    onEdit={() => handleEditServer(server.id)}
                    onAutoConnectToggle={() =>
                      setAutoConnect(server.id, !isAutoConnect)
                    }
                  />
                </ServerErrorBoundary>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Hint */}
      {confirmDelete && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 bg-yellow-500/90 text-white text-sm rounded-lg shadow-lg">
          {t("mcp.confirmDeleteClick")}
        </div>
      )}
    </div>
  );
}
