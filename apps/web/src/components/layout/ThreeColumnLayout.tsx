import { ReactNode, useState } from "react";
import { cn } from "@ai-chatbox/ui";

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
      {/* Left Drawer */}
      {leftDrawer && !collapsed && (
        <div
          className="relative h-full bg-card transition-all duration-300 ease-in-out overflow-hidden flex"
          style={{ width: leftDrawerWidth }}
        >
          {/* Drawer Content */}
          <div className="flex-1 h-full overflow-hidden">
            {leftDrawer}
          </div>

          {/* Toggle Bar - Right Side */}
          <div
            className="w-2 h-full bg-border hover:bg-muted transition-colors cursor-pointer"
            onClick={() => setCollapsed(true)}
          />
        </div>
      )}

      {/* Collapsed Toggle Bar */}
      {leftDrawer && collapsed && (
        <div
          className="w-2 h-full bg-border hover:bg-muted transition-colors cursor-pointer"
          onClick={() => setCollapsed(false)}
        />
      )}

      {/* Main Content - 占据剩余空间并撑满高度 */}
      <div className="flex-1 h-full overflow-hidden bg-background">
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
