import { Outlet, useNavigate } from "react-router-dom";
import { Plus, CheckCircle2 } from "lucide-react";
import { Button, Separator } from "@ai-chatbox/ui";
import {
  ThreeColumnLayout,
  LeftDrawer,
  LeftDrawerHeader,
  LeftDrawerContent,
} from "../../components/layout/ThreeColumnLayout";

function MCPSidebar() {
  const navigate = useNavigate();

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
            <div className="space-y-2">
              {/* NPX */}
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  npx
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  已安装
                </span>
              </div>

              {/* UV */}
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-green-500/10">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  uv
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  已安装
                </span>
              </div>
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
