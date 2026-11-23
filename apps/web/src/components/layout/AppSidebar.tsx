import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { PanelLeftClose, PanelLeftOpen, SquarePen, Settings, Trash2 } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import { useChatStore } from "../../stores/chat";
import { useMCPStore } from "../../stores/mcp";
import { useLayoutStore } from "../../stores/layout";
import { useIsMobile } from "../../lib/use-media";
import { useT } from "../../i18n";
import type { TranslationKey } from "../../lib/i18n";

/**
 * 应用唯一的侧边栏（按 dsh 的 ui-sidebar）：品牌 + 新对话 + 折叠，会话按日期分组，设置固定在底部。
 * 收起后是 56px 的窄条，只留品牌、新对话和设置。
 */

type ConversationMeta = ReturnType<typeof useChatStore.getState>["conversations"][number];

const GROUPS: Array<{ key: TranslationKey; test: (age: number, sameDay: boolean, yesterday: boolean) => boolean }> = [
  { key: "sidebar.today", test: (_a, sameDay) => sameDay },
  { key: "sidebar.yesterday", test: (_a, _s, yesterday) => yesterday },
  { key: "sidebar.last7Days", test: (age) => age < 7 * 86_400_000 },
  { key: "sidebar.earlier", test: () => true },
];

/** 按"今天 / 昨天 / 最近 7 天 / 更早"分组，组内按最近更新排序 */
export function groupConversations(conversations: ConversationMeta[], now = Date.now()) {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const today0 = startOfToday.getTime();
  const yesterday0 = today0 - 86_400_000;
  const sorted = [...conversations].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const groups = GROUPS.map((g) => ({ key: g.key, items: [] as ConversationMeta[] }));
  for (const c of sorted) {
    const at = c.updatedAt ?? c.createdAt ?? 0;
    const index = GROUPS.findIndex((g) => g.test(now - at, at >= today0, at >= yesterday0 && at < today0));
    groups[index]!.items.push(c);
  }
  return groups.filter((g) => g.items.length > 0);
}

/** 已连接的服务器数：和输入框的 MCP 按钮、服务器卡片用同一个口径（enabledServerIds） */
function useConnectedServers(): number {
  return useMCPStore((s) => s.enabledServerIds.length);
}

const railButton =
  "h-9 w-9 shrink-0 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors";

export function AppSidebar() {
  const { t } = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const mobile = useIsMobile();
  const drawerOpen = useLayoutStore((s) => s.drawerOpen);
  const setDrawerOpen = useLayoutStore((s) => s.setDrawerOpen);
  // 手机上是抽屉，不收成窄条
  const collapsed = useLayoutStore((s) => s.sidebarCollapsed) && !mobile;
  const storeToggle = useLayoutStore((s) => s.toggleSidebar);
  const toggleSidebar = mobile ? () => setDrawerOpen(false) : storeToggle;
  /** 跳转后在手机上关掉抽屉 */
  const go = (path: string) => {
    if (mobile) setDrawerOpen(false);
    if (location.pathname !== path) navigate(path);
  };
  const conversations = useChatStore((s) => s.conversations);
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const setCurrentConversation = useChatStore((s) => s.setCurrentConversation);
  const createConversation = useChatStore((s) => s.createConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);
  const connected = useConnectedServers();
  const groups = useMemo(() => groupConversations(conversations), [conversations]);
  const inSettings = location.pathname.startsWith("/settings");

  const newChat = () => {
    void createConversation();
    go("/");
  };
  const openConversation = (id: string) => {
    setCurrentConversation(id);
    go("/");
  };

  if (mobile && !drawerOpen) return null;
  const aside = (
    <aside
      className={cn(
        "h-full shrink-0 bg-card border-r border-border flex flex-col overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
        collapsed ? "w-14" : "w-64",
        mobile && "fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] shadow-xl",
      )}
      data-testid="app-sidebar"
    >
      {/* 品牌 + 折叠 */}
      <div className={cn("flex items-center gap-2 pt-3 pb-2", collapsed ? "flex-col px-2" : "px-3")}>
        <button
          className="h-7 w-7 shrink-0 rounded-md bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center"
          onClick={collapsed ? toggleSidebar : () => go("/")}
          title={collapsed ? t("sidebar.expand") : "LeoChat"}
        >
          L
        </button>
        {!collapsed && <span className="flex-1 text-sm font-semibold text-foreground truncate">LeoChat</span>}
        <button
          className={cn(railButton, collapsed && "hidden")}
          onClick={toggleSidebar}
          title={t("sidebar.collapse")}
          aria-label={t("sidebar.collapse")}
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* 新对话 */}
      <div className={cn("pb-2", collapsed ? "px-2.5" : "px-3")}>
        {collapsed ? (
          <button className={railButton} onClick={newChat} title={t("sidebar.newChat")} aria-label={t("sidebar.newChat")}>
            <SquarePen className="h-4 w-4" />
          </button>
        ) : (
          <button
            onClick={newChat}
            className="w-full flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground hover:bg-muted transition-colors"
          >
            <SquarePen className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-left">{t("sidebar.newChat")}</span>
          </button>
        )}
      </div>

      {/* 会话列表 */}
      <nav className="flex-1 overflow-y-auto px-2 pb-2" aria-label={t("nav.chat")}>
        {!collapsed &&
          groups.map((group) => (
            <div key={group.key} className="mb-2">
              <div className="px-2 pt-2 pb-1 text-[11px] font-semibold text-muted-foreground">{t(group.key)}</div>
              {group.items.map((conv) => {
                const active = !inSettings && conv.id === currentConversationId;
                return (
                  <div
                    key={conv.id}
                    className={cn(
                      "group flex items-center rounded-md",
                      active ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-muted",
                    )}
                  >
                    <button
                      className="flex-1 min-w-0 text-left px-2 py-1.5 text-sm truncate"
                      onClick={() => openConversation(conv.id)}
                      title={conv.title || t("sidebar.untitledChat")}
                    >
                      {conv.title || t("sidebar.untitledChat")}
                    </button>
                    <button
                      className="mr-1 h-6 w-6 shrink-0 rounded flex items-center justify-center text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
                      onClick={() => void deleteConversation(conv.id)}
                      title={t("sidebar.deleteChat")}
                      aria-label={t("sidebar.deleteChat")}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
      </nav>

      {/* 底部：设置（MCP 连接数显示在这里） */}
      <div className={cn("border-t border-border p-2", collapsed && "flex flex-col items-center gap-1")}>
        {collapsed ? (
          <>
            <button className={railButton} onClick={toggleSidebar} title={t("sidebar.expand")} aria-label={t("sidebar.expand")}>
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <button
              className={cn(railButton, inSettings && "bg-accent text-foreground")}
              onClick={() => go("/settings")}
              title={t("nav.settings")}
              aria-label={t("nav.settings")}
            >
              <Settings className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => go("/settings")}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                inSettings ? "bg-accent text-accent-foreground" : "text-foreground/80 hover:bg-muted",
              )}
            >
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">{t("nav.settings")}</span>
            </button>
            {/* MCP 状态：输入框下不再放 MCP 面板（重设计 P3），从这里直达服务器页 */}
            <button
              onClick={() => go("/settings/mcp/servers")}
              title={t("sidebar.mcpConnected")}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", connected > 0 ? "bg-primary" : "bg-muted-foreground/40")} />
              {t("sidebar.mcpStatus", { count: connected })}
            </button>
          </div>
        )}
      </div>
    </aside>
  );
  if (!mobile) return aside;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60" onClick={() => setDrawerOpen(false)} aria-hidden />
      {aside}
    </>
  );
}
