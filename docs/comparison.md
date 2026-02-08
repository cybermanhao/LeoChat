# OpenMCP-Client vs ZZ-AI-Chat vs LeoChat 对比分析

## 1. 项目概览

| 维度 | OpenMCP-Client | ZZ-AI-Chat | LeoChat |
|------|---------------|------------|---------|
| **定位** | 知名开源 MCP 客户端 | 多平台 AI 聊天应用 | 轻量级 MCP 聊天客户端 |
| **前端框架** | Vue 3 + Element Plus | React 19 + Ant Design | React 19 + Radix UI + Tailwind |
| **状态管理** | Vue reactive/ref | Redux Toolkit + Immer | Zustand |
| **后端** | Node.js + WebSocket | Express + SSE | Hono + SSE |
| **构建工具** | Vite + Turbo + esbuild | Vite + Webpack | Vite + Tsup |
| **MCP SDK** | v1.12.1 | v1.17.0 | v1.0.0 |
| **跨平台** | VSCode + Electron + Web | Web + Electron + SSC | Web + Electron（初期） |
| **国际化** | 9 种语言 | 无 | 无 |
| **代码复杂度** | 中等 | 偏高（过度工程） | 低（精简干净） |
| **成熟度** | 生产就绪 | 功能完整 | 基础功能完成 |

---

## 2. 架构对比

### 2.1 项目结构

**OpenMCP-Client** — 双包 monorepo + VSCode 扩展
```
openmcp-client/
├── renderer/     # Vue 3 前端（Element Plus）
├── service/      # Node.js 后端（WebSocket）
├── src/          # VSCode Extension 入口
└── turbo.json    # Turbo 编排
```
- 用 Turbo 管理构建依赖
- service 通过 WebSocket 与 renderer 通信
- VSCode 扩展模式下通过 `acquireVsCodeApi` 桥接

**ZZ-AI-Chat** — 大型 monorepo
```
zz-ai-chat/
├── web/          # React 前端（Ant Design）
├── electron/     # Electron 主进程
├── api/          # Express 后端
├── engine/       # 核心引擎（TaskLoop, MessageBridge, MCP）
├── mcp-node/     # Node.js MCP 服务器
├── mcp-python/   # Python MCP 服务器
└── ssc-server/   # SSC 模式后端
```
- 7 个 workspace，结构庞大
- `engine` 包含核心逻辑，跨前后端复用
- 多种部署模式（Web/Electron/SSC）导致大量适配代码

**LeoChat** — 精简 monorepo
```
LeoChat/
├── apps/web/          # React 前端
├── apps/electron/     # Electron（初期）
├── packages/shared/   # 类型 & 工具
├── packages/ui/       # Radix + Tailwind 组件
├── packages/mcp-core/ # MCP 客户端 & TaskLoop
├── packages/server/   # Hono 后端
└── packages/leochat-mcp/ # 内置 MCP 服务器
```
- 包职责清晰，每个包功能单一
- `shared` → `ui` + `mcp-core` → `server` 的依赖方向明确

### 2.2 状态管理

| | OpenMCP-Client | ZZ-AI-Chat | LeoChat |
|--|---|---|---|
| **方案** | Vue reactive() | Redux Toolkit + Immer | Zustand + persist |
| **样板代码** | 极少 | 大量（slice/action/reducer） | 极少 |
| **性能** | 细粒度响应 | 整体派发，需手动优化选择器 | 选择器天然细粒度 |
| **持久化** | NeDB 数据库 | Redux Persist → localStorage | Zustand persist → localStorage |
| **开发体验** | Vue 生态原生 | 成熟但冗长 | 最简洁 |

**分析**：ZZ-AI-Chat 的 Redux 方案带来了较多的模板代码。LeoChat 的 Zustand 选择在开发体验上更优。

### 2.3 前后端通信

| | OpenMCP-Client | ZZ-AI-Chat | LeoChat |
|--|---|---|---|
| **协议** | WebSocket 双向 | HTTP + SSE / IPC | HTTP + SSE |
| **消息格式** | `{command, data, callbackId}` | 事件驱动 `{type, payload}` | SSE events: chunk/tool_call/complete/final |
| **特点** | 请求-回调模式，双向实时 | MessageBridgeV2 多环境适配 | 后端代理完成完整工具循环 |

