import { useState, useEffect, useCallback } from "react";
import {
  Button,
  cn,
} from "@ai-chatbox/ui";
import {
  Server,
  Plus,
  Loader2,
  Wrench,
  ChevronDown,
  ChevronRight,
  Plug,
  Unplug,
  Terminal,
  Globe,
  X,
  Trash2,
  Zap,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  Cpu,
} from "lucide-react";
import { useT } from "../../i18n";
import { useMCPStore } from "../../stores/mcp";
import { envApi, type EnvToolStatus } from "../../lib/api";
import type { MCPServerConfig, MCPTool } from "@ai-chatbox/shared";

type TransportType = "stdio" | "streamable-http";

// ---------- 环境安装子组件 ----------
const ENV_META: Array<{
  id: string;
  label: string;
  installUrl: string;
  installCmd: string;
}> = [
  { id: "npx",    label: "npx",     installUrl: "https://nodejs.org/",                installCmd: "winget install OpenJS.NodeJS" },
  { id: "uvx",    label: "uvx",     installUrl: "https://docs.astral.sh/uv/",         installCmd: "pip install uv" },
  { id: "uv",     label: "uv",      installUrl: "https://docs.astral.sh/uv/",         installCmd: "pip install uv" },
  { id: "python", label: "Python",  installUrl: "https://www.python.org/downloads/",  installCmd: "winget install Python.Python.3" },
  { id: "bun",    label: "Bun",     installUrl: "https://bun.sh/",                    installCmd: 'powershell -c "irm bun.sh/install.ps1 | iex"' },
  { id: "node",   label: "Node.js", installUrl: "https://nodejs.org/",                installCmd: "winget install OpenJS.NodeJS" },
  { id: "mcp",    label: "MCP CLI", installUrl: "https://github.com/modelcontextprotocol/python-sdk", installCmd: "pip install mcp" },
];

