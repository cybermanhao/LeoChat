# 添加 UI 组件

在 UI 包中创建新的 React 组件。

## 组件位置

`packages/ui/src/components/`

## 组件模板

```tsx
import * as React from "react";
import { cn } from "../lib/utils";

export interface ComponentNameProps {
  className?: string;
  children?: React.ReactNode;
}

const ComponentName = React.forwardRef<HTMLDivElement, ComponentNameProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn("base-styles", className)}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ComponentName.displayName = "ComponentName";

export { ComponentName };
```

## 导出组件

在 `packages/ui/src/index.ts` 中添加导出：

```ts
export * from "./components/component-name";
```

## 命名规范

- 文件名：kebab-case（如 `chat-message.tsx`）
- 组件名：PascalCase（如 `ChatMessage`）
- Props 接口：`ComponentNameProps`

## 样式指南

- 使用 Tailwind CSS
- 使用 `cn()` 合并 className
- 支持 `className` prop 允许外部覆盖
- 遵循现有组件的设计模式

## 检查清单

1. [ ] 创建组件文件
2. [ ] 添加 TypeScript 类型
3. [ ] 在 index.ts 中导出
4. [ ] 支持 forwardRef（如需要）
5. [ ] 添加 displayName