**分析**：OpenMCP 的 WebSocket 双向通信更适合实时交互场景。LeoChat 的 SSE 方案更简单但只能服务端→客户端推送。

---

## 3. MCP 集成对比

### 3.1 连接协议

| 协议 | OpenMCP-Client | ZZ-AI-Chat | LeoChat |
|------|:-:|:-:|:-:|
| STDIO | ✅ | ✅ | ✅ |
| SSE | ✅ | ✅ | ✅（服务端） |
| Streamable HTTP | ✅ | ✅ | ❌ |
| OAuth | ✅（PKCE） | ❌ | ❌ |

### 3.2 会话管理

**OpenMCP-Client**：
- `McpClient` 封装 SDK，带 capabilities 声明
- `McpServerConnectMonitor` 自动重连监控
- 环境自动设置（Python `uv sync`、Node `npm install`）

**ZZ-AI-Chat**：
- `MCPClient` 自动协议推断（从 URL 模式判断）
- 连接超时：STDIO 8s / HTTP 15s
- 多 MCP 服务器并行管理（MCPManager）

**LeoChat**：
- `SessionManager` 管理多服务器连接
- 后端代理模式（前端不直连 MCP）
- 内置服务器预设（LeoChat、Everything、Filesystem、Memory）

### 3.3 工具执行流程

**OpenMCP-Client**：前端驱动
```
用户输入 → LLM → tool_calls → 前端 TaskLoop → WebSocket → service 执行工具 → 结果回传 → LLM 继续
```
- 并行工具调用支持
- 工具执行可视化（流程图，D3 + ElkJS）
- OCR 图片内容提取（Tesseract.js）

**ZZ-AI-Chat**：MessageBridge 适配多环境
```
用户输入 → MessageBridge → LLM API → tool_calls → MessageBridge → MCPManager → MCP 服务器 → 结果 → TaskLoop 继续
```
- 工具结果截断（max 3000 chars）
- 工具调用去重防止重复执行
- StreamingPerformanceMonitor 性能监控

**LeoChat**：后端完整工具循环
```
用户输入 → SSE → 后端 Hono → LLM → tool_calls → 后端执行工具 → LLM 继续 → SSE 推送全部结果
```
- 后端 `while (toolRound < MAX_ROUNDS)` 循环
- `final` 事件包含完整内部消息历史
- 断点恢复（checkpoint storage）
- 熔断器模式（circuit breaker）

---

## 4. 功能矩阵

| 功能 | OpenMCP-Client | ZZ-AI-Chat | LeoChat |
|------|:-:|:-:|:-:|
| **流式响应** | ✅ | ✅ | ✅ |
| **多模型切换** | ✅ OpenRouter | ✅ DeepSeek/OpenAI | ✅ DeepSeek/OpenRouter |
| **工具调用** | ✅ 并行 | ✅ 并行 | ✅ 并行 |
| **工具执行追踪** | ✅ 流程图 | ✅ 状态卡片 | ✅ ToolCallBlock |
| **Markdown 渲染** | ✅ markdown-it + KaTeX | ✅ | ✅ react-markdown |
| **代码高亮** | ✅ Prism.js | ✅ | ✅ CodeBlock |
| **数学公式** | ✅ KaTeX | ❌ | ❌ |
| **暗色/亮色主题** | ✅ VSCode 联动 | ✅ | ✅ |
| **多对话管理** | ✅ 多标签页 | ✅ 侧边栏 | ✅ 侧边栏 |
| **对话持久化** | ✅ NeDB | ✅ localStorage | ✅ localStorage |
| **服务端持久化** | ✅ NeDB | ❌ | ❌ |
| **对话导出** | ✅ | ❌ | ❌ |
| **文件上传** | ✅ Resource | ❌ | ❌ |
| **图片支持** | ✅ + OCR | ❌ | ❌ |
| **系统提示词** | ✅ | ✅ | ✅ Prompt 面板 |
| **国际化** | ✅ 9 语言 | ❌ | ❌ |
| **上下文长度配置** | ✅ | ✅ | ❌ |
| **Temperature 配置** | ✅ | ✅ | ❌ |
| **思维链展示** | ✅ | ✅ | ✅ 折叠区域 |
| **消息编辑/重发** | ✅ | ❌ | ❌ |
| **Token 统计** | ✅ | ❌ | ✅ |
| **请求取消** | ✅ | ✅ | ✅ |
| **自动重连** | ✅ Monitor | ❌ | ❌ |
| **Electron 桌面** | ✅ | ✅ | 初期 |
| **VSCode 扩展** | ✅ | ❌ | ❌ |
| **Action 按钮/卡片** | ❌ | ❌ | ✅ |

