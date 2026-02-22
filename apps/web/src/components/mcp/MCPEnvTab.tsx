import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, Loader2, ExternalLink, RefreshCw, Copy, Check } from "lucide-react";
import { cn, Button } from "@ai-chatbox/ui";
import { envApi, type EnvToolStatus } from "../../lib/api";

/** 清理版本字符串：去掉工具名前缀和 git hash */
function cleanVersion(raw: string): string {
  let v = raw.replace(/^[a-zA-Z][a-zA-Z0-9._-]*\s+/, ""); // 去掉单词前缀（如 "uvx "）
  v = v.replace(/\s*\(.*$/, "");                            // 去掉括号内容（git hash）
  return v.trim();
}

interface ToolMeta {
  id: string;
  description: string;
  installUrl: string;
  installCmd: string;
}

const TOOL_META: ToolMeta[] = [
  {
    id: "npx",
    description: "Node.js 自带的包执行工具，运行 npx 类 MCP 服务器",
    installUrl: "https://nodejs.org/",
    installCmd: "winget install OpenJS.NodeJS",
  },
  {
    id: "node",
    description: "JavaScript 运行时，npx 类 MCP 服务器所需",
    installUrl: "https://nodejs.org/",
    installCmd: "winget install OpenJS.NodeJS",
  },
  {
    id: "uvx",
    description: "Python 包执行工具，运行 uvx 类 MCP 服务器",
    installUrl: "https://docs.astral.sh/uv/",
    installCmd: "pip install uv",
  },
  {
    id: "uv",
    description: "快速 Python 包管理器，uvx 类 MCP 服务器所需",
    installUrl: "https://docs.astral.sh/uv/",
    installCmd: "pip install uv",
  },
  {
    id: "python",
    description: "Python 运行时，uvx / mcp CLI 所需",
    installUrl: "https://www.python.org/downloads/",
    installCmd: "winget install Python.Python.3",
  },
  {
    id: "bun",
    description: "快速的 JavaScript/TypeScript 运行时",
    installUrl: "https://bun.sh/",
    installCmd: 'powershell -c "irm bun.sh/install.ps1 | iex"',
  },
  {
    id: "mcp",
    description: "MCP Python SDK，支持 mcp run 命令启动服务器",
    installUrl: "https://github.com/modelcontextprotocol/python-sdk",
    installCmd: "pip install mcp",
  },
];

export function MCPEnvTab() {
  const [tools, setTools] = useState<EnvToolStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
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
    fetchStatus();
  }, [fetchStatus]);

  const handleInstall = (url: string) => {
    window.open(url, "_blank");
  };

  const handleCopy = async (id: string, cmd: string) => {
    await navigator.clipboard.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const installedCount = tools.filter((t) => t.installed).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-9 border-b shrink-0">
        <span className="text-xs font-medium text-muted-foreground">
          运行环境
          {!loading && (
            <span className="ml-1.5 text-[10px]">
              ({installedCount}/{TOOL_META.length} 已安装)
            </span>
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={fetchStatus}
          title="刷新"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          TOOL_META.map((meta) => {
            const tool = tools.find((t) => t.id === meta.id);
            const installed = tool?.installed ?? false;
            const version = tool?.version ?? null;
            const name = tool?.name ?? meta.id;
            const isCopied = copiedId === meta.id;

            return (
              <div
                key={meta.id}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md border",
                  installed
                    ? "bg-green-500/5 border-green-500/20"
                    : "bg-muted/20 border-border"
                )}
              >
                {/* Status icon */}
                {installed ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                )}

                {/* Name + version / description */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xs font-semibold">{name}</span>
                    {version && (
                      <span className="text-[10px] text-muted-foreground font-mono truncate">
                        {cleanVersion(version)}
                      </span>
                    )}
                  </div>
                  {!installed && (
                    <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {meta.description}
                    </p>
                  )}
                </div>

                {/* Actions — only when not installed */}
                {!installed && (
                  <div className="flex items-center gap-1 shrink-0">
                    {/* Open install page */}
                    <button
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                      onClick={() => handleInstall(meta.installUrl)}
                      title="打开安装页面"
                    >
                      <ExternalLink className="h-3 w-3" />
                      安装
                    </button>

                    {/* Copy install command */}
                    <button
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-[10px] transition-colors",
                        isCopied
                          ? "bg-green-500/10 text-green-600"
                          : "bg-muted hover:bg-muted/80 text-muted-foreground"
                      )}
                      onClick={() => handleCopy(meta.id, meta.installCmd)}
                      title={meta.installCmd}
                    >
                      {isCopied ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                      {isCopied ? "已复制" : "命令"}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer hint */}
      {!loading && (
        <div className="px-3 py-2 border-t shrink-0">
          <p className="text-[10px] text-muted-foreground">
            复制安装命令后，在终端中执行即可安装
          </p>
        </div>
      )}
    </div>
  );
}
