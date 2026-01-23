---
name: dev
description: Start LeoChat development environment - launches backend and frontend servers
user-invocable: true
---

# 启动 LeoChat 开发环境

启动项目的开发服务器。

## 可用命令
- `pnpm dev` - 并行启动所有应用（web + server）
- `pnpm dev:web` - 仅启动前端 (Port 5173)
- `pnpm dev:server` - 仅启动后端 (Port 3001)

## 默认操作
在后台运行 `pnpm dev:server` 和 `pnpm dev:web`，分别启动后端和前端服务。

## 注意事项
- 后端默认端口: 3001
- 前端默认端口: 5173
- 需要配置环境变量 (DEEPSEEK_API_KEY 或 OPENROUTER_API_KEY)