---

## 5. 代码质量 & 性能

### 5.1 代码复杂度

| 指标 | OpenMCP-Client | ZZ-AI-Chat | LeoChat |
|------|---|---|---|
| **Workspace 数** | 2 + VSCode ext | 7+ | 6 |
| **核心抽象层数** | 3（bridge → service → SDK） | 5+（bridge → adapter → manager → client → SDK） | 2（store → TaskLoop/SSE） |
| **废弃代码** | 少量 | 较多（V1→V2 迁移残留） | 几乎没有 |
| **样板代码量** | 中等 | 大量（Redux 模式） | 极少 |

### 5.2 性能分析

**OpenMCP-Client**：
- WebSocket 通信开销低
- D3 + ElkJS 图表渲染可能在大量工具调用时卡顿
- 无消息虚拟化（大对话可能有问题）

**ZZ-AI-Chat**：
- **最大问题是多模式（Web/Electron/SSC）导致架构难以维护**，连启动环境都变得混乱
- Electron 启动时大量 MCP Server 自动启动（STDIO 子进程），GUI 出现前等待时间长
- 启动后的 MCP 连接过程耗时且容易失败，影响首次可用体验
- 上述架构复杂度和 MCP 启动链路是"不流畅"的主要来源
- **亮点**：MCP 管理界面设计用心，比 OpenMCP 更加非技术友好，视觉效果不错

**LeoChat**：
- Zustand 选择器天然避免无效 re-render
- SSE 流式事件开销低
- 消息增量 patch（`_patchLastAssistantMessage`）减少状态更新范围
- 暂无虚拟化，但架构不阻碍后续添加

---

## 6. LeoChat 可借鉴方向

### 高优先级（核心体验提升）

#### 6.1 对话导出 ← OpenMCP
OpenMCP 支持对话导出为 JSON/Markdown。LeoChat 应添加导出功能，至少支持：
- Markdown 格式（人类可读）
- JSON 格式（可导入恢复）

#### 6.2 LLM 参数配置 ← 两者
两个项目都支持 **temperature** 和 **上下文长度** 的可配置。LeoChat 目前固定参数，应在模型选择器或设置面板中暴露：
- Temperature（创造性 vs 确定性）
- Max tokens（控制输出长度）
- Context window length（控制上下文截断）

#### 6.3 消息编辑/重发 ← OpenMCP
OpenMCP 支持编辑已发送消息并重新生成回复。这是对话类应用的核心 UX 需求。

#### 6.4 Streamable HTTP 连接 ← 两者
两个项目都支持 Streamable HTTP 协议连接 MCP 服务器。LeoChat 目前只支持 STDIO 和 SSE，应补充 Streamable HTTP 以兼容更多 MCP 服务器。

### 中优先级（功能完善）

#### 6.5 服务端数据持久化 ← OpenMCP
OpenMCP 使用 NeDB 持久化对话。LeoChat 当前仅 localStorage，数据易丢失。可考虑：
- 轻量方案：SQLite / better-sqlite3（Hono 后端）
- 或保持 localStorage 但增加导入/导出能力

