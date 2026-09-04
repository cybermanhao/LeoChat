# 构建项目

构建 LeoChat 项目，支持增量构建和完整构建。

## 可用命令

- `pnpm build` - 构建所有包和应用
- `pnpm build:packages` - 仅构建依赖包（shared, ui, mcp-core）
- `pnpm build:web` - 构建 Web 应用
- `pnpm build:electron` - 构建 Electron 应用

## 默认操作

执行完整构建流程：

```bash
pnpm build:packages && pnpm build:web
```

## 构建顺序

由于包之间存在依赖关系，构建顺序为：

1. `@ai-chatbox/shared` - 共享类型和工具
2. `@ai-chatbox/ui` - UI 组件库
3. `@ai-chatbox/mcp-core` - MCP 核心库
4. `@ai-chatbox/server` - 后端服务
5. `@ai-chatbox/web` - 前端应用

## 常见问题

如果构建失败：
1. 先运行 `pnpm typecheck` 检查类型错误
2. 确保依赖包已正确构建
3. 尝试 `pnpm clean && pnpm install` 清理重装
