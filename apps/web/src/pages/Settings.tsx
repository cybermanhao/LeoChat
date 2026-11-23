import { NavLink, Navigate, Outlet, useLocation, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Github, Globe, Info, Mail, Palette, Server, Wifi, Zap } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import { useOnboardingStore } from "../stores/onboarding";
import { useI18nStore, LOCALES } from "../stores/i18n";
import { useChatStore } from "../stores/chat";
import { useT } from "../i18n";
import type { TranslationKey } from "../lib/i18n";

/**
 * 设置（按 dsh：从侧边栏底部进入，覆盖主区域，侧边栏保留）。
 * 分区：通用 · 外观 · 模型 · MCP · 网络 · 关于。MCP 原来是一级页面，现在是 /settings/mcp/*。
 */
const SECTIONS: Array<{ path: string; label: TranslationKey; icon: React.ComponentType<{ className?: string }> }> = [
  { path: "general", label: "settingsNav.general", icon: Zap },
  { path: "appearance", label: "settingsNav.appearance", icon: Palette },
  { path: "model", label: "settingsNav.model", icon: Globe },
  { path: "mcp", label: "settingsNav.mcp", icon: Server },
  { path: "network", label: "settingsNav.network", icon: Wifi },
  { path: "about", label: "settingsNav.about", icon: Info },
];

export function SettingsLayout() {
  const { t } = useT();
  return (
    <div className="h-full flex overflow-hidden bg-background">
      <nav className="w-48 shrink-0 border-r border-border p-3 overflow-y-auto" aria-label={t("settingsNav.title")}>
        <NavLink
          to="/"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 mb-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("settingsNav.backToChat")}
        </NavLink>
        <h1 className="px-2 pt-1 pb-3 text-base font-semibold text-foreground">{t("settingsNav.title")}</h1>
        <div className="space-y-0.5">
          {SECTIONS.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={`/settings/${path}`}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
                  isActive ? "bg-accent text-accent-foreground font-medium" : "text-foreground/80 hover:bg-muted",
                )
              }
            >
              <Icon className="h-4 w-4 text-muted-foreground" />
              {t(label)}
            </NavLink>
          ))}
        </div>
      </nav>
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-3xl px-8 py-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

/** 旧的 /settings?tab=xxx 链接跳到新路径 */
export function SettingsIndexRedirect() {
  const [params] = useSearchParams();
  const legacy: Record<string, string> = { general: "general", appearance: "appearance", llm: "model", network: "network" };
  return <Navigate to={`/settings/${legacy[params.get("tab") ?? ""] ?? "general"}`} replace />;
}

/**
 * 旧的 /mcp/* 链接跳到 /settings/mcp/*。
 * 从路由参数取剩余路径（不读 window.location：StrictMode 下副作用会跑两次，第二次地址已经变了）
 */
export function LegacyMcpRedirect() {
  const { "*": rest = "" } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/settings/mcp/${rest || "servers"}${search}`} replace />;
}

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-6 py-4 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{title}</div>
        {desc && <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function GeneralSettings() {
  const { t } = useT();
  const currentLocale = useI18nStore((s) => s.currentLocale);
  const setLocale = useI18nStore((s) => s.setLocale);
  const uiMode = useChatStore((s) => s.uiMode);
  const setUiMode = useChatStore((s) => s.setUiMode);

  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-2">{t("settingsNav.general")}</h2>
      <Row title={t("settingsNav.language")} desc={t("settingsNav.languageDesc")}>
        <select
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          value={currentLocale}
          onChange={(e) => setLocale(e.target.value as typeof currentLocale)}
        >
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.flag} {l.nativeName}
            </option>
          ))}
        </select>
      </Row>
      <Row title={t("settingsNav.uiMode")} desc={t("settingsNav.uiModeDesc")}>
        <div className="flex rounded-md border border-border overflow-hidden">
          {(["simple", "professional"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setUiMode(mode)}
              className={cn(
                "px-3 py-1.5 text-sm transition-colors",
                uiMode === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              {t(mode === "simple" ? "settingsNav.simple" : "settingsNav.professional")}
            </button>
          ))}
        </div>
      </Row>
      <Row title={t("settingsNav.onboarding")} desc={t("settingsNav.onboardingDesc")}>
        <button
          onClick={() => useOnboardingStore.getState().setOnboardingCompleted(false)}
          className="px-3 py-1.5 rounded-md border border-border text-sm text-foreground hover:bg-muted transition-colors"
        >
          {t("settingsNav.onboardingRun")}
        </button>
      </Row>
    </div>
  );
}

export function AboutSettings() {
  const { t } = useT();
  const link = "flex items-center gap-2 text-sm text-primary hover:underline";
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground mb-2">{t("settingsNav.about")}</h2>
      <p className="text-sm text-muted-foreground mb-4">{t("settingsNav.aboutDesc")}</p>
      <div className="space-y-3">
        <a className={link} href="https://github.com/cybermanhao/LeoChat" target="_blank" rel="noreferrer">
          <Github className="h-4 w-4" />
          {t("settingsNav.github")}
        </a>
        <a className={link} href="mailto:cybermanhao@gmail.com">
          <Mail className="h-4 w-4" />
          {t("settingsNav.feedback")}
        </a>
      </div>
    </div>
  );
}
