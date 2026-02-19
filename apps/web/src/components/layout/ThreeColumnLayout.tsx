import { ReactNode, useState } from "react";
import { cn } from "@ai-chatbox/ui";
import { t } from "../../i18n";

interface ThreeColumnLayoutProps {
  leftDrawer?: ReactNode;
  leftDrawerWidth?: number;
  defaultCollapsed?: boolean;
  children: ReactNode;
}

/**
 * 统一的三栏布局：ActivityBar + LeftDrawer + MainContent
 * - 高度撑满 100%
 * - 抽屉可完全收起
 * - 支持主题变化
 * - 丝滑的开关动画
 */
export function ThreeColumnLayout({
  leftDrawer,
  leftDrawerWidth = 240,
  defaultCollapsed = false,
  children,
}: ThreeColumnLayoutProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <div className="h-full w-full flex overflow-hidden">
      {/* Left Drawer - 始终渲染，通过 width 控制 */}
      {leftDrawer && (
        <div
          className="relative h-full bg-card overflow-hidden flex shrink-0 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
          style={{
            width: collapsed ? 0 : leftDrawerWidth,
          }}
        >
          {/* Drawer Content - 固定宽度，防止内容在动画时变形 */}
          <div
            className={cn(
              "h-full overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
              collapsed
                ? "opacity-0 translate-x-[-10px]"
                : "opacity-100 translate-x-0 delay-75"
            )}
            style={{ width: leftDrawerWidth }}
          >
            {leftDrawer}
          </div>

          {/* Toggle Bar - Right Side (展开状态) */}
          <div
            className={cn(
              "w-2 h-full bg-border hover:bg-primary/20 transition-all duration-200 cursor-pointer shrink-0",
              collapsed ? "opacity-0 pointer-events-none" : "opacity-100 delay-100"
            )}
            onClick={() => setCollapsed(true)}
            title={t("layout.collapseSidebar")}
          />
        </div>
      )}

      {/* Collapsed Toggle Bar (收起状态) */}
      {leftDrawer && (
        <div
          className={cn(
            "h-full bg-border hover:bg-primary/20 transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] cursor-pointer shrink-0",
            collapsed
              ? "w-2 opacity-100 delay-100"
              : "w-0 opacity-0 pointer-events-none"
          )}
          onClick={() => setCollapsed(false)}
          title={t("layout.expandSidebar")}
        />
      )}

      {/* Main Content - 占据剩余空间并撑满高度 */}
      <div className="flex-1 h-full overflow-hidden bg-background transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]">
        {children}
      </div>
    </div>
  );
}

/**
 * 左侧抽屉的标准组件
 */
interface LeftDrawerProps {
  children: ReactNode;
}

export function LeftDrawer({ children }: LeftDrawerProps) {
  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {children}
    </div>
  );
}

/**
 * 左侧抽屉的标题区域
 */
interface LeftDrawerHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function LeftDrawerHeader({
  title,
  subtitle,
  actions,
}: LeftDrawerHeaderProps) {
  return (
    <div className="flex-none h-auto border-b bg-muted/30 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate">{title}</h2>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="ml-2 flex-none">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * 左侧抽屉的内容区域（可滚动，占据剩余高度）
 */
interface LeftDrawerContentProps {
  children: ReactNode;
  className?: string;
}

export function LeftDrawerContent({
  children,
  className,
}: LeftDrawerContentProps) {
  return (
    <div className={cn("flex-1 overflow-y-auto overflow-x-hidden", className)}>
      {children}
    </div>
  );
}

/**
 * 左侧抽屉的底部区域
 */
interface LeftDrawerFooterProps {
  children: ReactNode;
  className?: string;
}

export function LeftDrawerFooter({
  children,
  className,
}: LeftDrawerFooterProps) {
  return (
    <div className={cn("flex-none h-auto border-t bg-muted/30 px-4 py-2", className)}>
      {children}
    </div>
  );
}
