import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
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
} from "lucide-react";
import { useMCPStore } from "../stores/mcp";
import type { MCPServerConfig, MCPTool } from "@ai-chatbox/shared";

interface MCPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TransportType = "stdio" | "streamable-http" | "sse";

// 状态指示点
function StatusDot({ connected, error }: { connected?: boolean; error?: string }) {
  if (error) return <span className="h-2 w-2 rounded-full bg-red-500 shrink-0" />;
  if (connected) return <span className="h-2 w-2 rounded-full bg-green-500 shrink-0" />;
  return <span className="h-2 w-2 rounded-full bg-gray-400 shrink-0" />;
}

// 添加服务器表单（内嵌版本）
function InlineServerForm({
  onSave,
  onCancel,
}: {
  onSave: (config: Omit<MCPServerConfig, "id">) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<TransportType>("stdio");
  const [command, setCommand] = useState("npx");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");

  const handleSubmit = () => {
    if (!name.trim()) return;
    if (transport === "stdio" && !command.trim()) return;
    if ((transport === "streamable-http" || transport === "sse") && !url.trim()) return;

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
        <span className="text-xs font-medium">添加服务器</span>
        <button onClick={onCancel} className="p-0.5 hover:bg-muted rounded">
          <X className="h-3 w-3" />
        </button>
      </div>
      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="服务器名称"
          className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
        />
        <div className="flex gap-1">
          {[
            { value: "stdio", label: "STDIO", icon: Terminal },
            { value: "streamable-http", label: "HTTP", icon: Globe },
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
          <div className="flex gap-1">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="命令"
              className="w-16 rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="text"
              value={args}
              onChange={(e) => setArgs(e.target.value)}
              placeholder="参数"
              className="flex-1 rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        ) : (
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="http://localhost:3000/mcp"
            className="w-full rounded border bg-background px-2 py-1 text-xs outline-none focus:ring-1 focus:ring-primary"
          />
        )}
        <Button size="sm" className="w-full h-7 text-xs" onClick={handleSubmit}>
          添加
        </Button>
      </div>
    </div>
  );
}

export function MCPDialog({ open, onOpenChange }: MCPDialogProps) {
  const sources = useMCPStore((s) => s.sources);
  const serverStates = useMCPStore((s) => s.serverStates);
  const isConnecting = useMCPStore((s) => s.isConnecting);
  const toggleServer = useMCPStore((s) => s.toggleServer);
  const addServer = useMCPStore((s) => s.addServer);

  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [selectedTool, setSelectedTool] = useState<{ serverId: string; tool: MCPTool } | null>(null);

  const allServers = sources.flatMap((source) => source.servers);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="p-0 gap-0 overflow-hidden"
        style={{ width: 580, height: 400, maxWidth: '90vw', maxHeight: '80vh' }}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between h-10 px-3 border-b bg-muted/30 shrink-0">
          <span className="text-sm font-medium">MCP 工具管理</span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>
              服务器 <span className="text-green-600 font-medium">{stats.connectedServers}</span>/{stats.totalServers}
            </span>
            <span>
              工具 <span className="text-primary font-medium">{stats.totalTools}</span>
            </span>
          </div>
        </div>

        {/* 主体 */}
        <div className="flex flex-1 min-h-0">
          {/* 左侧列表 */}
          <div className="w-52 shrink-0 border-r flex flex-col min-h-0">
            {/* 添加表单或按钮 */}
            {showAddForm ? (
              <InlineServerForm onSave={handleAddServer} onCancel={() => setShowAddForm(false)} />
            ) : (
              <button
                className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted border-b"
                onClick={() => setShowAddForm(true)}
              >
                <Plus className="h-3 w-3" />
                添加服务器
              </button>
            )}

            {/* 服务器列表 */}
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
                          <StatusDot connected={connected} error={state?.error} />
                          <span className="flex-1 text-xs font-medium truncate">{server.name}</span>
                          {connected && tools.length > 0 && (
                            <span className="text-[10px] text-muted-foreground mr-1">{tools.length}</span>
                          )}
                          <button
                            className="p-1 rounded hover:bg-muted opacity-0 group-hover:opacity-100"
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
      </DialogContent>
    </Dialog>
  );
}
