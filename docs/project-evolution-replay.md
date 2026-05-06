# 项目开发复盘：从 ai-chat 到 LeoChat

> 基于代码仓库历史 commit 和文档变化的探索记录
> 探索时间：2026-05-06

---

## 一、时间线总览

```
2025-06-18  ai-chat 诞生（第一次 monorepo 尝试）
2025-06-21  迁移到 engine 架构，添加 Electron
2025-06-23  MCP 学习期（手写 HTTP 兼容层）
2025-06-24  第一个官方 SDK MCP server
2025-07-02  TaskLoop 诞生（从 Redux 迁移）
2025-07-04  "MCP跑通！" 里程碑
2025-08-10  开始使用 Claude Code（AI 编程转折点）
2025-08-10~09-04  架构失控期（大量修复、清理废弃代码）
2025-09-04  ai-chat 停止开发（进入 idle）
2025-09~2026-01  空白期（反思、重新设计）
2026-01-22  LeoChat 诞生
2026-02  Electron、i18n、主题系统
2026-04  LeoCard、SDK、Image Generation
```

---

## 二、ai-chat 项目详细演进

### 2.1 起步期（2025-06-18~20）

**Commit: `c3c0f49` "备份版本"**

初始结构：
```
zz-ai-chat/
├── web/           # React + Vite + Less
├── electron/      # Electron 主进程
├── iframe/        # iframe 嵌入模式
├── api/           # Express 后端
├── mcp-server/    # MCP server
├── mcp-python/    # Python MCP server
└── docs/          # 插件开发指南
```

**关键发现**：
- 项目名是 `zz-ai-chat`（不是 ai-chat）
- 一开始就有 `.openmcp/connection.json`（虽然为空 `[]`）
- **核心理念：XML 插件系统** —— 让 AI 输出 XML 标签，前端解析成 UI
- 技术栈：React + Vite + Zustand + Less + markdown-it

XML 插件系统的文档（`docs/plugin-development-guide.md`）：
```typescript
interface Plugin {
  id: string;
  xmlTags: {
    [tagName: string]: {
      render: (content: string, attributes: Record<string, string>) => string;
    }
  };
  systemPrompt?: string;  // 告诉 AI 如何使用这个插件
}
```

这和现在的 LeoCard 思路**本质相同**——结构化输出而不是纯文本，只是当时用 XML，现在用 JSON。

---

### 2.2 架构分层探索（2025-06-21）

**Commit: `d8d7048` "迁移到engine"**

把 `web/src/hooks/` 里的业务逻辑迁移到 `engine/` 目录：
- `engine/hooks/useChatMessages.ts`
- `engine/hooks/useChatList.ts`
- `engine/hooks/useLLMConfig.ts`

**受 OpenMCP 影响**：OpenMCP 的 `renderer/` + `service/` 分层 → 自己的 `web/` + `engine/` 分层

同时加入：
- `8eeeda2` "添加electron" —— Electron 主进程
- `f7c5910` "加入zustand-hub" —— Zustand 状态管理

---

### 2.3 MCP 学习期（2025-06-23~24）

**Commit: `fe9e6a4` "mcp实现前备份"**

文档爆发：
- `docs/api-integrations/mcp.md` —— 官方 SDK 中文翻译指南（188 行）
- `docs/api-integrations/mcp-deepseek-integration.md` —— DeepSeek + MCP 集成（91 行）
- `docs/api-integrations/deepseek.md` —— DeepSeek API 文档

**关键代码**（`engine/store/mcpStore.ts`）：
```typescript
// 手写 HTTP 兼容层，还没用官方 SDK
async function fetchMcpTools(url: string) {
  const candidates = [
    `${url}/tools`,
    `${url}/listTools`,
    `${url}/list-tools`
  ];
  // 兼容 { tools }, { data }, 直接数组三种格式
  const data = json.tools || json.data || (Array.isArray(json) ? json : []);
}
```

**认知状态**：还在理解 MCP 协议，以为它是"REST API 的变种"

---

**Commit: `f4658a7` "feat: add express server with echo and multiply tools, and integrate with MCP protocol"**

第一个使用官方 SDK 的 MCP server：
```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const server = new McpServer({ name: "demo-server", version: "1.0.0" });
server.registerTool("add", ...);
```

