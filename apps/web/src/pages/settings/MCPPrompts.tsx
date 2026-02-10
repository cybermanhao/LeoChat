import { MCPPromptsTab } from "../../components/mcp/MCPPromptsTab";

export function MCPPromptsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="px-6 py-4">
          <h1 className="text-xl font-bold">MCP Prompts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            查看所有已连接服务器提供的 Prompts
          </p>
        </div>
      </div>
      <div className="p-6">
        <div className="bg-card rounded-lg border overflow-hidden">
          <MCPPromptsTab />
        </div>
      </div>
    </div>
  );
}
