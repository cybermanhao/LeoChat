/**
 * 会话顶栏（重设计 P4）：只有会话标题和右栏开关（按 dsh：右栏收起时，顶栏角上的按钮是唯一的入口）。
 * 有进行中的任务时按钮亮起并显示数量。
 */
import { PanelRightOpen } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import { useChatStore } from "../../stores/chat";
import { useDockEntry, useDockStore } from "../../stores/dock";
import { useTaskCount } from "../dock/RightDock";

export function ConversationHeader({ conversationId }: { conversationId: string }) {
  const title = useChatStore((s) => s.conversations.find((c) => c.id === conversationId)?.title || "新对话");
  const open = useDockEntry(conversationId).open;
  const toggle = useDockStore((s) => s.toggleDock);
  const count = useTaskCount();

  return (
    <div className="flex h-11 flex-none items-center gap-2 border-b border-border px-4" data-testid="conversation-header">
      <h1 className="min-w-0 flex-1 truncate text-sm font-medium text-foreground" title={title}>
        {title}
      </h1>
      {!open && (
        <button
          type="button"
          onClick={() => toggle(conversationId)}
          title="打开右栏（任务、工具）"
          aria-label={count ? `任务 ${count}` : "任务"}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors",
            count > 0 ? "bg-primary/10 text-primary hover:bg-primary/15" : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          data-testid="dock-toggle"
        >
          <PanelRightOpen className="h-4 w-4" />
          任务
          {count > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] leading-4 text-primary-foreground">{count}</span>}
        </button>
      )}
    </div>
  );
}
