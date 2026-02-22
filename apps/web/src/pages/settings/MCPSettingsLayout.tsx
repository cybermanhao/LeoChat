import { useState, useEffect, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { Plus, CheckCircle2, XCircle, ExternalLink, Copy, Check, Loader2 } from "lucide-react";
import { Button, Separator, cn } from "@ai-chatbox/ui";
import {
  ThreeColumnLayout,
  LeftDrawer,
  LeftDrawerHeader,
  LeftDrawerContent,
} from "../../components/layout/ThreeColumnLayout";
import { envApi, type EnvToolStatus } from "../../lib/api";

/** 清理版本字符串：去掉工具名前缀和 git hash */
function cleanVersion(raw: string): string {
  let v = raw.replace(/^[a-zA-Z][a-zA-Z0-9._-]*\s+/, "");
  v = v.replace(/\s*\(.*$/, "");
  return v.trim();
}

const ENV_META: Array<{
  id: string;
  label: string;
  installUrl: string;
  installCmd: string;
}> = [
  { id: "npx",    label: "npx",     installUrl: "https://nodejs.org/",                installCmd: "winget install OpenJS.NodeJS" },
  { id: "node",   label: "Node.js", installUrl: "https://nodejs.org/",                installCmd: "winget install OpenJS.NodeJS" },
  { id: "uvx",    label: "uvx",     installUrl: "https://docs.astral.sh/uv/",         installCmd: "pip install uv" },
  { id: "uv",     label: "uv",      installUrl: "https://docs.astral.sh/uv/",         installCmd: "pip install uv" },
  { id: "python", label: "Python",  installUrl: "https://www.python.org/downloads/",  installCmd: "winget install Python.Python.3" },
  { id: "bun",    label: "Bun",     installUrl: "https://bun.sh/",                    installCmd: 'powershell -c "irm bun.sh/install.ps1 | iex"' },
  { id: "mcp",    label: "MCP CLI", installUrl: "https://github.com/modelcontextprotocol/python-sdk", installCmd: "pip install mcp" },
];

function MCPSidebar() {
  const navigate = useNavigate();
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

  useEffect(() => {
    fetchEnv();
  }, [fetchEnv]);

  const handleCopy = async (id: string, cmd: string) => {
    await navigator.clipboard.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <LeftDrawer>
      <LeftDrawerHeader title="MCP 管理" />

      <LeftDrawerContent>
        <div className="p-3 space-y-4">
          {/* 添加 MCP 按钮 */}
          <Button
            className="w-full gap-2"
            onClick={() => navigate("/mcp/servers/add")}
          >
            <Plus className="h-4 w-4" />
            添加 MCP
          </Button>

          <Separator />

          {/* 环境安装 */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-3 px-1">
              环境安装
            </h3>
            <div className="space-y-1">
              {loading ? (
                <div className="flex items-center justify-center py-3">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : (
                ENV_META.map((meta) => {
                  const tool = tools.find((t) => t.id === meta.id);
                  const installed = tool?.installed ?? false;
                  const version = tool?.version;
                  const isCopied = copiedId === meta.id;

                  return (
                    <div key={meta.id} className="px-1 py-1">
                      <div className="flex items-center gap-2">
                        {installed ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                        )}
                        <span className="text-sm font-medium w-14 shrink-0">{meta.label}</span>
                        {installed && version ? (
                          <span className="flex-1 text-xs text-muted-foreground font-mono truncate">
                            {cleanVersion(version)}
                          </span>
                        ) : (
                          <span className="flex-1 text-xs text-muted-foreground">未安装</span>
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
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </LeftDrawerContent>
    </LeftDrawer>
  );
}

export function MCPSettingsLayout() {
  return (
    <ThreeColumnLayout leftDrawer={<MCPSidebar />}>
      <Outlet />
    </ThreeColumnLayout>
  );
}
