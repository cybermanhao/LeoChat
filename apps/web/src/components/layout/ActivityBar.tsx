import { useNavigate, useLocation } from "react-router-dom";
import { MessageSquare, Server, Database, Settings } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import { t } from "../../i18n";

interface ActivityItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  badge?: number;
}

const activities: ActivityItem[] = [
  {
    id: "chat",
    label: t("nav.chat"),
    icon: MessageSquare,
    path: "/",
  },
  {
    id: "mcp",
    label: "MCP",
    icon: Server,
    path: "/mcp/servers",
  },
  {
    id: "knowledge",
    label: t("nav.knowledge"),
    icon: Database,
    path: "/knowledge",
  },
  {
    id: "settings",
    label: t("nav.settings"),
    icon: Settings,
    path: "/settings",
  },
];

export function ActivityBar() {
  const navigate = useNavigate();
  const location = useLocation();

  const getIsActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/";
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="w-12 h-full bg-muted/30 border-r flex flex-col items-center py-2">
      {activities.map((activity) => {
        const Icon = activity.icon;
        const isActive = getIsActive(activity.path);

        return (
          <button
            key={activity.id}
            onClick={() => navigate(activity.path)}
            className={cn(
              "relative w-12 h-12 flex flex-col items-center justify-center gap-0.5 transition-colors group",
              isActive
                ? "text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
            title={activity.label}
          >
            {/* Active indicator */}
            {isActive && (
              <div className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-6 bg-primary rounded-r" />
            )}

            {/* Icon */}
            <Icon className="h-6 w-6" />

            {/* Badge */}
            {activity.badge !== undefined && activity.badge > 0 && (
              <div className="absolute top-1 right-1 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                {activity.badge > 99 ? "99+" : activity.badge}
              </div>
            )}

            {/* Tooltip (optional, can be enhanced) */}
            <span className="sr-only">{activity.label}</span>
          </button>
        );
      })}

      {/* Spacer to push settings to bottom */}
      <div className="flex-1" />
    </div>
  );
}