function EnvSection() {
  const [expanded, setExpanded] = useState(false);
  const [tools, setTools] = useState<EnvToolStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchEnv = useCallback(async () => {
    setLoading(true);
    try {
      const data = await envApi.check();
      setTools(data);
    } catch {
      setTools([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // 展开时懒加载
  useEffect(() => {
    if (expanded && tools.length === 0) fetchEnv();
  }, [expanded, tools.length, fetchEnv]);

  const handleCopy = async (id: string, cmd: string) => {
    await navigator.clipboard.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const installedCount = tools.filter((t) => t.installed).length;

  return (
    <div className="border-b">
      {/* 折叠标题 */}
      <button
        className="flex items-center gap-1.5 w-full h-8 px-3 hover:bg-muted/50 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <Cpu className="h-3 w-3 text-muted-foreground shrink-0" />
        <span className="flex-1 text-xs font-medium">环境安装</span>
        {tools.length > 0 && (
          <span className="text-[10px] text-muted-foreground mr-1">
            {installedCount}/{ENV_META.length}
          </span>
        )}
        {expanded ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* 列表 */}
      {expanded && (
        <div className="pb-1 px-2 space-y-0.5">
          {loading ? (
            <div className="flex items-center justify-center py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            ENV_META.map((meta) => {
              const tool = tools.find((t) => t.id === meta.id);
              const installed = tool?.installed ?? false;
              const version = tool?.version;
              const isCopied = copiedId === meta.id;

              return (
                <div key={meta.id} className="flex items-center gap-1.5 h-7 px-1">
                  {installed ? (
                    <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                  ) : (
                    <XCircle className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  )}
                  <span className="text-xs font-medium w-12 shrink-0">{meta.label}</span>
                  {installed && version ? (
                    <span className="flex-1 text-[10px] text-muted-foreground font-mono truncate">
                      {version.replace(/^(node\s+|Python\s+|uv\s+)/, "")}
                    </span>
                  ) : (
                    <span className="flex-1 text-[10px] text-muted-foreground">未安装</span>
                  )}
                  {!installed && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        onClick={() => window.open(meta.installUrl, "_blank")}
                        title="打开安装页面"
                      >
                        <ExternalLink className="h-2.5 w-2.5" />
                        安装
                      </button>
                      <button
                        className={cn(
                          "flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-colors",
                          isCopied
                            ? "bg-green-500/10 text-green-600"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        )}
                        onClick={() => handleCopy(meta.id, meta.installCmd)}
                        title={meta.installCmd}
                      >
                        {isCopied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                        {isCopied ? "已复制" : "命令"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
// ---------- end EnvSection ----------

function StatusBadge({ connected, error, connecting, reconnecting }: { connected?: boolean; error?: string; connecting?: boolean; reconnecting?: boolean }) {
  const { t } = useT();
  if (reconnecting) {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-orange-500/10 text-orange-600">
      <Loader2 className="h-2.5 w-2.5 animate-spin" />重连中
    </span>;
  }
  if (connecting) {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-yellow-500/10 text-yellow-600">
      <Loader2 className="h-2.5 w-2.5 animate-spin" />连接中
    </span>;
  }
  if (error) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-red-500/10 text-red-600">
    <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{t("mcp.error")}
  </span>;
  if (connected) return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-green-500/10 text-green-600">
    <span className="h-1.5 w-1.5 rounded-full bg-green-500" />{t("mcp.connected")}
  </span>;
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-gray-500/10 text-muted-foreground">
    <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />{t("mcp.notConnected")}
  </span>;
}

function InlineServerForm({
  onSave,
  onCancel,
}: {
  onSave: (config: Omit<MCPServerConfig, "id">) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<TransportType>("stdio");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (transport === "stdio" && !command.trim()) return;
    if (transport === "streamable-http" && !url.trim()) return;

    onSave({
      name: name.trim(),
      transport,
      command: transport === "stdio" ? command.trim() : undefined,
      args: transport === "stdio" && args.trim() ? args.trim().split(/\s+/) : undefined,
      url: transport !== "stdio" ? url.trim() : undefined,
    });
  };

  return (
    <div className="p-3 border-b bg-muted/30">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium">{t("mcp.addServer")}</span>
        <button onClick={onCancel} className="p-0.5 hover:bg-muted rounded">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("mcp.form.serverNamePlaceholder")}
          className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-1">
          {[
            { value: "stdio", label: "STDIO", icon: Terminal, desc: t("mcp.transport.stdio.desc") },
            { value: "streamable-http", label: "HTTP", icon: Globe, desc: t("mcp.transport.http.desc") },
          ].map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setTransport(opt.value as TransportType)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1 rounded border px-1.5 py-1 text-xs",
                transport === opt.value ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
              )}
            >
              <opt.icon className="h-3 w-3" />
              {opt.label}
            </button>
          ))}
        </div>
        {transport === "stdio" ? (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder={t("mcp.form.commandPlaceholder")}
                className="w-20 rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
              <input
                type="text"
                value={args}
                onChange={(e) => setArgs(e.target.value)}
                placeholder={t("mcp.form.argsPlaceholder")}
                className="flex-1 rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">{t("mcp.transport.stdio.description")}</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t("mcp.form.urlPlaceholder")}
              className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
            />
            <p className="text-[10px] text-muted-foreground">{t("mcp.transport.http.description")}</p>
          </div>
        )}
        <Button size="sm" className="w-full h-7 text-xs" onClick={handleSubmit}>
          {t("common.add")}
        </Button>
      </div>
    </div>
  );
}

export function MCPServersTab() {
  const { t } = useT();
  const sources = useMCPStore((s) => s.sources);
  const serverStates = useMCPStore((s) => s.serverStates);
  const isConnecting = useMCPStore((s) => s.isConnecting);
  const toggleServer = useMCPStore((s) => s.toggleServer);
  const addServer = useMCPStore((s) => s.addServer);
  const removeServer = useMCPStore((s) => s.removeServer);
  const autoConnectServerIds = useMCPStore((s) => s.autoConnectServerIds);
  const setAutoConnect = useMCPStore((s) => s.setAutoConnect);

  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [selectedTool, setSelectedTool] = useState<{ serverId: string; tool: MCPTool } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const allServers = sources.flatMap((source) => source.servers);

  const toggleExpanded = (serverId: string) => {
    setExpandedServers((prev) => {
      const next = new Set(prev);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
  };

  const handleAddServer = (config: Omit<MCPServerConfig, "id">) => {
    addServer("custom", { ...config, id: `custom-${Date.now()}` });
    setShowAddForm(false);
  };

  const handleDeleteServer = (serverId: string) => {
    if (confirmDelete === serverId) {
      removeServer(serverId);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(serverId);
      // 3秒后自动取消确认状态
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  // 判断是否为自定义服务器（只有自定义的才能删除）
  const isCustomServer = (serverId: string) => {
    const customSource = sources.find(s => s.id === "custom");
    return customSource?.servers.some(s => s.id === serverId) ?? false;
  };

  return (
    <div className="flex flex-1 min-h-0">
      {/* 左侧列表 */}
      <div className="w-52 shrink-0 border-r flex flex-col min-h-0">
        {showAddForm ? (
          <InlineServerForm onSave={handleAddServer} onCancel={() => setShowAddForm(false)} />
        ) : (
          <button
            className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted border-b"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-3 w-3" />
            {t("mcp.addServer")}
          </button>
        )}

        {/* 环境安装区块 */}
        <EnvSection />

        <div className="flex-1 overflow-y-auto">
          {allServers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-xs">
              <Server className="h-6 w-6 mb-1.5 opacity-40" />
              <span>暂无服务器</span>
            </div>
          ) : (
            <div className="py-1">
              {allServers.map((server) => {
                const state = serverStates[server.id];
                const connected = state?.session?.status === "connected";
                const reconnecting = state?.session?.status === "reconnecting";
                const tools = state?.session?.tools || [];
                const expanded = expandedServers.has(server.id);
                const connecting = isConnecting[server.id];

                return (
                  <div key={server.id}>
                    <div className="flex items-center gap-1 px-2 py-1 hover:bg-muted/50 group">
                      <button
                        className="p-0.5 rounded hover:bg-muted"
                        onClick={() => connected && tools.length > 0 && toggleExpanded(server.id)}
                        disabled={!connected || tools.length === 0}
                      >
                        {connected && tools.length > 0 ? (
                          expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />
                        ) : (
                          <span className="w-3 h-3" />
                        )}
                      </button>
                      <StatusBadge connected={connected} error={state?.error} connecting={connecting} reconnecting={reconnecting} />
                      <span className="flex-1 text-xs font-medium truncate ml-1">{server.name}</span>
                      {autoConnectServerIds.includes(server.id) && (
                        <span title={t("mcp.autoConnect")}><Zap className="h-2.5 w-2.5 text-yellow-500 shrink-0" /></span>
                      )}
                      {connected && tools.length > 0 && (
                        <span className="text-[10px] text-muted-foreground mr-1">{tools.length}</span>
                      )}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                        <button
                          className={cn(
                            "p-1 rounded hover:bg-muted",
                            autoConnectServerIds.includes(server.id) && "text-yellow-500"
                          )}
                          onClick={() => setAutoConnect(server.id, !autoConnectServerIds.includes(server.id))}
                          title={autoConnectServerIds.includes(server.id) ? t("mcp.disableAutoConnect") : t("mcp.enableAutoConnect")}
                        >
                          <Zap className="h-3 w-3" />
                        </button>
                        {isCustomServer(server.id) && (
                          <button
                            className={cn(
                              "p-1 rounded hover:bg-muted",
                              confirmDelete === server.id && "text-red-500"
                            )}
                            onClick={() => handleDeleteServer(server.id)}
                            title={confirmDelete === server.id ? t("mcp.confirmDeleteClick") : t("common.delete")}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          className="p-1 rounded hover:bg-muted"
                          onClick={() => toggleServer(server.id)}
                          disabled={connecting}
                        >
                          {connecting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : connected ? (
                            <Unplug className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <Plug className="h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                      </div>
                    </div>

                    {expanded && tools.length > 0 && (
                      <div className="ml-4 border-l">
                        {tools.map((tool: MCPTool) => {
                          const isSelected = selectedTool?.serverId === server.id && selectedTool?.tool.name === tool.name;
                          return (
                            <div
                              key={tool.name}
                              className={cn(
                                "flex items-center gap-1.5 pl-3 pr-2 py-1 cursor-pointer text-xs",
                                isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                              )}
                              onClick={() => setSelectedTool({ serverId: server.id, tool })}
                            >
                              <Wrench className="h-3 w-3 shrink-0 opacity-60" />
                              <span className="truncate">{tool.name}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {state?.error && (
                      <div className="ml-8 pr-2 text-[10px] text-red-500 truncate">{state.error}</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
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
              <span className="text-[11px] text-muted-foreground">
                {allServers.find((s) => s.id === selectedTool.serverId)?.name}
              </span>
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