#### 6.6 MCP 管理界面优化 ← ZZ-AI-Chat
ZZ-AI-Chat 的 MCP 管理界面为非技术用户做了大量优化，视觉效果好，操作友好。LeoChat 当前的 MCP 管理界面尚未优化，应参考其设计思路，降低用户配置 MCP Server 的门槛。

#### 6.7 MCP 自动重连 ← OpenMCP
OpenMCP 的 `McpServerConnectMonitor` 会自动检测断连并重连。LeoChat 应在 SessionManager 中增加心跳检测 + 自动重连。

#### 6.8 图片 & 文件支持 ← OpenMCP
OpenMCP 支持 Resource 协议读取文件，还有 Tesseract.js OCR。LeoChat 可优先支持：
- 图片粘贴/上传到对话
- MCP Resource 协议浏览和读取

#### 6.9 数学公式渲染 ← OpenMCP
OpenMCP 使用 markdown-it + KaTeX 渲染数学公式。LeoChat 使用 react-markdown，可添加 `remark-math` + `rehype-katex` 插件。

### 低优先级（锦上添花）

#### 6.10 国际化 ← OpenMCP
OpenMCP 支持 9 种语言（vue-i18n）。LeoChat 如需面向国际用户，可用 `react-i18next` 实现。当前阶段优先级低。

#### 6.11 工具执行流程图 ← OpenMCP
OpenMCP 用 D3 + ElkJS 绘制工具调用流程图。LeoChat 当前的 ToolCallBlock 已足够清晰，流程图属于进阶可视化需求。

#### 6.12 性能监控 ← ZZ-AI-Chat
ZZ-AI-Chat 的 `StreamingPerformanceMonitor` 思路值得参考 —— 在开发阶段监控流式更新频率和渲染性能。但不建议照搬 Redux 的复杂方案。

---

## 7. 反面教训（ZZ-AI-Chat 踩过的坑）

| 问题 | ZZ-AI-Chat 的做法 | LeoChat 应避免 |
|------|---|---|
| **多模式导致难以维护**（最大问题） | Web/Electron/SSC 三端适配，runtimeContext + 多种代理路由，连启动环境都变得混乱 | 先做好 Web 一种模式，保持架构简单可维护 |
| **MCP 启动策略失当** | Electron 启动 GUI 前大量 MCP Server 自启动，耗时长且容易失败，导致应用不流畅 | MCP 连接应懒加载，按需启动，失败时优雅降级 |
| **过度抽象** | MessageBridge V1→V2 迁移，大量废弃代码 | 不要提前抽象，等需求明确再重构 |
| **状态管理过重** | Redux Toolkit + 5 层中间件 | 保持 Zustand 的简洁 |
| **深拷贝开销** | Redux frozen state + deep copy in TaskLoop | Zustand 的 mutable state 天然避免 |
| **配置散落** | 5+ store slice + localStorage + .env 三套 | 统一配置源，单一持久化方案 |
| **调试日志遗留** | 40+ console.log 留在生产代码中 | 用构建时环境变量控制日志输出 |

---

## 8. TaskLoop 深度对比

TaskLoop 是三个项目的核心引擎，负责 `用户输入 → LLM 推理 → 工具调用 → 结果回传 → 继续推理` 的完整循环。三者实现差异显著。

### 8.1 架构总览

| 维度 | OpenMCP-Client | ZZ-AI-Chat | LeoChat |
|------|---|---|---|
| **文件** | `renderer/.../chat/core/task-loop.ts` | `engine/stream/task-loop.ts` | `packages/mcp-core/src/task-loop.ts` |
| **代码行数** | ~935 行 | ~794 行 | ~1033 行 |
| **框架耦合** | Vue (ref, Ref) | 框架无关（但依赖 MessageBridge） | 框架无关 |
| **通信层** | MessageBridge (WebSocket) | MessageBridgeV2 (多环境适配) | 直连 fetch / 后端代理 SSE |
| **运行位置** | 前端（工具调用经 WebSocket 到后端） | 前端（工具调用经 MessageBridge 适配） | 前端（后端可代理整个循环） |
| **实例模式** | 单例（全局共享） | 多实例（每会话一个） | 多实例（每会话一个） |

### 8.2 主循环结构

