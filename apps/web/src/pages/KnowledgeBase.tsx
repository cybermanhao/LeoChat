import { useT } from "../i18n";
import {
  ThreeColumnLayout,
  LeftDrawer,
  LeftDrawerHeader,
  LeftDrawerContent,
} from "../components/layout";
import { LawKnowledgeTab } from "../components/mcp/LawKnowledgeTab";

function KnowledgeBaseSidebar() {
  const { t } = useT();
  return (
    <LeftDrawer>
      <LeftDrawerHeader title={t("knowledge.listTitle")} />
      <LeftDrawerContent>
        <div className="p-2 space-y-1">
          <div className="p-3 rounded-md bg-accent/50 text-sm font-medium cursor-default">
            法律知识库
          </div>
        </div>
      </LeftDrawerContent>
    </LeftDrawer>
  );
}

export function KnowledgeBasePage() {
  return (
    <ThreeColumnLayout leftDrawer={<KnowledgeBaseSidebar />} leftDrawerWidth={200}>
      <LawKnowledgeTab />
    </ThreeColumnLayout>
  );
}
