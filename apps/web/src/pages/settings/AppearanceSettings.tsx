import { useThemeStore, getThemePresets } from "../../stores/theme";
import { Check } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import { useT } from "../../i18n";

export function AppearanceSettings() {
  const { t } = useT();
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const themePresets = getThemePresets();

  // 按明暗分组
  const lightThemes = themePresets.filter((t) => !t.isDark);
  const darkThemes = themePresets.filter((t) => t.isDark);

  const renderThemeCard = (theme: typeof themePresets[0]) => {
    const isSelected = currentTheme === theme.id;
    const { config } = theme;

    return (
      <button
        key={theme.id}
        onClick={() => setTheme(theme.id)}
        className={cn(
          "relative group rounded-lg border-2 p-4 transition-all hover:shadow-md",
          isSelected
            ? "border-primary shadow-md"
            : "border-border hover:border-primary/50"
        )}
      >
        {/* 选中标记 */}
        {isSelected && (
          <div className="absolute top-2 right-2 h-5 w-5 rounded-full bg-primary flex items-center justify-center">
            <Check className="h-3 w-3 text-primary-foreground" />
          </div>
        )}

        {/* 主题名称 */}
        <div className="text-sm font-medium mb-3">{theme.name}</div>

        {/* 颜色预览 */}
        <div className="space-y-2">
          {/* 背景和前景 */}
          <div className="flex gap-2">
            <div
              className="h-10 flex-1 rounded border"
              style={{
                backgroundColor: `hsl(${config.background})`,
                borderColor: `hsl(${config.border})`,
              }}
            />
            <div
              className="h-10 flex-1 rounded border"
              style={{
                backgroundColor: `hsl(${config.foreground})`,
                borderColor: `hsl(${config.border})`,
              }}
            />
          </div>

          {/* Primary 和 Secondary */}
          <div className="flex gap-2">
            <div
              className="h-8 flex-1 rounded"
              style={{ backgroundColor: `hsl(${config.primary})` }}
            />
            <div
              className="h-8 flex-1 rounded"
              style={{ backgroundColor: `hsl(${config.secondary})` }}
            />
            <div
              className="h-8 flex-1 rounded"
              style={{ backgroundColor: `hsl(${config.accent})` }}
            />
          </div>
        </div>

        {/* Hover 效果提示 */}
        <div
          className={cn(
            "mt-2 text-xs text-center transition-opacity",
            isSelected
              ? "text-primary font-medium"
              : "text-muted-foreground opacity-0 group-hover:opacity-100"
          )}
        >
          {isSelected ? t("settings.appearance.currentTheme") : t("settings.appearance.clickToSwitch")}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">{t("settings.appearance.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("settings.appearance.description")}
        </p>
      </div>

      {/* 浅色主题 */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
          {t("settings.appearance.lightThemes")}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lightThemes.map(renderThemeCard)}
        </div>
      </div>

      {/* 深色主题 */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
          {t("settings.appearance.darkThemes")}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {darkThemes.map(renderThemeCard)}
        </div>
      </div>

      {/* 提示信息 */}
      <div className="mt-8 p-4 rounded-lg border bg-muted/30">
        <h4 className="text-sm font-medium mb-2">{t("settings.appearance.title")}</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• {t("settings.appearance.description")}</li>
          <li>• {t("settings.appearance.clickToSwitch")}</li>
          <li>• {t("settings.appearance.currentTheme")}</li>
        </ul>
      </div>
    </div>
  );
}