**OpenMCP-Client** — 前端事件驱动循环
```
start(tabStorage, userMessage)
  for epoch in 0..maxEpochs:
    清空 streamingContent / streamingToolCalls
    makeChatData(tabStorage) → 构建请求
    doConversation(chatData)  → WebSocket 发送，监听 chunk/done/error
    if streamingToolCalls.length > 0:
      push assistant msg → tabStorage.messages
      for each toolCall:
        handleToolCalls(toolCall) → mcpClientAdapter.callTool()
        push tool result → tabStorage.messages
      continue
    elif streamingContent:
      push assistant msg → tabStorage.messages
      if xmlWrapper: 解析 XML 工具调用
      else: break
    else: break
```
- **特点**：直接操作 `tabStorage.messages`（Vue reactive 对象），无需深拷贝
- **ChatData 每轮重建**：每个 epoch 调用 `makeChatData()` 重新构建请求体，包含 contextLength 截断
- **XML 包装模式**：支持不原生支持 tool_calls 的模型，通过 XML 格式模拟工具调用

**ZZ-AI-Chat** — MessageBridge 事件驱动循环
```
start(input)
  push userMessage → this.messages (深拷贝后的数组)
  for epoch in 0..MAX_EPOCHS:
    cleanupInvalidMessages()
    创建 UI 占位消息 (emit add)
    messageBridge.chatLLM({...})  → 异步发送
    await Promise<void>:
      监听 chunk → emit update
      监听 toolcall → needToolCall = true
      监听 done → push assistantMsg → this.messages, resolve()
      监听 error → reject()
    if needToolCall:
      获取 lastMessage.tool_calls
      Promise.all(toolCalls.map(callToolViaMessageBridge))
      push tool results → this.messages
      continue
    break
```
- **特点**：每次 `new TaskLoop` 都深拷贝消息数组（`JSON.parse(JSON.stringify())`），避免 Redux frozen state
- **MessageBridge 抽象**：工具调用通过 `callToolViaMessageBridge()` 适配多端
- **大量日志**：~40+ `console.log` 语句，反映调试困难
- **`Object.isExtensible` 检查**：多处检查数组是否可扩展，是 Redux immutable 中间件的后遗症

**LeoChat** — 双模式（直连 + 后端代理）
```
start(input)
  push userMessage → this.messages (深拷贝后的数组)
  for epoch in 0..maxEpochs:
    if !uiMessageCreated: emit add (UI占位), else: status update
    callLLM(uiMessageId, mergedToolCalls):
      withRetry(executeLLMRequest, retryConfig, circuitBreaker)
        if useBackendProxy:
          fetch(/api/chat) → processBackendSSEResponse()
          处理 chunk/tool_call/tool_result/final 事件
          if final: return { finalMessages }  // 后端已完成整个循环
        else:
          fetch(baseURL/chat/completions) → processStreamResponse()
          解析 OpenAI 流式格式
    if finalMessages: 直接使用后端历史，return
    push assistantMessage → this.messages
    if needToolCall:
      if allToolsCompleted (后端已执行): push tool results
      else: executeToolCalls() → onToolCall callback
      continue
    break
```
- **特点**：两种执行路径（直连 LLM / 后端代理），后端代理可完成整个工具循环
- **重试 + 熔断器**：`withRetry` 包装每次 LLM 调用，指数退避 + Circuit Breaker
- **Checkpoint**：每轮完成后可持久化检查点，支持断点恢复
- **ModelAdapter**：通过适配器支持 OpenAI / Anthropic / Gemini / DeepSeek 不同流式格式

### 8.3 消息历史管理

| | OpenMCP-Client | ZZ-AI-Chat | LeoChat |
|--|---|---|---|
| **存储位置** | `tabStorage.messages`（外部 Vue reactive） | `this.messages`（内部深拷贝） | `this.messages`（内部深拷贝） |
| **深拷贝** | 不需要（Vue reactive 可变） | `JSON.parse(JSON.stringify())` | `JSON.parse(JSON.stringify())` |
| **上下文截断** | `messages.slice(-contextLength)` | 无（发送全量） | 无（发送全量） |
| **System 消息** | 通过 `getSystemPrompt()` 每轮重建 | `ensureSystemMessage()` 构造时调用 | `ensureSystemMessage()` 构造时调用 |
| **消息清理** | 无 | `cleanupInvalidMessages()` 过滤空消息 | 无 |
| **历史输出** | 直接修改外部 tabStorage | `return this.messages` | `emit done + internalMessages` |

