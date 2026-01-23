import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
} from "@ai-chatbox/ui";
import {
  Server,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";

interface MCPServer {
  id: string;
  name: string;
  url: string;
  status: "connected" | "disconnected" | "connecting" | "error";
  tools?: number;
}

interface MCPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MCPDialog({ open, onOpenChange }: MCPDialogProps) {
  const [servers, setServers] = useState<MCPServer[]>([
    {
      id: "1",
      name: "Local MCP Server",
      url: "http://localhost:3001/mcp",
      status: "disconnected",
      tools: 5,
    },
  ]);
  const [newServerUrl, setNewServerUrl] = useState("");
  const [newServerName, setNewServerName] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const handleConnect = async (serverId: string) => {
    setServers((prev) =>
      prev.map((s) =>
        s.id === serverId ? { ...s, status: "connecting" as const } : s
      )
    );

    // TODO: 实际连接 MCP 服务器
    await new Promise((resolve) => setTimeout(resolve, 1000));

    setServers((prev) =>
      prev.map((s) =>
        s.id === serverId ? { ...s, status: "connected" as const } : s
      )
    );
  };

  const handleDisconnect = async (serverId: string) => {
    setServers((prev) =>
      prev.map((s) =>
        s.id === serverId ? { ...s, status: "disconnected" as const } : s
      )
    );
  };

  const handleRemove = (serverId: string) => {
    setServers((prev) => prev.filter((s) => s.id !== serverId));
  };

  const handleAdd = () => {
    if (!newServerUrl.trim()) return;

    const newServer: MCPServer = {
      id: Date.now().toString(),
      name: newServerName.trim() || new URL(newServerUrl).hostname,
      url: newServerUrl.trim(),
      status: "disconnected",
    };

    setServers((prev) => [...prev, newServer]);
    setNewServerUrl("");
    setNewServerName("");
    setIsAdding(false);
  };

  const getStatusIcon = (status: MCPServer["status"]) => {
    switch (status) {
      case "connected":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "connecting":
        return <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />;
      case "error":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <XCircle className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusText = (status: MCPServer["status"]) => {
    switch (status) {
      case "connected":
        return "已连接";
      case "connecting":
        return "连接中...";
      case "error":
        return "连接失败";
      default:
        return "未连接";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            MCP 服务管理
          </DialogTitle>
          <DialogDescription>
            管理 Model Context Protocol 服务器连接
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 服务器列表 */}
          <div className="space-y-2">
            {servers.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                <Server className="mx-auto mb-2 h-8 w-8" />
                <p>暂无 MCP 服务器</p>
                <p className="text-sm">点击下方按钮添加服务器</p>
              </div>
            ) : (
              servers.map((server) => (
                <div
                  key={server.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(server.status)}
                    <div>
                      <div className="font-medium">{server.name}</div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{server.url}</span>
                        {server.status === "connected" && server.tools && (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                            {server.tools} 工具
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="mr-2 text-xs text-muted-foreground">
                      {getStatusText(server.status)}
                    </span>
                    {server.status === "connected" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDisconnect(server.id)}
                      >
                        断开
                      </Button>
                    ) : server.status === "connecting" ? (
                      <Button variant="ghost" size="sm" disabled>
                        <Loader2 className="h-4 w-4 animate-spin" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleConnect(server.id)}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        连接
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemove(server.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* 添加新服务器 */}
          {isAdding ? (
            <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
              <input
                type="text"
                placeholder="服务器名称（可选）"
                value={newServerName}
                onChange={(e) => setNewServerName(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <input
                type="url"
                placeholder="服务器地址，如 http://localhost:3001/mcp"
                value={newServerUrl}
                onChange={(e) => setNewServerUrl(e.target.value)}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              />
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsAdding(false);
                    setNewServerUrl("");
                    setNewServerName("");
                  }}
                >
                  取消
                </Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newServerUrl.trim()}
                >
                  添加
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setIsAdding(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              添加 MCP 服务器
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