**转折点**：从手写 HTTP 到使用官方 SDK

---

### 2.4 TaskLoop 诞生（2025-07-02）

**Commit: `8804554` "将消息生成逻辑从 Redux 迁移到独立的 task-loop 系统"**

文件：`engine/stream/task-loop.ts`（134 行）

设计特点：
```typescript
export class TaskLoop {
  subscribe(listener) { ... }  // 统一事件流
  emit(event) { ... }
  async start(input: string) {
    for (let epoch = 0; epoch < MAX_EPOCHS; ++epoch) {
      // 多轮对话循环
    }
  }
}
```

**对比 OpenMCP**：
- OpenMCP：callback 注册模式（`registerOnChunk`, `registerOnToolCall`）
- ai-chat：subscribe/emit 事件流模式

**设计选择理由**：
- 统一事件类型（`TaskLoopEvent` 联合类型）
- 多实例（每会话一个 TaskLoop）
- 框架无关（不耦合 Vue reactive）

---

### 2.5 MCP 跑通（2025-07-04）

**Commit: `c148058` "MCP跑通！"**

大量文档产出：
- `docs/MCP_INTEGRATION_GUIDE.md` —— 集成指南
- `docs/MCP_TOOL_CREATION_GUIDE.md` —— 工具创建指南
- `docs/MCP_REFACTORING_GUIDE.md` —— 重构指南
- `docs/StreamableHTTPServerTransport_Analysis.md` —— 传输层分析
- `docs/mcp-tool-chain-implementation-summary.md` —— 工具链实现总结

从"教程翻译"文档变成了"实现总结"文档，说明认知已经从"学习协议"进入"设计架构"。

---

### 2.6 AI 编程转折点（2025-08-10）

**Commit: `fd1ad1e` "fix,refactor:修复了大量类型错误，重构了平台适配，重写了测试"**

**关键证据**：`.claude/settings.local.json` 出现！
```json
{
  "permissions": {
    "allow": [
      "Bash(node:*)",
      "Bash(pnpm run dev:web:*)",
      "Bash(pnpm run build:engine:*)",
      "WebFetch(domain:api-docs.deepseek.com)"
    ]
  }
}
```

**这是开始使用 Claude Code 的标志**。

变化：
- commit message 从中文短句变成英文描述
- 出现 `CODE_QUALITY_OPTIMIZATION_PHASE1.md` 和 `CODE_QUALITY_REPORT.md`
- 大量适配器代码：`deepseekAdapter.ts`、`openaiAdapter.ts`、`modelAdapterManager.ts`
- `messageConverter` 重新设计（UI → Storage → API 三层转换）

---

### 2.7 架构失控期（2025-08-10~09-04）

密集提交但质量下降：
- `fd1ad1e` 修复大量类型错误
- `b6e8dd8` refactor
- `a702bb3` fix: 重构类型
- `b522b30` "1"（无意义 commit message）
- `669286e` 修复类型报错
- `dd5b0f3` 修复 MessageBridge 硬编码问题
- `e180717` electron 模式适配 stdio，**修复大量报错**
- `4e63fc1` 清理废弃代码
- `7ac713c` 修复 systemprompt 丢失问题
- `1024fa8` demo 布局重构、**大量文档更新**（readme-ssc-linux 未完成）

**问题信号**：
- 不断"修复大量报错"
- "清理废弃代码"
- "未完成"的文档
- MessageBridge 硬编码问题反复出现
- commit message 变得随意（"1"、"fix"、"fifx"）

---

### 2.8 项目终结（2025-09-04）

**Commit: `381bccc` "Merge branch 'github' into idle"**

```diff
- claude_desktop_config.json   ← 删除
- COMMIT_4E63FC1_ANALYSIS.md   ← 删除
+ electron/config/mcp-servers.json
```

**ai-chat 最后一个 commit**。之后项目进入 idle 状态，再也没有更新。

---

## 三、空白期（2025-09~2026-01）

4个月的沉默期。基于后续 LeoChat 的设计，可以推断这段时间在：
- 反思 ai-chat 的架构失误（多模式适配、过度抽象、Redux 过重）
- 研究 OpenMCP 的源码（特别是 TaskLoop 和 Skill 系统）
- 重新设计 LeoChat 的架构