**关键差异**：OpenMCP 让调用者管理消息数组（直接操作 Vue reactive state），而 ZZ-AI-Chat 和 LeoChat 都在内部深拷贝一份独立消息数组。OpenMCP 的做法更简单直接，但前提是不使用 immutable state（Vue 的 reactive 对象天然可变）。

### 8.4 工具调用检测与执行

| | OpenMCP-Client | ZZ-AI-Chat | LeoChat |
|--|---|---|---|
| **检测方式** | `streamingToolCalls.value.length > 0` | `needToolCall` flag (toolcall 事件) | `finishReason === 'tool_calls' \|\| toolCalls.length > 0` |
| **解析层** | 流式增量拼接 `arguments_delta` | MessageBridge 内部解析后发事件 | 直连模式: 自行解析; 代理模式: 后端解析 |
| **执行方式** | `mcpClientAdapter.callTool()` 直接调用 | `callToolViaMessageBridge()` 事件适配 | `onToolCall` 回调 / 后端直接执行 |
| **并行/串行** | **串行**（for 循环逐个执行） | **并行**（`Promise.all`） | **可配置**（`parallelToolCalls` 选项） |
| **JSON 解析错误** | 重试 + 向 LLM 发送纠错消息 | 简单 try/catch，空对象降级 | 解析失败用 `{ raw: arguments }` 降级 |
| **结果截断** | 无 | 3000 字符截断 | 3000 字符截断（85% 内容 + 截断提示） |
| **执行计时** | ✅ 记录 `timecost` | ❌ | ❌ |

**OpenMCP 的 JSON 纠错机制最完善**：如果工具调用参数解析失败，会向 LLM 发送纠错消息让其重新生成合法 JSON，最多重试 `maxJsonParseRetry` 次。这是 LeoChat 可以借鉴的。

### 8.5 流式处理

| | OpenMCP-Client | ZZ-AI-Chat | LeoChat |
|--|---|---|---|
| **流式协议** | WebSocket 事件 (`chunk/done/error`) | MessageBridge 协议事件 | OpenAI SSE / 自定义 SSE |
| **Content 累积** | `streamingContent.value += delta` | MessageBridge 内部处理 | `content += parsed.content` |
| **ToolCall 累积** | `streamingToolCalls[index].arguments += delta` | MessageBridge 内部处理 | `toolCallsMap.get(index).arguments += delta` |
| **Reasoning** | 无 | `reasoning_delta` 事件 | `reasoning_content += delta` |
| **多模型适配** | Index adapter (grok/gemini 特殊处理) | 无 | ModelAdapter (OpenAI/Anthropic/Gemini/DeepSeek) |

**LeoChat 的 ModelAdapter 是最完善的流式解析方案**：为每个 LLM 提供商实现了独立的 `parseStreamChunk()` 方法，正确处理各家不同的流式格式（OpenAI delta, Anthropic content_block, Gemini candidates）。

### 8.6 事件系统

**OpenMCP-Client** — 回调注册模式
```typescript
// 注册式回调，每种事件独立数组
taskLoop.registerOnChunk(chunk => { ... })
taskLoop.registerOnDone(() => { ... })
taskLoop.registerOnToolCall(toolCall => { return modifiedToolCall })  // 可拦截修改
taskLoop.registerOnToolCalled(result => { return modifiedResult })   // 可拦截修改
taskLoop.registerOnEpoch(() => { ... })
taskLoop.registerOnError(error => { ... })
taskLoop.registerOnTokenConsumption(stats => { ... })
```
- 7 种独立回调类型
- **可拦截**：`onToolCall` 和 `onToolCalled` 返回修改后的值，允许中间件式拦截
- 每个回调有 UUID，支持精确取消注册
- 内置反馈系统（OmFeedback）收集数据用于回流

