# LeoChat - Claude 开发指南

本文档为 Claude AI 助手提供 LeoChat 项目的开发指导和最佳实践。

## 主题系统 (Theme System)

### 概述

LeoChat 使用基于 CSS 变量的主题系统，支持 6 种预设主题：
- Light, Light Purple, Light Green (浅色)
- Dark, Dark Purple, Dark Green (深色)

### 主题化组件的关键原则

#### ✅ 使用主题化的 Tailwind 类

**推荐使用的背景色类：**
```tsx
bg-background  // 主背景（页面、主内容区域）
bg-card        // 卡片、抽屉、下拉菜单等次级背景
bg-muted       // 静音/次要区域背景
bg-accent      // 强调区域背景
bg-primary     // 主色背景（按钮等）
bg-secondary   // 次要色背景
```

**推荐使用的前景色类：**
```tsx
text-foreground         // 主文本颜色
text-muted-foreground  // 次要文本颜色
text-card-foreground   // 卡片上的文本
text-primary           // 主色文本
text-secondary         // 次要色文本
```

**推荐使用的边框类：**
```tsx
border-border  // 标准边框颜色
border-input   // 输入框边框
border-primary // 主色边框
```

#### ❌ 避免使用固定颜色

**不要使用：**
```tsx
// ❌ 硬编码颜色
bg-blue-500
bg-gray-900
text-white
border-gray-300

// ❌ 未主题化的类（除非明确不需要跟随主题）
bg-popover  // 除非已配置主题，否则使用 bg-card 替代
```

### 创建新组件时的检查清单

1. **背景色**
   - [ ] 使用 `bg-background` 或 `bg-card` 而非固定颜色
   - [ ] 下拉菜单/弹出层使用 `bg-card`（已配置主题）

2. **文本颜色**
   - [ ] 使用 `text-foreground` 或 `text-muted-foreground`
   - [ ] 图标使用 `text-muted-foreground` 并在 hover 时变为 `text-foreground`

3. **边框**
   - [ ] 使用 `border-border` 而非固定颜色

4. **交互状态**
   - [ ] Hover 状态使用 `hover:bg-muted` 或 `hover:bg-accent`
   - [ ] 选中状态使用 `bg-accent` 或 `bg-primary/10`

### 主题配置详解

#### 当前主题变量（已配置 card）

所有主题都已配置以下颜色变量：
```ts
interface ThemeConfig {
  primary: string;           // 主色
  secondary: string;         // 次要色
  accent: string;            // 强调色
  background: string;        // 主背景
  foreground: string;        // 主前景
  card?: string;            // ✅ 卡片背景（深色主题已配置主题色）
  cardForeground?: string;  // ✅ 卡片前景
  muted: string;            // 静音背景
  mutedForeground: string;  // 静音前景
  border: string;           // 边框
  radius: string;           // 圆角
}
```

#### 深色主题的特殊配置

- **Dark**: card 使用深蓝色调 `222.2 84% 7%`
- **Dark Green**: card 使用深绿色调 `150 30% 8%` 🟢
- **Dark Purple**: card 使用深紫色调 `270 40% 8%` 🟣

这确保了标题栏、抽屉、下拉菜单等组件会跟随主题色系。

### 常见组件的主题化模式

#### 下拉菜单 / Popover

```tsx
<div className="bg-card border border-border rounded-md shadow-lg">
  {items.map(item => (
    <button
      className="hover:bg-accent text-foreground"
      // 选中状态
      className={cn(
        "hover:bg-accent",
        isSelected && "bg-accent/50"
      )}
    >
      {item.label}
    </button>
  ))}
</div>
```

#### 卡片组件

```tsx
<div className="bg-card border border-border rounded-lg p-4">
  <h3 className="text-foreground font-medium">标题</h3>
  <p className="text-muted-foreground text-sm">描述文本</p>
</div>
```

#### 按钮 Hover 效果

```tsx
<button className="text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
  <Icon className="h-4 w-4" />
</button>
```

### 主题切换测试

创建新组件后，务必测试所有主题：

1. 切换到 Dark Green 主题 - 检查是否显示绿色调
2. 切换到 Dark Purple 主题 - 检查是否显示紫色调
3. 切换到 Light 主题 - 检查浅色模式下的对比度
4. 检查文本是否清晰可读
5. 检查边框是否可见但不突兀

### 添加新主题变量

如果需要添加新的主题变量（如 `popover`）：

1. 在 `packages/shared/src/types/index.ts` 的 `ThemeConfig` 中添加字段
2. 在 `packages/shared/src/utils/theme.ts` 为每个主题添加配置
3. 运行 `pnpm build:packages` 重新构建
4. CSS 变量会自动通过 `applyTheme` 函数应用

## 动画和过渡 (Animations)

### 抽屉/侧边栏动画

使用自定义 cubic-bezier 缓动函数获得丝滑效果：

```tsx
className="transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
```

### 内容淡入淡出

