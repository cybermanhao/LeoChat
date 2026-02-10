import { useThemeStore, getThemePresets } from "../../stores/theme";
import { Check } from "lucide-react";
import { cn } from "@ai-chatbox/ui";

export function AppearanceSettings() {
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
          {isSelected ? "当前主题" : "点击切换"}
        </div>
      </button>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">外观</h2>
        <p className="text-sm text-muted-foreground">
          自定义应用的主题和颜色方案
        </p>
      </div>

      {/* 浅色主题 */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
          浅色主题
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lightThemes.map(renderThemeCard)}
        </div>
      </div>

      {/* 深色主题 */}
      <div>
        <h3 className="text-sm font-semibold mb-3 text-muted-foreground">
          深色主题
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {darkThemes.map(renderThemeCard)}
        </div>
      </div>

      {/* 提示信息 */}
      <div className="mt-8 p-4 rounded-lg border bg-muted/30">
        <h4 className="text-sm font-medium mb-2">关于主题</h4>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• 主题设置会自动保存并在下次启动时应用</li>
          <li>• 可以通过 MCP 工具动态切换明暗模式</li>
          <li>• 每个主题都包含精心调配的颜色方案</li>
        </ul>
      </div>
    </div>
  );
}
