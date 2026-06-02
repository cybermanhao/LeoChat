# LeoChat 技术债清单

> 记录时间：2026-06-02，基于 v0.2.0 tag 分析。
> 每次迭代开始前对照此清单选择要处理的债务项，处理后在对应条目标注 commit。

---

## 🔴 高优先级

### ~~TD-01: law-kb 污染 master 分支~~ ✅ bb2081a
**文件:** `apps/web/src/stores/mcp.ts`

| 位置 | 问题 |
|------|------|
| L17-22 | `BUILTIN_SERVERS` 包含 `law-kb` 配置 |
| L177 | bash 默认禁用注释写的是"法律助手场景" |
| L536-544 | `initBuiltinServers` 有 `case "law-kb"` 路径解析分支 |
| L594 | `PATH_RESOLVED` 集合包含 `"law-kb"` |
| L638 | `DEFAULT_ENABLED = ["leochat", "law-kb", "filesystem"]` |

**方案:** 删掉所有 law-kb 引用，`DEFAULT_ENABLED` 改为 `["leochat", "filesystem"]`，bash 注释改为通用说明。

---

### ~~TD-02: CI Actions Node.js 20 即将强制升级~~ ✅ 164211f
**文件:** `.github/workflows/release.yml`

GitHub 将在 **2026-06-16** 强制将 Node.js 20 actions 升级到 24。

**方案:** 统一升级以下 actions：
- `actions/checkout@v4` → `@v5`
- `actions/setup-node@v4` → `@v5`
- `actions/upload-artifact@v4` → `@v5`
- `pnpm/action-setup@v4` → `@v5`（检查是否有更新版）
- `softprops/action-gh-release@v2` → 检查最新版

---

## 🟡 中优先级

### ~~TD-03: Checkpoint 系统设计前提失效~~ ✅ 后端 TaskStore + Route A 方案已实现
**文件:** `packages/mcp-core/src/task-loop.ts` (末尾 ~80 行) + `packages/mcp-core/src/checkpoint-storage.ts` (307 行)

**背景:** 现有实现假设"前端直连、多轮 epoch 循环"，但生产路径是"后端代理、单次请求"，导致：
- 前端 `currentEpoch` 始终为 0，`epoch_complete` checkpoint 保存但无意义
- 收到 `final` 事件后直接替换全部历史，中间检查点作废
- 恢复入口不存在

**已知边界问题:**
1. MCP 工具状态不一致（恢复时服务器可能断线/工具变更）
2. `epoch_complete` 时机可能导致工具重复执行
3. 后端代理模式下前端没有 epoch 循环
4. UI `displayMessages` 无法从 checkpoint 重建
5. Electron IndexedDB 与文件存储可能不一致

**暂定方案（后端 checkpoint）:**
- 检查点移到后端：每轮工具调用完成后，后端保存 `internalMessages` + `taskId`
- 前端只持久化 `taskId`（绑定到对话 ID）
- 任务失败时，前端用 `taskId` 请求后端从断点继续
- 前端 `IndexedDBCheckpointStorage` 废弃，最终删除
- 设计完成前：`enableCheckpoints` 维持 `false`，代码保留不动

> 详见 [checkpoint-redesign.md](./checkpoint-redesign.md)（待补充）

---

### ~~TD-04: `allToolsCompleted` 死分支~~ ✅
**文件:** `packages/mcp-core/src/task-loop.ts` L396-419

`processBackendSSEResponse` 返回的 `assistantMessage` 中工具状态始终为 `pending`，此分支永远不会执行。

**方案:** 删除 if/else，直接 `await this.executeToolCalls(assistantMessage.tool_calls)`。

---

### TD-05: `fetchServerVersion` 假实现
**文件:** `apps/web/src/stores/mcp.ts` L198-220

使用了 `as any`，后端接口不返回 `version` 字段，`serverVersions` 状态永远是 `null`。

**方案（二选一）:**
- **A（补完）:** MCP SDK `client.connect()` 返回的 `ServerInfo` 包含 `name`/`version`，从 `session-manager` 暴露后正确填充。
- **B（删除）:** 删掉 `serverVersions` 状态和 `fetchServerVersion` 方法，UI 不展示版本。

---

### TD-06: 直连模式（`processStreamResponse`）近乎死代码
**文件:** `packages/mcp-core/src/task-loop.ts` L875-1038

`chat-generation.ts` 硬编码 `useBackendProxy: true`，生产环境从不走此路径。且直连路径缺少 `contentItems` 时序构建，与后端代理路径行为不一致。

**方案:**
- 短期：加注释标注"仅供直连模式，生产未启用"
- 长期：补齐功能对齐后端代理路径，或确认永不使用后删除

---

## 🟢 低优先级

### TD-07: mcp.ts 两套连接状态冗余
**文件:** `apps/web/src/stores/mcp.ts` L87 vs L90

```ts
isConnecting: Record<string, boolean>   // 旧
connectingServerIds: Set<string>        // 新（功能相同）
```

**方案:** 确认 UI 组件使用的是哪个，删掉另一个。

---

### TD-08: 后端两个端点 provider URL 映射重复
**文件:** `packages/server/src/routes/index.ts`

`POST /llm/test-connection`（L353）和 `POST /llm/models`（L423）各有一份相同的 provider → baseURL 映射。

**方案:** 抽成文件顶部常量 `PROVIDER_BASE_URLS`，两处共用。

---

### TD-09: `@ts-ignore` TaskLoop 懒加载
**文件:** `apps/web/src/stores/chat-generation.ts` L25

```ts
// @ts-ignore - mcp-core 在运行时可用
const mod = await import("@ai-chatbox/mcp-core");
```

**方案:** 用 `import type` 分离类型和运行时导入，或解决构建顺序问题使直接 import 可用。

---

### TD-10: CircuitBreaker 状态变化无 UI 反馈
**文件:** `apps/web/src/stores/chat-generation.ts` L406-410

`circuit_state_change` 事件只打 `console.log`，熔断器触发时用户不知道为什么请求停止。

**方案:** 熔断器 `open` 时 toast 提示"服务暂时不可用，请稍后重试"。

---

### TD-11: `createTransport` 同步 API 废弃未清理
**文件:** `packages/mcp-core/src/transports.ts` L207

标注了 `@deprecated` 但实现直接 `throw Error`，对外暴露了一个只会报错的 API。

**方案:** 确认无调用方后直接删除函数。

---

## 暂不处理

- **`contentItems` 字段在 `Message` 上** — 向后兼容保留，task-loop.ts 依赖
- **`ChatMessage` 是 `Message` 的别名** — 历史包袱，清理需大范围重命名，收益低
