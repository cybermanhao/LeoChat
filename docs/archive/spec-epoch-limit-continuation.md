# Spec: Epoch Limit Continuation Prompt

## 问题背景

当 AI 达到最大工具调用轮数（`maxEpochs`，默认 50）时，TaskLoop 静默停止，用户不会收到任何提示。用户只能手动再发一条消息（如"继续"）才能让 AI 接着跑，但这需要用户自己意识到 AI 停止是因为达到上限，而不是因为任务完成。

## 目标

- 达到轮数上限时，在对话中显示一个内联提示卡片
- 用户点击"继续"后，AI 自动接着上一轮的上下文继续执行
- 用户也可以自定义继续指令（如"继续，重点关注第3点"）
- UI 风格与 bash 工具审批卡片一致

---

## 功能设计

### 1. 数据流变化

#### 1a. TaskLoop `done` 事件新增字段

```typescript
// packages/mcp-core/src/task-loop.ts
interface TaskLoopDoneEvent {
  type: "done";
  epochCount: number;
  epochLimitReached: boolean;  // NEW: true when stopped due to maxEpochs
  internalMessages?: ChatMessage[];
  totalTokens?: { input: number; output: number };
}
```

设置逻辑（task-loop.ts）：
- 前端模式：`epochCount >= maxEpochs` 时 `epochLimitReached = true`
- 后端 proxy 模式：后端 `final` 事件新增 `epochLimitReached` 字段，透传到 `done` 事件

#### 1b. 后端 `/api/chat` `final` 事件新增字段

```typescript
// packages/server/src/routes/index.ts
// final 事件 payload：
{ toolRounds: number; internalMessages: ChatMessage[]; epochLimitReached: boolean }
```

设置条件：`toolRound >= MAX_TOOL_ROUNDS`

#### 1c. 前端 Store 新增状态

```typescript
// apps/web/src/stores/chat-types.ts
interface GenerationSlice {
  // ...existing...
  pendingContinuation: { chatId: string; hint?: string } | null;
}
```

`_handleTaskLoopEvent` 中 `done` 事件处理：
```typescript
if (event.epochLimitReached) {
  set({ pendingContinuation: { chatId } });
}
```

---

### 2. UI 组件

#### 2a. `EpochLimitCard` 组件

位置：`apps/web/src/components/EpochLimitCard.tsx`

```
┌─────────────────────────────────────────────────────┐
│  ⏸  已达到 50 轮工具调用上限，任务可能尚未完成          │
│                                                     │
│  [继续执行]   [自定义继续指令...]                     │
└─────────────────────────────────────────────────────┘
```

行为：
- **继续执行**：调用 `sendMessage("继续", systemPrompt)`，关闭卡片
- **自定义继续指令**：展开输入框，用户输入后发送，关闭卡片
- 卡片显示在最后一条 assistant 消息气泡**下方**（不在气泡内部）
- 样式参考 bash 审批 UI（`bg-muted border border-border rounded-lg`）

#### 2b. 渲染位置

在 `ChatArea.tsx` 的消息列表末尾，如果 `pendingContinuation?.chatId === currentConversationId`，则渲染 `<EpochLimitCard>`。

---

### 3. 状态生命周期

```
sendMessage 调用
  → set({ pendingContinuation: null })  // 清除旧卡片
  → ...
  → done 事件 (epochLimitReached=true)
      → set({ pendingContinuation: { chatId } })
  
用户点击"继续"
  → sendMessage("继续", systemPrompt)
  → set({ pendingContinuation: null })  // sendMessage 开始时清除

用户切换对话
  → 不清除 pendingContinuation（切回来还能看到）
  → 但只有 pendingContinuation.chatId === current 才渲染

cancelGeneration
  → set({ pendingContinuation: null })  // 中止时也清除
```

---

### 4. 改动文件清单

| 文件 | 改动 |
|------|------|
| `packages/mcp-core/src/task-loop.ts` | `done` 事件加 `epochLimitReached` 字段 |
| `packages/server/src/routes/index.ts` | `final` SSE 事件加 `epochLimitReached` |
| `packages/mcp-core/src/types.ts` 或 `@ai-chatbox/shared` | `TaskLoopDoneEvent` 类型更新 |
| `apps/web/src/stores/chat-types.ts` | `GenerationSlice` 加 `pendingContinuation` |
| `apps/web/src/stores/chat-generation.ts` | `_handleTaskLoopEvent` 处理 `epochLimitReached`；`sendMessage` 开始时清除 |
| `apps/web/src/components/EpochLimitCard.tsx` | 新建组件 |
| `apps/web/src/components/ChatArea.tsx` | 消息列表末尾渲染 `EpochLimitCard` |

---

### 5. 不做的事

- 不自动重试（用户需要主动决定是否继续）
- 不修改 `maxEpochs`（继续后重新计数，从 0 开始新一轮）
- 不持久化 `pendingContinuation`（重启后不恢复，避免过时的卡片）
- 不为每一条消息嵌入卡片，卡片是全局唯一的（一次只有一个）
