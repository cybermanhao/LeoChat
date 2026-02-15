import { useState } from "react";
import { Settings as SettingsIcon, Palette, Globe, Key, Bell, Shield, Zap } from "lucide-react";
import { Button, cn } from "@ai-chatbox/ui";
import {
  ThreeColumnLayout,
  LeftDrawer,
  LeftDrawerHeader,
  LeftDrawerContent,
} from "../components/layout";
import { AppearanceSettings } from "./settings/AppearanceSettings";
import { LLMSettings } from "./settings/LLMSettings";
import { t } from "../i18n";

interface SettingCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const settingCategories: SettingCategory[] = [
  { id: "appearance", label: t("common.appearance"), icon: Palette },
  { id: "llm", label: t("settings.model.title"), icon: Globe },
  { id: "notifications", label: t("settings.notifications.title"), icon: Bell },
  { id: "privacy", label: t("settings.privacy.title"), icon: Shield },
  { id: "advanced", label: t("settings.advanced.title"), icon: Zap },
];

// 设置侧边栏
function SettingsSidebar({ currentCategory, onSelectCategory }: {
  currentCategory: string;
  onSelectCategory: (id: string) => void;
}) {
  return (
    <LeftDrawer>
      <LeftDrawerHeader title={t("common.settings")} />
      <LeftDrawerContent>
        <div className="p-2 space-y-1">
          {settingCategories.map((category) => {
            const Icon = category.icon;
            const isActive = currentCategory === category.id;
            return (
              <Button
                key={category.id}
                variant="ghost"
                className={cn(
                  "w-full justify-start gap-2",
                  isActive && "bg-accent"
                )}
                onClick={() => onSelectCategory(category.id)}
              >
                <Icon className="h-4 w-4" />
                {category.label}
              </Button>
            );
          })}
        </div>
      </LeftDrawerContent>
    </LeftDrawer>
  );
}

export function SettingsPage() {
  const [currentCategory, setCurrentCategory] = useState("appearance");

  const getCategoryContent = () => {
    switch (currentCategory) {
      case "appearance":
        return <AppearanceSettings />;
      case "llm":
        return <LLMSettings />;
      default:
        return (
          <div>
            <h2 className="text-xl font-bold mb-4">{settingCategories.find(c => c.id === currentCategory)?.label}</h2>
            <p className="text-muted-foreground">{t("error.notImplemented")}</p>
          </div>
        );
    }
  };

  return (
    <ThreeColumnLayout
      leftDrawer={
        <SettingsSidebar
          currentCategory={currentCategory}
          onSelectCategory={setCurrentCategory}
        />
      }
      leftDrawerWidth={200}
    >
      <div className="h-full overflow-y-auto p-6">
        <div className="max-w-3xl">
          {getCategoryContent()}

          {/* Coming Soon Notice - 仅在未实装页面显示 */}
          {currentCategory !== "appearance" && currentCategory !== "llm" && (
            <div className="mt-8 p-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
              <div className="flex items-start gap-3">
                <SettingsIcon className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                    {t("settings.developmentNotice")}
                  </h4>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    {t("settings.developmentNoticeDesc")}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </ThreeColumnLayout>
  );
}
