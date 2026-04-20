import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Server, FileJson, FormInput } from "lucide-react";
import { Button, cn } from "@ai-chatbox/ui";
import { useT } from "../../i18n";
import { useMCPStore } from "../../stores/mcp";
import { ServerForm } from "../../components/mcp/ServerForm";
import { McpJsonImporter } from "../../components/mcp/McpJsonImporter";
import type { MCPServerConfigValidated } from "@ai-chatbox/shared";

export function MCPServerAddPage() {
  const { t } = useT();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const addServer = useMCPStore((s) => s.addServer);
  const setAutoConnect = useMCPStore((s) => s.setAutoConnect);
  const [isSaving, setIsSaving] = useState(false);
  const [mode, setMode] = useState<"form" | "json">(() => {
    return searchParams.get("mode") === "json" ? "json" : "form";
  });

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

  const handleJsonImport = (servers: MCPServerConfigValidated[]) => {
    servers.forEach((config, index) => {
      const serverId = `custom-${Date.now()}-${index}`;
      addServer("custom", {
        ...config,
        id: serverId,
      });
      if (config.autoConnect) {
        setAutoConnect(serverId, true);
      }
    });
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
              <h1 className="text-xl font-bold">{t("mcp.addServer")}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {t("mcp.serverAdd.subtitle")}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 max-w-5xl mx-auto px-6 py-6 w-full">
        <div className="bg-card rounded-lg border p-6">
          {/* Mode tabs */}
          <div className="flex items-center gap-1 mb-6 p-1 rounded-lg bg-muted/50 border">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "form"}
              onClick={() => setMode("form")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                mode === "form"
                  ? "bg-card text-foreground shadow-sm border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FormInput className="h-4 w-4" />
              {t("mcp.jsonImport.tabForm")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "json"}
              onClick={() => setMode("json")}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                mode === "json"
                  ? "bg-card text-foreground shadow-sm border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <FileJson className="h-4 w-4" />
              {t("mcp.jsonImport.tabJson")}
            </button>
          </div>

          {mode === "form" ? (
            <>
              <div className="flex items-start gap-4 mb-6 p-4 rounded-lg bg-primary/5 border border-primary/10">
                <Server className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-foreground mb-1">{t("mcp.serverAdd.infoTitle")}</p>
                  <p className="text-muted-foreground">
                    {t("mcp.serverAdd.infoDesc")}
                  </p>
                </div>
              </div>

              <ServerForm
                onSubmit={handleSave}
                onCancel={handleCancel}
                submitLabel={isSaving ? t("mcp.adding") : t("mcp.addServer")}
              />
            </>
          ) : (
            <>
              <div className="flex items-start gap-4 mb-6 p-4 rounded-lg bg-primary/5 border border-primary/10">
                <FileJson className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-foreground mb-1">{t("mcp.jsonImport.infoTitle")}</p>
                  <p className="text-muted-foreground">
                    {t("mcp.jsonImport.infoDesc")}
                  </p>
                </div>
              </div>

              <McpJsonImporter
                onImport={handleJsonImport}
                onCancel={handleCancel}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
