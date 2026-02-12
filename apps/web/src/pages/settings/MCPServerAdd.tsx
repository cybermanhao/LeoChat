import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Server } from "lucide-react";
import { Button } from "@ai-chatbox/ui";
import { useMCPStore } from "../../stores/mcp";
import { ServerForm } from "../../components/mcp/ServerForm";
import type { MCPServerConfigValidated } from "@ai-chatbox/shared";

export function MCPServerAddPage() {
  const navigate = useNavigate();
  const addServer = useMCPStore((s) => s.addServer);
  const setAutoConnect = useMCPStore((s) => s.setAutoConnect);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async (data: MCPServerConfigValidated) => {
    setIsSaving(true);
    try {
      // 生成唯一 ID
      const serverId = `custom-${Date.now()}`;

      // 添加到自定义服务器列表
      addServer("custom", {
        ...data,
        id: serverId,
      });

      // 同步 autoConnect 到 autoConnectServerIds
      if (data.autoConnect) {
        setAutoConnect(serverId, true);
      }

      // 导航回服务器列表
      navigate("/mcp/servers");

      console.log("Server added successfully:", serverId);
    } catch (error) {
      console.error("Failed to add server:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    navigate("/mcp/servers");
  };

  return (
    <div className="h-full flex flex-col overflow-y-auto bg-background">
      {/* Header */}
      <div className="flex-none border-b bg-card">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={handleCancel}
              className="h-9 w-9"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">添加 MCP 服务器</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                配置新的模型上下文协议服务器
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-5xl mx-auto px-6 py-6 w-full">
        <div className="bg-card rounded-lg border p-6">
          <div className="flex items-start gap-4 mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200">
            <Server className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 mb-1">添加 MCP 服务器</p>
              <p className="text-blue-700">
                填写以下信息以添加新的 MCP 服务器。STDIO 类型适用于本地进程通信，HTTP
                类型适用于远程服务器连接。
              </p>
            </div>
          </div>

          <ServerForm
            onSubmit={handleSave}
            onCancel={handleCancel}
            submitLabel={isSaving ? "添加中..." : "添加服务器"}
          />
        </div>
      </div>
    </div>
  );
}
