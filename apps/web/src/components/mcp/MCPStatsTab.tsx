import { useMemo } from "react";
import { Server, Wrench, FileText, MessageSquare, RefreshCw } from "lucide-react";
import { Button } from "@ai-chatbox/ui";
import { t } from "../../i18n";
import { useMCPStore } from "../../stores/mcp";

export function MCPStatsTab() {
  const sources = useMCPStore((s) => s.sources);
  const serverStates = useMCPStore((s) => s.serverStates);
  const syncWithBackend = useMCPStore((s) => s.syncWithBackend);

  const stats = useMemo(() => {
    const allServers = sources.flatMap((source) => source.servers);
    let totalServers = 0;
    let connectedServers = 0;
    let errorServers = 0;
    let disconnectedServers = 0;
    let totalTools = 0;
    let totalResources = 0;
    let totalPrompts = 0;
    const serverDetails: Array<{
      name: string;
      id: string;
      status: "connected" | "error" | "disconnected" | "reconnecting";
      toolCount: number;
      resourceCount: number;
      promptCount: number;
      transport: string;
      error?: string;
    }> = [];

    for (const server of allServers) {
      totalServers++;
      const state = serverStates[server.id];
      const sessionStatus = state?.session?.status;
      const connected = sessionStatus === "connected";
      const reconnecting = sessionStatus === "reconnecting";
      const hasError = !!state?.error;
      const tools = state?.session?.tools?.length || 0;
      const resources = state?.resources?.length || 0;
      const prompts = state?.prompts?.length || 0;

      if (connected) {
        connectedServers++;
        totalTools += tools;
        totalResources += resources;
        totalPrompts += prompts;
      } else if (hasError) {
        errorServers++;
      } else {
        disconnectedServers++;
      }

      serverDetails.push({
        name: server.name,
        id: server.id,
        status: reconnecting ? "reconnecting" : connected ? "connected" : hasError ? "error" : "disconnected",
        toolCount: tools,
        resourceCount: resources,
        promptCount: prompts,
        transport: server.transport || "stdio",
        error: state?.error,
      });
    }

    return {
      totalServers,
      connectedServers,
      errorServers,
      disconnectedServers,
      totalTools,
      totalResources,
      totalPrompts,
      serverDetails,
    };
  }, [sources, serverStates]);

  return (
    <div className="p-4 space-y-4 overflow-y-auto h-full">
      {/* 概览卡片 */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          icon={<Server className="h-4 w-4" />}
          label={t("mcp.stats.servers")}
          value={stats.connectedServers}
          total={stats.totalServers}
          color="text-blue-600"
          bgColor="bg-blue-500/10"
        />
        <StatCard
          icon={<Wrench className="h-4 w-4" />}
          label={t("mcp.stats.tools")}
          value={stats.totalTools}
          color="text-purple-600"
          bgColor="bg-purple-500/10"
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label={t("mcp.stats.resources")}
          value={stats.totalResources}
          color="text-green-600"
          bgColor="bg-green-500/10"
        />
        <StatCard
          icon={<MessageSquare className="h-4 w-4" />}
          label={t("mcp.stats.prompts")}
          value={stats.totalPrompts}
          color="text-orange-600"
          bgColor="bg-orange-500/10"
        />
      </div>

      {/* 连接状态摘要 */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium">{t("mcp.stats.connectionStatus")}</span>
          <Button variant="ghost" size="sm" className="h-6 text-[10px] gap-1" onClick={() => syncWithBackend()}>
            <RefreshCw className="h-3 w-3" />
            {t("mcp.refresh")}
          </Button>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            {t("mcp.connected")} {stats.connectedServers}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {t("mcp.error")} {stats.errorServers}
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
            {t("mcp.notConnected")} {stats.disconnectedServers}
          </span>
        </div>
      </div>

      {/* 服务器明细 */}
      <div>
        <span className="text-xs font-medium">{t("mcp.stats.serverDetails")}</span>
        <div className="mt-2 rounded border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground">
                <th className="text-left px-2 py-1.5 font-medium">{t("mcp.stats.tableHeader.name")}</th>
                <th className="text-left px-2 py-1.5 font-medium">{t("mcp.stats.tableHeader.protocol")}</th>
                <th className="text-center px-2 py-1.5 font-medium">{t("mcp.stats.tableHeader.status")}</th>
                <th className="text-center px-2 py-1.5 font-medium">{t("mcp.stats.tableHeader.tools")}</th>
                <th className="text-center px-2 py-1.5 font-medium">{t("mcp.stats.tableHeader.resources")}</th>
              </tr>
            </thead>
            <tbody>
              {stats.serverDetails.map((server) => (
                <tr key={server.id} className="border-t">
                  <td className="px-2 py-1.5 font-medium">{server.name}</td>
                  <td className="px-2 py-1.5">
                    <span className="px-1.5 py-0.5 rounded bg-muted text-[10px]">{server.transport}</span>
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <StatusDot status={server.status} />
                  </td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground">{server.toolCount}</td>
                  <td className="px-2 py-1.5 text-center text-muted-foreground">{server.resourceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  total,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  total?: number;
  color: string;
  bgColor: string;
}) {
  return (
    <div className={`rounded-lg p-2.5 ${bgColor}`}>
      <div className={`${color} mb-1`}>{icon}</div>
      <div className="text-lg font-semibold">
        {value}
        {total !== undefined && <span className="text-xs text-muted-foreground font-normal">/{total}</span>}
      </div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}

function StatusDot({ status }: { status: "connected" | "error" | "disconnected" | "reconnecting" }) {
  const colors = {
    connected: "bg-green-500",
    reconnecting: "bg-orange-500",
    error: "bg-red-500",
    disconnected: "bg-gray-400",
  };
  return <span className={`inline-block h-2 w-2 rounded-full ${colors[status]}`} />;
}
