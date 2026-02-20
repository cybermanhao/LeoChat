import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  cn,
} from "@ai-chatbox/ui";
import {
  Server,
  Wrench,
  FileText,
  MessageSquare,
  BarChart3,
  Cpu,
} from "lucide-react";
import { useT } from "../i18n";
import { useMCPStore } from "../stores/mcp";
import { MCPServersTab } from "./mcp/MCPServersTab";
import { MCPToolsTab } from "./mcp/MCPToolsTab";
import { MCPResourcesTab } from "./mcp/MCPResourcesTab";
import { MCPPromptsTab } from "./mcp/MCPPromptsTab";
import { MCPStatsTab } from "./mcp/MCPStatsTab";
import { MCPEnvTab } from "./mcp/MCPEnvTab";

interface MCPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabId = "servers" | "tools" | "resources" | "prompts" | "stats" | "env";

export function MCPDialog({ open, onOpenChange }: MCPDialogProps) {
  const { t } = useT();
  const TABS = useMemo<Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }>>(() => [
    { id: "servers", label: t("mcp.tabs.servers"), icon: Server },
    { id: "tools", label: t("mcp.tabs.tools"), icon: Wrench },
    { id: "resources", label: t("mcp.tabs.resources"), icon: FileText },
    { id: "prompts", label: t("mcp.tabs.prompts"), icon: MessageSquare },
    { id: "stats", label: t("mcp.tabs.stats"), icon: BarChart3 },
  ], [t]);
  const sources = useMCPStore((s) => s.sources);
  const serverStates = useMCPStore((s) => s.serverStates);
  const [activeTab, setActiveTab] = useState<TabId>("servers");

  const stats = useMemo(() => {
    let totalServers = 0;
    let connectedServers = 0;
    let totalTools = 0;

    for (const source of sources) {
      for (const server of source.servers) {
        totalServers++;
        const state = serverStates[server.id];
        if (state?.session?.status === "connected") {
          connectedServers++;
          totalTools += state.session.tools?.length || 0;
        }
      }
    }
    return { totalServers, connectedServers, totalTools };
  }, [sources, serverStates]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden"
        style={{ width: 700, height: 480, maxWidth: '90vw', maxHeight: '80vh' }}
      >
        {/* 头部：标题 + 统计 */}
        <div className="flex items-center justify-between h-10 px-3 border-b bg-muted/30 shrink-0">
          <span className="text-sm font-medium">{t("mcp.title")}</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              {t("mcp.servers")} <span className="text-green-600 font-medium">{stats.connectedServers}</span>/{stats.totalServers}
            </span>
            <span>
              {t("mcp.tools")} <span className="text-primary font-medium">{stats.totalTools}</span>
            </span>
          </div>
        </div>

        {/* Tab 栏 */}
        <div className="flex items-center gap-0.5 px-2 h-9 border-b bg-muted/10 shrink-0">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs transition-colors",
                  isActive
                    ? "bg-background text-foreground shadow-sm border"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab 内容 */}
        <div className="flex flex-1 min-h-0">
          {activeTab === "servers" && <MCPServersTab />}
          {activeTab === "tools" && <MCPToolsTab />}
          {activeTab === "resources" && <MCPResourcesTab />}
          {activeTab === "prompts" && <MCPPromptsTab />}
          {activeTab === "stats" && <MCPStatsTab />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