**ZZ-AI-Chat** — 统一事件流
```typescript
// 统一 subscribe 模式
taskLoop.subscribe(event => {
  switch(event.type) {
    case 'add': ...       // 新消息
    case 'update': ...    // 增量更新
    case 'toolcall': ...  // 工具调用开始
    case 'toolresult': .. // 工具调用结果
    case 'status': ...    // 状态变化
    case 'error': ...     // 错误
    case 'done': ...      // 完成
  }
})
```
- 统一的 `TaskLoopEvent` 联合类型
- 不可拦截（只读通知）
- 通过 Redux middleware 转换为 Redux actions

**LeoChat** — 统一事件流 + 更丰富的事件
```typescript
// 与 ZZ-AI-Chat 类似的 subscribe 模式
taskLoop.subscribe(event => {
  switch(event.type) {
    case 'add': ...              // 新消息
    case 'update': ...           // 增量更新 (content_delta, reasoning_delta, tool_calls)
    case 'toolcall': ...         // 工具调用开始
    case 'toolresult': ...       // 工具调用结果
    case 'status': ...           // 状态 + CardStatus
    case 'error': ...            // 错误 (含 recoverable 标记)
    case 'done': ...             // 完成 (含 epochCount + internalMessages)
    case 'retry': ...            // 重试通知 (attempt, maxAttempts, delayMs)
    case 'circuit_state_change': // 熔断器状态变化
    case 'checkpoint_created': . // 检查点创建
  }
})
```
- 10 种事件类型（比 ZZ-AI-Chat 多 retry / circuit / checkpoint）
- `done` 事件携带完整 `internalMessages`，供 store 持久化
- `error` 事件携带 `recoverable` 标记

### 8.7 错误处理与韧性

| | OpenMCP-Client | ZZ-AI-Chat | LeoChat |
|--|---|---|---|
| **重试机制** | JSON 解析错误重试（让 LLM 重新生成） | 无 | 指数退避重试（`withRetry`） |
| **Circuit Breaker** | 无 | 无 | ✅ 三态熔断器 (closed/open/half-open) |
| **Checkpoint** | 无 | 无 | ✅ 每轮保存 + 错误时保存 + 断点恢复 |
| **Abort** | WebSocket 发送 abort 命令 | `abortController.abort()` + MessageBridge | `abortController.abort()` + SSE 中断 |
| **超时** | 无 | 工具调用 30s 超时 | 每次请求独立超时 (`attemptTimeoutMs`) |
| **网络错误** | error 事件通知 | error 事件通知 | 自动重试网络错误 (ECONNREFUSED 等) |

**LeoChat 的韧性设计最完善**：
- `withRetry`: 指数退避 + jitter + 可配置重试次数 + 可重试状态码列表
- `CircuitBreaker`: 防止级联失败，达到阈值后自动熔断，定时尝试恢复
- `Checkpoint`: 可从任意检查点恢复 TaskLoop 状态（消息历史 + LLM 配置 + epoch 位置）

### 8.8 独特特性

**OpenMCP-Client 独有**：
- **XML Wrapper 模式**：为不支持原生 tool_calls 的模型（如部分开源模型）提供 XML 格式的工具调用模拟
- **工具调用拦截**：`registerOnToolCall` 允许在工具执行前修改参数，`registerOnToolCalled` 允许修改结果
- **JSON 纠错循环**：工具参数解析失败时向 LLM 发送纠错提示，自动重试
- **Token 消费统计**：内置 `onTokenConsumption` 回调，记录每轮 token 使用
- **Index Adapter**：为不同 LLM（grok, gemini）的 tool_call index 格式提供适配器
- **反馈/回流系统**：OmFeedback 收集对话数据

