# Git 提交

提交当前代码变更，自动生成语义化 commit message。

## 执行步骤

1. 运行 `git status` 查看变更文件
2. 运行 `git diff --staged` 和 `git diff` 查看具体变更
3. 运行 `git log --oneline -5` 了解最近的提交风格
4. 分析变更内容，生成符合规范的 commit message
5. 执行 `git add` 添加相关文件（避免添加 .env、node_modules 等敏感文件）
6. 执行 `git commit` 提交

## Commit Message 规范

格式：`<type>(<scope>): <description>`

类型：
- `feat`: 新功能
- `fix`: 修复 bug
- `refactor`: 重构代码
- `style`: 样式调整（不影响逻辑）
- `docs`: 文档更新
- `chore`: 构建/工具变更
- `perf`: 性能优化

Scope（可选）：
- `web`: 前端应用
- `server`: 后端服务
- `ui`: UI 组件库
- `shared`: 共享库
- `mcp-core`: MCP 核心库

示例：
- `feat(web): 添加暗色模式切换`
- `fix(server): 修复 API 认证问题`
- `refactor(ui): 优化 ChatMessage 组件`

## 注意事项

- 不要提交 `.env` 文件
- 不要提交 `node_modules`
- 提交前确保代码能正常构建
