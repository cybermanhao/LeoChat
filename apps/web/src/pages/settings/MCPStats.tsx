import { MCPStatsTab } from "../../components/mcp/MCPStatsTab";

export function MCPStatsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="px-6 py-4">
          <h1 className="text-xl font-bold">MCP 统计</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            查看 MCP 服务器的统计信息
          </p>
        </div>
      </div>
      <div className="p-6">
        <div className="bg-card rounded-lg border overflow-hidden">
          <MCPStatsTab />
        </div>
      </div>
    </div>
  );
}