**ZZ-AI-Chat 独有**：
- **MessageBridge 多端抽象**：同一个 TaskLoop 代码在 Web/Electron/SSC 三种环境运行
- **Redux 集成**：通过 `TaskLoopEventHandler` + `streamManagerMiddleware` 将 TaskLoop 事件映射为 Redux actions
- **无效消息清理**：每轮开始前自动过滤空的 assistant 消息
- **`Object.isExtensible` 防护**：处理 Redux frozen state 导致数组不可变的边界情况

**LeoChat 独有**：
- **后端代理模式**：后端可执行完整工具循环（`while toolRound < MAX_ROUNDS`），前端单次请求获取全部结果
- **ModelAdapter 体系**：为 OpenAI / Anthropic / Gemini / DeepSeek 四种流式格式提供独立适配器
- **Circuit Breaker + Retry**：生产级的错误恢复机制
- **Checkpoint 恢复**：`TaskLoop.resumeFromCheckpoint()` 静态方法支持从检查点重建实例
- **ContentItems 时序构建**：在 SSE 处理中用 `currentTextContent` flush 模式保持文本和工具调用的时序顺序
- **`final` 事件**：后端完成工具循环后发送完整消息历史，前端无需再循环

### 8.9 代码质量对比

| | OpenMCP-Client | ZZ-AI-Chat | LeoChat |
|--|---|---|---|
| **console.log 数量** | ~5 (主要 warn/error) | ~40+ (大量 debug 日志) | ~5 (主要 error) |
| **类型安全** | 中等 (多处 `any`) | 较低 (大量 `as any` 类型断言) | 较高 (严格 TS，少量 `as`) |
| **注释质量** | 简洁到位 | 过度注释（每行都有说明） | JSDoc + 关键逻辑注释 |
| **函数长度** | `start()` ~300 行 | `start()` ~430 行 | `start()` ~170 行 |
| **职责分离** | 合理（handle-tool-calls 独立模块） | 过度集中（全在一个类里） | 良好（retry, adapter, checkpoint 独立） |
| **Vue/React 耦合** | ✅ 耦合 (`Ref`, `ref()`) | ❌ 框架无关 | ❌ 框架无关 |

### 8.10 LeoChat TaskLoop 可改进方向

1. **JSON 纠错循环** ← OpenMCP
   工具参数解析失败时，向 LLM 发送纠错消息让其重新生成合法 JSON，而非简单降级为 `{ raw: ... }`。

2. **工具调用拦截钩子** ← OpenMCP
   支持 `onToolCall`（执行前修改参数）和 `onToolCalled`（执行后修改结果）的中间件模式，方便扩展。

3. **上下文长度截断** ← OpenMCP
   `messages.slice(-contextLength)` 控制发送给 LLM 的上下文长度，避免超出模型上下文窗口。当前 LeoChat 发送全量历史。

4. **工具调用计时** ← OpenMCP
   记录每个工具调用的 `timecost`，用于性能分析和 UI 展示。

5. **Token 消费统计** ← OpenMCP
   从 LLM 响应中提取 `usage` 信息，计算每轮 token 消耗，供 UI 和成本控制使用。

6. **减少深拷贝** — 自身优化
   当前用 `JSON.parse(JSON.stringify())` 深拷贝消息历史。Zustand 的 mutable state 不需要这样做，可以改为浅拷贝或直接引用（需评估 store 更新时机）。

---

## 9. 总结

LeoChat 的架构选型（Zustand + Hono + Radix + Tailwind）现代且简洁。核心对话和工具调用功能已完成。

**TaskLoop 层面**，LeoChat 在韧性设计（重试、熔断器、检查点）和多模型适配（ModelAdapter）上领先，但在功能完善度上不如 OpenMCP（缺少 JSON 纠错、工具拦截、Token 统计、上下文截断等实用功能）。

**下一步方向**：
1. 从 OpenMCP-Client 借鉴 TaskLoop 的**实用功能**（JSON 纠错、上下文截断、Token 统计、工具拦截钩子）
2. 吸取 ZZ-AI-Chat 的**最大教训**：多模式适配导致架构混乱、难以维护，MCP 大量自启动导致体验不流畅。LeoChat 应保持单一模式的简洁架构，MCP 连接按需懒加载
3. 保持当前架构风格，逐步补全功能
