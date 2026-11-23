/**
 * 手机顶栏（重设计 P5，768px 以下）：菜单（打开侧边栏抽屉）· 会话标题 · 任务（右栏）· 新对话。
 * 手机上它取代会话顶栏（ConversationHeader），只留一条。
 */
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Menu, PanelRightOpen, SquarePen } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import { useChatStore } from "../../stores/chat";
import { useDockStore } from "../../stores/dock";
import { useLayoutStore } from "../../stores/layout";
import { useTaskCount } from "../dock/RightDock";
import { useT } from "../../i18n";
import { ConversationMenu, ConversationTitle } from "../chat/ConversationMenu";

const iconButton = "inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

export function MobileTopBar() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const setDrawerOpen = useLayoutStore((s) => s.setDrawerOpen);
  const conversationId = useChatStore((s) => s.currentConversationId);
  // 右栏只在有内容的会话里出现（和桌面一致）
  const inConversation = useChatStore((s) => s.view.messages.length > 0 || s.isGenerating) && location.pathname === "/" && !!conversationId;
  const createConversation = useChatStore((s) => s.createConversation);
  const toggleDock = useDockStore((s) => s.toggleDock);
  const count = useTaskCount();
  const [editing, setEditing] = useState(false);

  return (
    <div className="flex h-12 flex-none items-center gap-1 border-b border-border bg-background px-2" data-testid="mobile-top-bar">
      <button type="button" className={iconButton} onClick={() => setDrawerOpen(true)} aria-label={t("sidebar.expand")}>
        <Menu className="h-5 w-5" />
      </button>
      {inConversation ? (
        <ConversationTitle conversationId={conversationId!} editing={editing} onDone={() => setEditing(false)} className="px-1" />
      ) : (
        <span className="min-w-0 flex-1 truncate px-1 text-sm font-medium text-foreground">
          {location.pathname.startsWith("/settings") ? t("settingsNav.title") : "LeoChat"}
        </span>
      )}
      {inConversation && <ConversationMenu onRename={() => setEditing(true)} />}
      {inConversation && (
        <button
          type="button"
          onClick={() => toggleDock(conversationId!)}
          aria-label={count ? `任务 ${count}` : "任务"}
          className={cn(iconButton, "relative", count > 0 && "text-primary")}
        >
          <PanelRightOpen className="h-5 w-5" />
          {count > 0 && (
            <span className="absolute right-1 top-1 rounded-full bg-primary px-1 text-[10px] leading-4 text-primary-foreground">{count}</span>
          )}
        </button>
      )}
      <button
        type="button"
        className={iconButton}
        onClick={() => {
          void createConversation();
          if (location.pathname !== "/") navigate("/");
        }}
        aria-label={t("sidebar.newChat")}
      >
        <SquarePen className="h-5 w-5" />
      </button>
    </div>
  );
}