```tsx
className={cn(
  "transition-all duration-300",
  visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-[-10px]"
)}
```

### 延迟动画

使用 `delay-*` 类创建交错动画：

```tsx
// 容器先展开
className="transition-all duration-300"

// 内容延迟淡入
className="transition-all duration-300 delay-75"
```

## 状态管理 (State Management)

### Zustand Store 模式

所有全局状态使用 Zustand + persist：

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MyState {
  value: string;
  setValue: (value: string) => void;
}

export const useMyStore = create<MyState>()(
  persist(
    (set, get) => ({
      value: "",
      setValue: (value) => set({ value }),
    }),
    {
      name: "leochat-my-storage",
      partialize: (state) => ({ value: state.value }),
    }
  )
);
```

### MCP 工具状态

MCP 工具的启用/禁用状态存储在 `useMCPStore` 的 `disabledToolIds: Set<string>` 中。

格式：`${serverId}:${toolName}`

## 组件设计原则

### 响应式组件

- 直接从 store 选择状态，而非调用方法
- 确保状态变化时组件会重新渲染

```tsx
// ✅ 响应式
const disabledToolIds = useMCPStore((s) => s.disabledToolIds);
const isEnabled = !disabledToolIds.has(toolId);

// ❌ 非响应式
const isToolEnabled = useMCPStore((s) => s.isToolEnabled);
const isEnabled = isToolEnabled(serverId, toolName); // 不会触发重新渲染
```

### 点击外部关闭

下拉菜单等组件实现点击外部关闭：

```tsx
const menuRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
      setOpen(false);
    }
  };

  if (open) {
    document.addEventListener("mousedown", handleClickOutside);
  }

  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
  };
}, [open]);
```

## 布局系统

### 高度管理

确保组件正确填充高度：

```css
/* globals.css */
html, body, #root {
  height: 100%;
}

#root > * {
  height: 100%;  /* React 包装器继承高度 */
}
```

```tsx
/* 组件 */
<div className="h-full flex flex-col overflow-hidden">
  <div className="flex-none">{/* 固定高度区域 */}</div>
  <div className="flex-1 overflow-y-auto">{/* 可滚动区域 */}</div>
</div>
```

### 三栏布局

使用 `ThreeColumnLayout` 创建带抽屉的页面：

```tsx
<ThreeColumnLayout
  leftDrawer={<MySidebar />}
  leftDrawerWidth={240}
  defaultCollapsed={false}
>
  {/* 主内容 */}
</ThreeColumnLayout>
```

## 常见问题排查

### 组件不跟随主题

1. 检查是否使用了硬编码颜色（`bg-blue-500` 等）
2. 改用主题化类（`bg-card`, `bg-background` 等）
3. 如果使用 `bg-popover` 或其他未配置的变量，改用 `bg-card`

### 状态不更新

1. 确保从 store 直接选择状态，而非调用方法
2. 检查依赖项是否完整
3. 使用 React DevTools 查看组件重新渲染情况

### 动画不流畅

1. 确保容器使用 `overflow-hidden`
2. 避免条件渲染（用 CSS 控制显示/隐藏）
3. 使用合适的 easing 函数

### HMR 不生效

1. 修改 shared/ui 包后需要运行 `pnpm build:packages`
2. 某些类型更改需要重启 dev server
3. 检查是否有 TypeScript 错误

## 项目结构

```
LeoChat/
├── apps/web/              # 主应用
│   ├── src/
│   │   ├── components/    # 通用组件
│   │   ├── pages/         # 页面组件
│   │   ├── stores/        # Zustand stores
│   │   └── styles/        # 样式文件
│   └── package.json
├── packages/
│   ├── shared/           # 共享类型和工具
│   ├── ui/               # UI 组件库
│   ├── mcp-core/         # MCP 核心功能
│   └── server/           # 后端服务
└── pnpm-workspace.yaml
```

## 开发工作流

1. **启动开发服务器**
   ```bash
   pnpm dev
   ```

2. **修改 shared/ui 包后**
   ```bash
   pnpm build:packages
   ```

3. **添加依赖**
   ```bash
   # 为 web 应用添加
   pnpm --filter @ai-chatbox/web add package-name

   # 为 shared 包添加
   pnpm --filter @ai-chatbox/shared add package-name
   ```

4. **创建新组件**
   - 使用主题化类名
   - 添加到合适的目录
   - 测试所有主题
   - 确保响应式

## 最佳实践总结

✅ **DO**
- 使用 `bg-card`, `bg-background` 等主题化类
- 直接从 store 选择状态
- 使用 cubic-bezier 缓动函数
- 测试所有主题和动画
- 保持组件简洁单一职责

❌ **DON'T**
- 使用硬编码颜色
- 使用未配置的 CSS 变量（如 `bg-popover`）
- 过度嵌套组件
- 忘记添加 loading/error 状态
- 在主题切换时出现闪烁

---

遵循以上指南，确保所有新组件都能完美融入 LeoChat 的设计系统！
