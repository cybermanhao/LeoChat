# GUI 迁移第二步计划：前端直接消费 core 事件

**日期：** 2026-11-16
**状态：** 计划，等待用户决定 3 个问题后实施
**前置：** 第一步已完成（提交 `9c21ec6`，合并 `4f68803`）：server 的 `/api/chat` 已跑在 `@leochat/core` 的 `run()` 上，但仍把事件翻译成旧的 SSE 载荷，前端不变。

## 目标

前端不再解析旧的 SSE 载荷、不再维护 `contentItems`，改为：

```
server: run() ──AgentEvent（toPublicEvent）──SSE──▶ 前端: state = reduce(state, event) ──▶ 组件渲染 ViewPart
```

这一步完成后，才能做：输入框第 1 期（插话 / 排队，用 `steer()` / `followUp()`）、把界面操作工具改成进程内工具（②，通过 `custom` 事件通知前端）、在 GUI 里启用 compaction 和 DeepSeek 原生能力（联网搜索、引用）。

## 现状（涉及的代码，约 3000 行）

| 部分 | 位置 | 行数 |
|---|---|---|
| 生成状态 / 事件处理 | `apps/web/src/stores/chat-generation.ts` | 627 |
| 会话持久化 | `apps/web/src/stores/chat-conversations.ts`、`chat.ts`、`lib/chat-persistence` | ~300 |
| 中断修补 | `apps/web/src/stores/context-repair.ts` | 60（core 不变量 1 已取代） |
| 聊天区 | `apps/web/src/components/ChatArea.tsx` | 892 |
| 消息 / 工具块 / 流式内容组件 | `packages/ui/src/components/chat-message.tsx`、`tool-call-block.tsx`、`streaming-content.tsx` | ~800 |
| `contentItems` 引用 | web + ui | 28 处 |

会话保存的是三份数据：`displayMessages`（含 `contentItems`）、`contextMessages`、`internalMessages`。core 只需要一份：transcript（`Message[]`），视图由 `initialViewState(transcript)` 推导。

## 分阶段

| 阶段 | 内容 | 可独立验证 |
|---|---|---|
| 2a | server 新增 `/api/agent/run`：直接以 SSE 发 `toPublicEvent(e)`；旧 `/api/chat` 保留 | 用 curl 和 core 的 reducer 在 Node 里验证 |
| 2b | 前端新的生成 store：`reduce()` + 新组件渲染 `ViewPart`（文字 / 引用、推理、工具 part 各状态、服务端搜索、卡片 `UiHint`、`custom`）；审批改成按 `approval_request` 渲染、回答走现有 `/api/tools/approve/:id` | 新旧引擎可通过开关切换（见决定 2） |
| 2c | 会话数据迁移（见决定 1） | 迁移前后会话内容逐条对比 |
| 2d | 输入框第 1 期：运行中 Enter = 插话（`steer`），Ctrl/Cmd+Enter = 排队（`followUp`）；队列显示区 | 浏览器里手动测 |
| 2e（= 第三步） | 删除 TaskLoop、旧 `/api/chat` 翻译层、`contentItems`、`context-repair`、旧 checkpoint；checkpoint 改用 `@leochat/node` 的 `jsonlStore` | 全量测试 + 手动回归 |

## 需要你决定的

### 决定 1：已保存的会话怎么迁移？
- **A（推荐）：打开时按需转换，并保留原始数据。** 加载旧会话时，用已有的 `toCoreMessages()`（第一步里写的，移到 shared）把 `internalMessages` / `contextMessages` 转成 transcript；原始三份数据原样保留在一个 `legacy` 字段里，可以回退。转换后的会话在下次保存时写成新格式。
- B：旧会话只读，新会话用新格式。实现简单，但旧会话不能继续聊。
- C：一次性批量迁移所有会话。最干净，但一旦转换有 bug，影响全部历史。

### 决定 2：怎么上线？
- **A（推荐）：设置里加"新引擎（实验）"开关，默认关**，你日常用一段时间没问题再改成默认开，最后删除旧引擎。
- B：直接切换，不保留旧路径。改动最少，但出问题只能回退提交。

### 决定 3：暂停 / 断点续跑的数据放哪里？
- **A（推荐）：本地 server 用 `@leochat/node` 的 `jsonlStore`，目录放在应用数据目录下（Electron 的 `userData/sessions`，Web 开发模式放在 server 的数据目录）。** 同时可以记录事件日志，供以后 harness 回放。
- B：继续用现在的 TaskStore（JSON 文件），只换掉格式。

## 风险

- 这是用户可见的大改动，需要在浏览器里逐项回归：流式输出、推理折叠、工具调用各状态、bash 审批、卡片动作、会话切换、断点续跑、主题。
- 自动测试：reducer 已有测试；新增 server 端 `/api/agent/run` 的事件测试，以及会话转换的往返测试。组件层目前没有测试环境（没有 jsdom / testing-library），2b 时建议补上。
