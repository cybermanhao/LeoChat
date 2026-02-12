import { useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Server, Wrench, FileText, Zap, Check, AlertCircle, RefreshCw } from "lucide-react";
import { Button, cn } from "@ai-chatbox/ui";
import { useMCPStore } from "../../stores/mcp";
import { ServerForm } from "../../components/mcp/ServerForm";
import { MCPToolsTab } from "../../components/mcp/MCPToolsTab";
import { MCPResourcesTab } from "../../components/mcp/MCPResourcesTab";
import { MCPPromptsTab } from "../../components/mcp/MCPPromptsTab";
import type { MCPServerConfig, MCPServerConfigValidated } from "@ai-chatbox/shared";

type TabValue = "settings" | "tools" | "resources" | "prompts";

/** 影响 transport/连接的字段，变更后需要重启 */
const TRANSPORT_CRITICAL_FIELDS: (keyof MCPServerConfig)[] = [
  "transport",
  "command",
  "args",
  "url",
  "env",
  "timeout",
];

function needsRestart(
  oldConfig: MCPServerConfig,
  newData: MCPServerConfigValidated
): boolean {
  for (const field of TRANSPORT_CRITICAL_FIELDS) {
    const oldVal = (oldConfig as any)[field];
    const newVal = (newData as any)[field];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      return true;
    }
  }
  return false;
}

type SaveStatus = null | "saved" | "restarting" | "restarted" | "error";

export function MCPServerEditPage() {
  const { serverId } = useParams<{ serverId: string }>();
  const navigate = useNavigate();

  const sources = useMCPStore((s) => s.sources);
  const serverStates = useMCPStore((s) => s.serverStates);
  const enabledServerIds = useMCPStore((s) => s.enabledServerIds);
  const autoConnectServerIds = useMCPStore((s) => s.autoConnectServerIds);
  const updateServer = useMCPStore((s) => s.updateServer);
  const setAutoConnect = useMCPStore((s) => s.setAutoConnect);
  const toggleServer = useMCPStore((s) => s.toggleServer);
  const refreshServer = useMCPStore((s) => s.refreshServer);

  const [activeTab, setActiveTab] = useState<TabValue>("settings");
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(null);

  // 查找服务器配置
  const server = useMemo(() => {
    for (const source of sources) {
      const found = source.servers.find((s) => s.id === serverId);
      if (found) return found;
    }
    return null;
  }, [sources, serverId]);

  const serverState = serverId ? serverStates[serverId] : undefined;
  const isConnected = serverId ? enabledServerIds.includes(serverId) : false;
  const tools = serverState?.session?.tools || [];
  const resources = serverState?.resources || [];
  const prompts = serverState?.prompts || [];

  if (!server || !serverId) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <Server className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <h2 className="text-xl font-semibold mb-2">服务器未找到</h2>
        <p className="text-sm text-muted-foreground mb-4">
          该服务器不存在或已被删除
        </p>
        <Button onClick={() => navigate("/mcp/servers")}>
          返回服务器列表
        </Button>
      </div>
    );
  }

  const handleSave = async (data: MCPServerConfigValidated) => {
    setIsSaving(true);
    setSaveStatus(null);
    try {
      const shouldRestart = isConnected && needsRestart(server, data);

      updateServer(serverId, data);
      setAutoConnect(serverId, !!data.autoConnect);
      setSaveStatus("saved");

      // 仅在 transport-critical 字段变更时重启
      if (shouldRestart) {
        setSaveStatus("restarting");
        await refreshServer(serverId);
        setSaveStatus("restarted");
      }

      setTimeout(() => setSaveStatus(null), 3000);
    } catch (error) {
      console.error("Failed to save server configuration:", error);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 5000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleConnection = async () => {
    await toggleServer(serverId);
  };

  const tabs = [
    {
      value: "settings" as const,
      label: "常规设置",
      icon: Server,
      available: true,
    },
    {
      value: "tools" as const,
      label: `工具 (${tools.length})`,
      icon: Wrench,
      available: isConnected && tools.length > 0,
    },
    {
      value: "resources" as const,
      label: `资源 (${resources.length})`,
      icon: FileText,
      available: isConnected && resources.length > 0,
    },
    {
      value: "prompts" as const,
      label: `Prompts (${prompts.length})`,
      icon: Zap,
      available: isConnected && prompts.length > 0,
    },
  ];

  const availableTabs = tabs.filter((tab) => tab.available);

  return (
    <div className="h-full flex flex-col overflow-y-auto bg-background">
      {/* Header */}
      <div className="flex-none border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/mcp/servers")}
                className="h-9 w-9"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div>
                <h1 className="text-xl font-bold">{server.name}</h1>
                <p className="text-sm text-muted-foreground mt-0.5">
                  编辑 MCP 服务器配置
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* 连接状态开关 */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {isConnected ? "已连接" : "未连接"}
                </span>
                <button
                  onClick={handleToggleConnection}
                  className={cn(
                    "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
                    isConnected ? "bg-green-500" : "bg-gray-300"
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                      isConnected ? "translate-x-6" : "translate-x-1"
                    )}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-4 -mb-px">
            {availableTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors border-b-2",
                    activeTab === tab.value
                      ? "border-primary text-primary bg-primary/5"
                      : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 max-w-5xl mx-auto px-6 py-6 w-full flex flex-col">
        {activeTab === "settings" && (
          <div className="bg-card rounded-lg border p-6 overflow-y-auto">
            <ServerForm
              defaultValues={{
                ...(server as any),
                autoConnect: serverId ? autoConnectServerIds.includes(serverId) : false,
              }}
              onSubmit={handleSave}
              submitLabel={isSaving ? "保存中..." : "保存"}
            />
          </div>
        )}

        {activeTab === "tools" && isConnected && (
          <div className="bg-card rounded-lg border flex-1 min-h-0 flex flex-col overflow-hidden">
            <MCPToolsTab />
          </div>
        )}

        {activeTab === "resources" && isConnected && (
          <div className="bg-card rounded-lg border flex-1 min-h-0 flex flex-col overflow-hidden">
            <MCPResourcesTab />
          </div>
        )}

        {activeTab === "prompts" && isConnected && (
          <div className="bg-card rounded-lg border flex-1 min-h-0 flex flex-col overflow-hidden">
            <MCPPromptsTab />
          </div>
        )}

        {/* 提示：需要连接才能查看工具/资源/Prompts */}
        {!isConnected && activeTab !== "settings" && (
          <div className="bg-card rounded-lg border p-12 flex flex-col items-center justify-center text-center">
            <Server className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="text-lg font-semibold mb-2">服务器未连接</h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-md">
              请先连接服务器以查看可用的工具、资源和 Prompts
            </p>
            <Button onClick={handleToggleConnection}>连接服务器</Button>
          </div>
        )}
      </div>

      {/* Save Status Toast */}
      {saveStatus && (
        <div
          className={cn(
            "fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-2.5 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium transition-all",
            saveStatus === "error"
              ? "bg-red-500 text-white"
              : "bg-card border text-foreground"
          )}
        >
          {saveStatus === "saved" && (
            <>
              <Check className="h-4 w-4 text-green-500" />
              配置已保存
            </>
          )}
          {saveStatus === "restarting" && (
            <>
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
              正在重启服务器以应用新配置...
            </>
          )}
          {saveStatus === "restarted" && (
            <>
              <Check className="h-4 w-4 text-green-500" />
              配置已保存，服务器已重启
            </>
          )}
          {saveStatus === "error" && (
            <>
              <AlertCircle className="h-4 w-4" />
              保存失败，请重试
            </>
          )}
        </div>
      )}
    </div>
  );
}
