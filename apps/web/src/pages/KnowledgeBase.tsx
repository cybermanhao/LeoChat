import { Database, Plus, FolderOpen, FileText } from "lucide-react";
import { Button } from "@ai-chatbox/ui";
import { t } from "../i18n";
import {
  ThreeColumnLayout,
  LeftDrawer,
  LeftDrawerHeader,
  LeftDrawerContent,
} from "../components/layout";

// 知识库侧边栏
function KnowledgeBaseSidebar() {
  return (
    <LeftDrawer>
      <LeftDrawerHeader
        title={t("knowledge.listTitle")}
        actions={
          <Button variant="ghost" size="icon" disabled>
            <Plus className="h-4 w-4" />
          </Button>
        }
      />
      <LeftDrawerContent>
        <div className="p-2 space-y-1">
          {/* 示例知识库项 */}
          <div className="p-3 rounded-md text-muted-foreground text-sm text-center">
            暂无知识库
          </div>
        </div>
      </LeftDrawerContent>
    </LeftDrawer>
  );
}

export function KnowledgeBasePage() {
  return (
    <ThreeColumnLayout leftDrawer={<KnowledgeBaseSidebar />} leftDrawerWidth={240}>
      <div className="h-full flex flex-col items-center justify-center p-6">
        <Database className="h-16 w-16 text-muted-foreground/40 mb-4" />
        <h2 className="text-lg font-semibold mb-2">知识库功能开发中</h2>
        <p className="text-sm text-muted-foreground mb-6 text-center max-w-md">
          知识库功能正在开发中，敬请期待。将支持本地文档索引、向量检索等功能。
        </p>
        <Button disabled className="gap-2">
          <Plus className="h-4 w-4" />
          添加知识库
        </Button>
      </div>
    </ThreeColumnLayout>
  );
}
