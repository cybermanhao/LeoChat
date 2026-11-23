import { useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Plus, FileJson, ExternalLink, Copy, Check } from "lucide-react";
import { Button, cn } from "@ai-chatbox/ui";
import { useT } from "../../i18n";

/** MCP 在设置里的路由前缀（原来是一级页面 /mcp） */
export const MCP_BASE = "/settings/mcp";

const ENV_META: Array<{
  id: string;
  label: string;
  installUrl: string;
  installCmd: string;
}> = [
  { id: "node",   label: "Node.js / npx", installUrl: "https://nodejs.org/",                installCmd: "winget install OpenJS.NodeJS" },
  { id: "uv",     label: "uv / uvx",      installUrl: "https://docs.astral.sh/uv/",         installCmd: "pip install uv" },
  { id: "python", label: "Python",        installUrl: "https://www.python.org/downloads/",  installCmd: "winget install Python.Python.3" },
  { id: "bun",    label: "Bun",           installUrl: "https://bun.sh/",                    installCmd: 'powershell -c "irm bun.sh/install.ps1 | iex"' },
  { id: "mcp",    label: "MCP CLI",       installUrl: "https://github.com/modelcontextprotocol/python-sdk", installCmd: "pip install mcp" },
];

/**
 * 运行环境：启动 STDIO 服务器需要的命令行工具。
 * 不显示"已安装 / 未安装"：服务端的环境检测接口因信息泄露风险已移除，前端无法得知真实状态，显示了反而误导。
 */
function EnvTable() {
  const { t } = useT();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (id: string, cmd: string) => {
    await navigator.clipboard.writeText(cmd);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <section className="mt-8">
      <h3 className="text-sm font-semibold text-foreground">{t("mcp.tabs.env")}</h3>
      <div className="mt-3 rounded-lg border border-border overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {ENV_META.map((meta) => {
              const isCopied = copiedId === meta.id;
              return (
                <tr key={meta.id} className="border-b border-border last:border-b-0">
                  <td className="px-3 py-2 font-medium text-foreground">{meta.label}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground font-mono truncate max-w-[16rem]" title={meta.installCmd}>
                    {meta.installCmd}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <button
                        className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        onClick={() => window.open(meta.installUrl, "_blank")}
                      >
                        <ExternalLink className="h-3 w-3" />
                        {t("settingsNav.envInstall")}
                      </button>
                      <button
                        className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                          isCopied ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground hover:text-foreground",
                        )}
                        onClick={() => void handleCopy(meta.id, meta.installCmd)}
                      >
                        {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        {t("settingsNav.envCopy")}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** 设置里的 MCP 分区：标题 + 操作 + 标签页；服务器页下方显示运行环境 */
export function MCPSettingsLayout() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = [
    { path: "servers", label: t("mcp.tabs.servers") },
    { path: "tools", label: t("mcp.tabs.tools") },
    { path: "resources", label: t("mcp.tabs.resources") },
    { path: "prompts", label: t("mcp.tabs.prompts") },
    { path: "stats", label: t("mcp.tabs.stats") },
  ];
  const onServerList = location.pathname === `${MCP_BASE}/servers` || location.pathname === `${MCP_BASE}/servers/`;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-foreground">MCP</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("settingsNav.mcpDesc")}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => navigate(`${MCP_BASE}/servers/add?mode=json`)}>
          <FileJson className="h-4 w-4" />
          {t("mcp.jsonImport.fromJson")}
        </Button>
        <Button size="sm" className="gap-1.5 shrink-0" onClick={() => navigate(`${MCP_BASE}/servers/add`)}>
          <Plus className="h-4 w-4" />
          {t("mcp.addServer")}
        </Button>
      </div>

      <nav className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <NavLink
            key={tab.path}
            to={`${MCP_BASE}/${tab.path}`}
            className={({ isActive }) =>
              cn(
                "px-3 py-2 text-sm -mb-px border-b-2 transition-colors",
                isActive ? "border-primary text-foreground font-medium" : "border-transparent text-muted-foreground hover:text-foreground",
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div>
        <Outlet />
      </div>

      {onServerList && <EnvTable />}
    </div>
  );
}