---

## 四、LeoChat 诞生（2026-01-22）

**Commit: `0e77c80` "1"**

和 ai-chat 最早的 "备份版本" 形成鲜明对比——**不再备份，直接开始**。

LeoChat 的初始结构：
```
LeoChat/
├── apps/web/              # React 19 + Vite
├── apps/electron/         # Electron
├── packages/shared/       # 类型 & 工具
├── packages/ui/           # Radix + Tailwind 组件
├── packages/mcp-core/     # MCP 客户端 & TaskLoop
├── packages/server/       # Hono 后端
└── packages/leochat-mcp/  # 内置 MCP 服务器
```

---

## 五、关键认知变化

### 5.1 对 MCP 协议的理解

| 时期 | 认知 | 代码体现 |
|------|------|---------|
| 6月23日 | "MCP 是 REST API 的变种" | 手写 HTTP 兼容层（`fetchMcpTools`） |
| 6月24日 | "应该用官方 SDK" | `new McpServer(...)` |
| 7月4日 | "MCP 需要完整的工具链支持" | TaskLoop + tool_calls + 多轮循环 |
| 8月 | "MCP 连接管理很复杂" | MCPManager、自动重连、多 transport |
| 2026年4月 | "Prompt 不是自动提示词注入" | `leochat-prompt-spec.md` |

### 5.2 对架构的分层理解

| 项目 | 分层方式 | 问题 |
|------|---------|------|
| ai-chat | `web/` + `engine/` + `electron/` + `api/` + `mcp-*` | 7个 workspace，职责混乱 |
| LeoChat | `apps/web/` + `apps/electron/` + `packages/*` | 6个包，依赖方向明确 |

### 5.3 对状态管理的反思

| 项目 | 方案 | 结果 |
|------|------|------|
| ai-chat | Redux Toolkit + 5层中间件 | 模板代码过多，frozen state 导致深拷贝 |
| LeoChat | Zustand + slice 分离 | 简洁，选择器天然细粒度 |

### 5.4 对 TaskLoop 的演进

| 项目 | 事件模式 | 运行位置 | 独特功能 |
|------|---------|---------|---------|
| OpenMCP | callback 注册 | 前端 | JSON 纠错、工具拦截、Token 统计 |
| ai-chat | subscribe/emit | 前端 | MessageBridge 适配、Redux 集成 |
| LeoChat | subscribe/emit | 前端/后端 | Backend Proxy、Circuit Breaker、Checkpoint |

---

## 六、OpenMCP 的具体影响

### 6.1 直接借鉴

| OpenMCP 设计 | LeoChat 对应 |
|-------------|-------------|
| `renderer/` + `service/` 分层 | `apps/web/` + `packages/server/` |
| TaskLoop 概念 | `packages/mcp-core/src/task-loop.ts` |
| Skill 系统（SKILL.md + YAML frontmatter） | `packages/leochat-sdk/src/skill.ts` |
| `read_skill_file` 工具 | `readSkillFile()` 函数 |
| 工具调用状态可视化 | `ToolCallBlock` 组件 |

### 6.2 反思改进

| OpenMCP 做法 | ai-chat 问题 | LeoChat 改进 |
|-------------|-------------|-------------|
| WebSocket 双向通信 | MessageBridge 过度复杂 | SSE 单向 + Backend Proxy |
| Vue reactive 耦合 | Redux frozen state 痛苦 | Zustand 天然可变 |
| 前端驱动工具循环 | 多端适配代码爆炸 | 后端代理完整循环 |
| 7 种 callback 类型 | Redux action 映射冗长 | 统一事件流 + 丰富事件类型 |

### 6.3 发现协议的盲区

通过对比 OpenMCP、Claude Code 和 LeoChat，发现了 MCP 协议的设计盲区：

- `InitializeResult.instructions` 字段被生态忽略
- Server 作者不写，Client 作者不用
- 导致大家被迫用 tool description 或 prompts 来传递使用指南

---

## 七、反面教训（ai-chat 踩过的坑）

