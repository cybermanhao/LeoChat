# MCP Connect Hang — Root Cause & Fix

## 症状

升级 Node.js 到 24（触发 pnpm 升级 `@modelcontextprotocol/sdk` 到 ≥1.x 新版）后，
所有 MCP 服务器连接永久挂住，HTTP `POST /api/mcp/servers/:id/connect` 无响应。
现象：服务端日志打印 "MCP sessions updated: 1 connected"，但之后再无任何输出，
HTTP 响应永远不返回。

## 根本原因

`packages/mcp-core/src/client.ts` 的 `connectInternal()` 在构造 SDK `Client` 时
传入了 `listChanged.tools.autoRefresh: true`：

```ts
this.client = new Client(
  { name: "leochat", version: "0.0.1" },
  {
    capabilities: {},
    listChanged: {
      tools: {
        autoRefresh: true,   // ← 问题所在
        debounceMs: 500,
        onChanged: ...
      }
    }
  }
);
```

在 `@modelcontextprotocol/sdk` 的新版本中，`autoRefresh: true` 会让 SDK 在
`client.connect(transport)` 内部自动发起一次 `tools/list` RPC 请求（初始化阶段）。

而 `connectInternal()` 在 `client.connect()` 返回后，**又显式调用了** `refreshTools()`：

```ts
await this.client.connect(this.transport);  // SDK 内部已发起 listTools()
// ...
if (this.capabilities.tools) {
  await this.refreshTools();  // 再次发起 listTools() ← 两次并发
}
```

两次 `listTools()` 并发飞出：SDK 的 pending-promise 队列用请求 ID 匹配响应，
第一个响应被 SDK 内部的 `autoRefresh` 消费，第二个响应被用来 resolve 外部的
`refreshTools()` promise——但在某些竞态窗口下，两次请求的响应顺序或 ID 映射出现错位，
导致其中一个 promise 永远等不到配对的响应，整个 `connect()` 调用永久挂起。

## 触发条件

- `@modelcontextprotocol/sdk` 升级到支持 `listChanged.autoRefresh` 的版本（Node 24 升级时 pnpm 顺带更新）
- MCP 服务器支持 `tools` capability（leochat、everything、fetch、excel、word 均触发）

## 修复

移除 `listChanged` 选项，改为依赖现有的 `onToolsUpdate` 回调手动刷新工具列表：

```ts
// packages/mcp-core/src/client.ts — connectInternal()
this.client = new Client(
  { name: "leochat", version: "0.0.1" },
  {
    capabilities: {},
    // 不传 listChanged：避免 SDK 内部 autoRefresh 与显式 refreshTools() 并发
  }
);
```

工具变更通知（`notifications/tools/list_changed`）不再被 SDK 自动处理，
但 `onToolsUpdate` 回调在 `refreshTools()` 之后会触发，功能上无损失。

## 受影响版本

- `@modelcontextprotocol/sdk` 升级后的所有版本（已确认 v1.25.3 触发）
- 所有 transport 类型均受影响（STDIO/SSE 均有此问题）

## 关联变更

- `packages/mcp-core/src/client.ts`：移除 `listChanged` 构造参数
- `packages/server/src/routes/index.ts`：connect 路由加了 15s 超时保护（防止其他原因的无限挂起）
