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

interface SettingCategory {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const settingCategories: SettingCategory[] = [
  { id: "appearance", label: "外观", icon: Palette },
  { id: "model", label: "语言模型", icon: Globe },
  { id: "api", label: "API 密钥", icon: Key },
  { id: "notifications", label: "通知", icon: Bell },
  { id: "privacy", label: "隐私与安全", icon: Shield },
  { id: "advanced", label: "高级", icon: Zap },
];

// 设置侧边栏
function SettingsSidebar({ currentCategory, onSelectCategory }: {
  currentCategory: string;
  onSelectCategory: (id: string) => void;
}) {
  return (
    <LeftDrawer>
      <LeftDrawerHeader title="设置" />
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
      case "model":
        return (
          <div>
            <h2 className="text-xl font-bold mb-4">语言模型</h2>
            <p className="text-muted-foreground">配置 API 密钥和模型参数</p>
          </div>
        );
      case "api":
        return (
          <div>
            <h2 className="text-xl font-bold mb-4">API 密钥</h2>
            <p className="text-muted-foreground">管理 OpenAI、Anthropic 等 API 密钥</p>
          </div>
        );
      default:
        return (
          <div>
            <h2 className="text-xl font-bold mb-4">{settingCategories.find(c => c.id === currentCategory)?.label}</h2>
            <p className="text-muted-foreground">该设置面板正在开发中</p>
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

          {/* Coming Soon Notice - 仅在非外观页面显示 */}
          {currentCategory !== "appearance" && (
            <div className="mt-8 p-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5">
              <div className="flex items-start gap-3">
                <SettingsIcon className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-yellow-900 dark:text-yellow-100 mb-1">
                    更多设置正在开发中
                  </h4>
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    完整的设置面板将在后续版本中提供，敬请期待。
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