| 问题 | ai-chat 的做法 | LeoChat 如何避免 |
|------|--------------|----------------|
| **多模式导致难以维护** | Web/Electron/SSC 三端适配 | 先做好 Web 一种模式 |
| **MCP 启动策略失当** | Electron 启动前大量 MCP Server 自启动 | MCP 懒加载，按需启动 |
| **过度抽象** | MessageBridge V1→V2 迁移，大量废弃代码 | 不要提前抽象 |
| **状态管理过重** | Redux Toolkit + 5层中间件 | Zustand 简洁 |
| **深拷贝开销** | Redux frozen state + deep copy | Zustand mutable state |
| **配置散落** | 5+ store slice + localStorage + .env 三套 | 统一配置源 |
| **调试日志遗留** | 40+ console.log 留在生产代码 | 构建时环境变量控制 |

---

## 八、关键 commit 索引

### ai-chat

| Commit | 日期 | 意义 |
|--------|------|------|
| `c3c0f49` | 2025-06-18 | 项目诞生，XML 插件系统 |
| `d8d7048` | 2025-06-21 | 迁移到 engine 架构 |
| `fe9e6a4` | 2025-06-23 | MCP 学习期，手写 HTTP 兼容层 |
| `f4658a7` | 2025-06-24 | 第一个官方 SDK MCP server |
| `8804554` | 2025-07-02 | **TaskLoop 诞生** |
| `c148058` | 2025-07-04 | "MCP跑通！" 里程碑 |
| `fd1ad1e` | 2025-08-10 | **开始使用 Claude Code** |
| `381bccc` | 2025-09-04 | 项目停止，进入 idle |

### LeoChat

| Commit | 日期 | 意义 |
|--------|------|------|
| `0e77c80` | 2026-01-22 | 项目诞生 |
| `a6da1ca` | 2026-04-09 | LeoCard 系统 |
| `3147b72` | 2026-04-09 | LeoAgent SDK + CLI |
| `499335f` | 2026-04-13 | Zustand slice 拆分 |
| `d4ebe22` | 2026-04-16 | 多模型支持 |
| `c9e86a2` | 2026-04-17 | Image Generation |
| `cbe5dea` | 2026-04-18 | Timeout/Retry/Abort |
| `409dbe7` | 2026-04-19 | Image Refinement |
| `999ccb4` | 2026-04-20 | E2E 测试 + UX 评估 |

---

## 九、文档演进

### ai-chat 时期

| 阶段 | 文档特征 | 代表文件 |
|------|---------|---------|
| 学习期 | 官方文档翻译 | `docs/api-integrations/mcp.md` |
| 实现期 | 实现总结报告 | `docs/MCP_TOOL_CREATION_GUIDE.md` |
| 失控期 | 大量删除 | `3700423` "del"、`c82b68e` "过期文档删除" |

### LeoChat 时期

| 文档 | 内容 | 认知水平 |
|------|------|---------|
| `docs/comparison.md` | 554行：三个项目深度对比 | 架构评审 |
| `docs/refactor-directions.md` | 重构方向：command vs content vs prompt | 设计决策 |
| `docs/leochat-prompt-spec.md` | Prompt 规范：三层分离 | 协议理解 |
| `docs/leochat-agent-sdk-spec.md` | SDK 设计规范 | 产品化思维 |
| `docs/leochat-card-spec.md` | Card 结构化输出规范 | 交互设计 |

---

## 十、总结

> **ai-chat 是"模仿 OpenMCP 做一个 Chatbox"的尝试；LeoChat 是"理解了 OpenMCP 的架构思想后，做出自己的产品"的结果。**

从手写 HTTP 兼容层到使用官方 SDK，从粗糙的 TaskLoop 到完整的 Backend Proxy 模式，从自研状态管理到 pnpm workspaces——每一步都能看到 OpenMCP 的影响，但 LeoChat 最终走出了自己的方向（终端用户产品 vs 开发者工具）。

最大的认知转变：
1. **从"学习协议"到"设计架构"**（6月→7月）
2. **从"前端驱动"到"后端代理"**（ai-chat→LeoChat）
3. **从"自动注入 prompt"到"用户触发模板"**（4月 blog）
4. **从"多模式适配"到"单一模式精简"**（ai-chat 教训→LeoChat 设计）
