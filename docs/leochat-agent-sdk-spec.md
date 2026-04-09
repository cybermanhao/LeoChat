# LeoChat Agent SDK Spec

> 版本：v3（新增 Context Assembly 层，为记忆系统预留扩展点）

---

## 0. 代码现实约束（spec 的上界）

在设计任何 API 之前，必须承认当前代码的四个现实约束：

### 约束 1：TaskLoop 的历史不是干净的公共历史

`TaskLoop` 在构造时会把 `systemPrompt` 注入内部历史，`internalMessages`（done 事件输出）天然混有宿主注入的 system message。若 SDK 直接把它包装成 `AgentResult.history` 并鼓励下次原样传回，会导致 system prompt 重复注入或宿主配置泄漏。

**结论**：SDK 必须在 `ainvoke` 完成后做一次过滤，把 system message 从 `history` 中剥离，只保留 `user / assistant / tool` 消息。

### 约束 2：model-adapter.ts 是真正的协议适配层

当前 `model-adapter.ts` 承担的不只是"provider 名称映射"，而是：
- OpenRouter 专属 header
- Anthropic 的 system/messages/tool schema 差异
- stream chunk 格式解析差异
- reasoning delta 检测（DeepSeek / o1）
- usage 字段映射

Vercel AI SDK 可以统一 `streamText` 调用框架和主流 provider，但 OpenRouter 的自定义 header、DeepSeek 的 reasoning 字段等细节未必覆盖。**不能假设"删掉 adapter 直接上"**，需要保留一层 LeoChat 自己的 provider shim。

### 约束 3：TaskLoop 有两种执行模式

`TaskLoop` 支持直连 provider 和 `useBackendProxy` 两种模式。SDK v1 明确为 Node.js only，只暴露直连模式，`useBackendProxy` 在 SDK 上下文中禁用/不暴露。

### 约束 4：TaskLoop 已有拦截钩子，是重要扩展点

`registerOnToolCall` / `registerOnToolCalled` 是现有的 pre/post 工具调用钩子，对 tracing、审计、skill wrapping、CLI 可观测性都有价值。SDK 高层 API 必须把它们作为一等公民暴露，而不是默默丢掉。

---

## 1. 目标

将 LeoChat 的核心 AI 能力打包为可嵌入的 Node.js SDK，让第三方 TS/JS 项目可以直接引入使用，无需运行 LeoChat 完整应用。

同时在此 SDK 之上构建官方 CLI 客户端，作为 SDK 能力的第一个消费者和参考实现。

---

## 2. 动机

### 当前状态

LeoChat 的核心引擎（`TaskLoop`）已经是框架无关的事件驱动架构，理论上可以在任何 Node.js 环境中运行。但目前：

- 配置来自 Zustand store，与 React 应用深度耦合
- 没有高层 `ainvoke()` 风格的简洁 API
- MCP server 连接依赖 GUI 配置流程
- 没有 CLI 入口

### 参考项目

OpenMCP 的 `openmcp-sdk` 提供了清晰的设计方向：
- `OmAgent.loadMcpConfig(path)` — 从标准 JSON 文件加载配置
- `OmAgent.ainvoke({ messages })` — 一句话调用 agent
- Skill 系统 — `listSkills / loadSkillContent / readSkillFile` 三级加载

**关键区别**：LeoChat 不需要 MessageBridge（运行时环境检测），因为 SDK 明确定位为纯 Node.js。

---

## 3. 范围

### In Scope

- `packages/leochat-sdk/` — 新的 SDK 包，两层 API
- `packages/leochat-cli/` — 基于 SDK 的命令行客户端
- 支持从 JSON 配置文件加载 MCP server（兼容 Claude Desktop 格式）
- provider 层引入 Vercel AI SDK 作为骨架，保留 LeoChat shim 层
- Agent Skill 支持（兼容 Claude / agentskills.io 标准）
- Context Assembly 层（轻量，为记忆系统预留扩展接口）

### Out of Scope（v1）

- 浏览器兼容性（明确 Node.js only，`engines: { node: ">=18" }`）
- MessageBridge / 运行时环境检测
- GUI 组件
- **LeoCard**：SDK v1 不承诺返回或渲染 LeoCard，tool result 中的 card JSON 当作普通文本透传。CLI v1 不做 card 降级显示。如需支持，后续单开 `structuredArtifacts` 扩展层。
- `useBackendProxy` 模式（SDK 上下文中禁用）
- 记忆系统（Context Assembly 层预留接口，但不实现）
- token 预算管理（`ContextSlot.priority` / `maxTokens` 字段预留，不实现）

---

## 4. 架构

```
packages/
  mcp-core/          ← 现有：TaskLoop、MCP client（不变）
  leochat-sdk/       ← 新增：LeoAgent 高层 API
  leochat-cli/       ← 新增：CLI 客户端（正式发布产物，非内部工具）

apps/
  web/               ← 现有（不变）
  electron/          ← 现有（不变）
```

### 依赖关系

```
@leochat/cli
  └─→ @leochat/sdk
        ├─→ @leochat/mcp-core (TaskLoop)
        └─→ ai + @ai-sdk/* (Vercel AI SDK)
              └─→ mcp-core/src/provider-shim.ts (LeoChat 兼容层)
```

---

## 5. provider 层迁移（前置工作）

### 策略：引入骨架，保留 shim，不全删

```
model-adapter.ts（现有，530 行）
  ↓ 拆分
mcp-core/src/provider-shim.ts  ← 保留 LeoChat 特有细节
  + ai / @ai-sdk/*             ← 接管 streamText、chunk 解析、主流 provider
```

### 哪些交给 Vercel AI SDK

- `streamText()` 调用框架
- OpenAI / Anthropic / Google 原生 provider（官方维护）
- stream chunk 解析（`fullStream` 异步迭代器）
- tool calling 主流程

### 哪些保留在 provider-shim.ts

- OpenRouter：自定义 header（`HTTP-Referer`、`X-Title`）→ 通过 `createOpenAI` 的 `headers` 选项注入
- DeepSeek：reasoning delta（`delta.reasoning_content`）→ 在 shim 里后处理 `fullStream`
- 自定义 baseURL provider（`custom` 类型）→ shim 工厂函数
- usage 字段映射统一

### 代码结构

```ts
// mcp-core/src/provider-shim.ts
export function createLeoProvider(config: LLMConfig): LanguageModelV1 {
  switch (config.provider) {
    case "openai":
      return createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL })(config.model);
    case "anthropic":
      return createAnthropic({ apiKey: config.apiKey })(config.model);
    case "google":
      return createGoogleGenerativeAI({ apiKey: config.apiKey })(config.model);
    case "openrouter":
      return createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL || "https://openrouter.ai/api/v1",
        headers: { "HTTP-Referer": "https://leochat.app", "X-Title": "LeoChat", ...config.headers },
      })(config.model);
    case "deepseek":
      return createOpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL || "https://api.deepseek.com/v1",
      })(config.model);
    case "custom":
      return createOpenAI({ apiKey: config.apiKey, baseURL: config.baseURL })(config.model);
  }
}
```

### 需要保留（不动）

- `TaskLoop` 所有公共 API
- retry / circuit breaker / checkpoint 逻辑
- 上下文截断逻辑
- token 统计
- `registerOnToolCall` / `registerOnToolCalled` 钩子

### 最终删除

- `packages/mcp-core/src/model-adapter.ts`（在 shim 稳定验证后）

---

## 6. LeoAgent API 设计

### 6.1 高层 API（`LeoAgent`）

```ts
import { LeoAgent } from "@leochat/sdk";

const agent = new LeoAgent();

// 从配置文件加载（兼容 Claude Desktop / OpenMCP 格式）
agent.loadConfig("./mcp.json");

// 或代码配置
agent.setLLM({
  provider: "openrouter",
  apiKey: process.env.OPENROUTER_API_KEY,
  model: "anthropic/claude-sonnet-4-5",
});

agent.addMCPServer({
  name: "ecommerce",
  command: "node",
  args: ["mcp-servers/ecommerce/dist/index.js"],
});

// 加载 skill
agent.loadSkills("./skills/");

// 一句话调用
const result = await agent.ainvoke("帮我查一下耳机的库存");
console.log(result.text);

// 带历史的多轮对话（history 不含 system message）
const result2 = await agent.ainvoke({
  messages: "第一个加入购物车",
  history: result.history,  // 透传上次的 history
});

// 注册工具调用钩子（暴露 TaskLoop 的拦截能力）
agent.onToolCall((toolCall) => {
  console.error(`[pre]  ${toolCall.name}`, toolCall.arguments);
  return toolCall; // 可修改
});
agent.onToolCalled((toolCallId, result) => {
  console.error(`[post] ${toolCallId}`);
  return result;  // 可修改
});
```

### 6.2 配置文件格式

兼容 Claude Desktop 格式：

```json
{
  "mcpServers": {
    "ecommerce": {
      "command": "node",
      "args": ["mcp-servers/ecommerce/dist/index.js"],
      "cwd": "/path/to/leochat"
    }
  },
  "defaultLLM": {
    "provider": "openrouter",
    "apiKey": "${OPENROUTER_API_KEY}",
    "model": "anthropic/claude-sonnet-4-5"
  }
}
```

环境变量占位符（`${VAR_NAME}`）在加载时自动展开。

### 6.3 低层 API（直接使用 `TaskLoop`）

```ts
import { createTaskLoop } from "@leochat/sdk/core";

const loop = createTaskLoop({
  chatId: "script-001",
  llmConfig: { provider: "openrouter", apiKey: "...", model: "..." },
  mcpTools: [...],
  onToolCall: async (name, args) => { /* 自行执行工具 */ },
  // useBackendProxy 在 SDK 上下文中不可用
});

loop.on("chunk", ({ content }) => process.stdout.write(content));
loop.on("toolcall", ({ name }) => console.error(`[tool] ${name}`));
loop.on("done", () => {});

await loop.run("生成订单报告");
```

### 6.4 返回值

```ts
interface AgentResult {
  text: string;                     // 最终文本输出
  toolCalls: ToolCallRecord[];      // 所有工具调用记录
  usage: { input: number; output: number };  // token 统计
  /**
   * 可回放的对话历史。
   * 只含 user / assistant / tool 消息，不含 system message。
   * 可直接传入下次 ainvoke({ history }) 实现多轮对话。
   * 注意：这是 public contract，不是 TaskLoop 内部 internalMessages 的直接暴露。
   */
  history: ReplayableMessage[];
}
```

---

## 7. CLI 设计

位置：`packages/leochat-cli/`（正式发布产物，不是内部工具）

### 7.1 单次执行

```bash
leochat "帮我查一下耳机库存" --config ./mcp.json
leochat "生成销售报告" --model anthropic/claude-opus-4-5 --stream
leochat "分析数据" --skill sales-analyst --config ./mcp.json
```

### 7.2 交互模式

```bash
leochat --interactive --config ./mcp.json

> 帮我查一下耳机
[tool] product_search { keyword: "耳机" }
找到 3 件商品：Sony WH-1000XM5、AirPods Pro 2...

> /exit
```

### 7.3 LeoCard 处理

v1 CLI 不做 card 降级渲染。tool result 中的 card JSON 当作普通 assistant 文本输出，不做特殊处理。

---

## 8. 包结构

### `packages/leochat-sdk/`

```
src/
  index.ts              ← 公共导出
  core.ts               ← 低层导出（createTaskLoop）
  agent.ts              ← LeoAgent 类
  config.ts             ← loadConfig()、env 变量展开
  context.ts            ← ContextSlot、buildSystemPrompt（Context Assembly 层）
  skill.ts              ← loadSkills()、skill → ContextSlot 转换
  history.ts            ← internalMessages → ReplayableMessage 过滤
  types.ts              ← AgentResult、ReplayableMessage、ContextSlot 等公共类型
package.json            ← name: "@leochat/sdk", engines: { node: ">=18" }
```

### `packages/leochat-cli/`

```
src/
  index.ts          ← CLI 入口（commander）
  interactive.ts    ← 交互模式（readline）
  stream-printer.ts ← 流式输出
  tool-printer.ts   ← tool call/result 终端输出
package.json        ← name: "@leochat/cli", bin: { leochat: "./dist/index.js" }
```

---

## 9. Context Assembly（上下文组装）

### 动机

LeoAgent 的 system prompt 由多个来源组合而成：用户自定义指令、skill 内容、未来的记忆检索结果。需要一个统一的组装层，而不是各处散落的字符串拼接。

此层现在只实现最小功能。`priority` / `maxTokens` 字段为记忆系统预留，v1 不实现。

### ContextSlot 接口

```ts
// src/types.ts
export interface ContextSlot {
  /** 语义 key，决定注入格式：<context name="${key}">...</context> */
  key: string;
  /** 注入内容 */
  content: string;
  /**
   * 优先级（数字越大越重要）。
   * v1 不实现裁剪逻辑，仅作为记忆系统的预留字段。
   * 未来当 token 超限时，低优先级 slot 先被丢弃。
   */
  priority?: number;
  /**
   * 该 slot 的最大 token 预算。
   * v1 不实现，预留给记忆系统的多条目注入场景。
   */
  maxTokens?: number;
}
```

### Key 命名约定

```
skill:<name>      → skill 内容，如 skill:sales-analyst
memory:<scope>    → 记忆系统（v1 不实现），如 memory:recent、memory:project
project:<name>    → 项目级上下文（如 CLAUDE.md 风格的项目说明）
```

### buildSystemPrompt

```ts
// src/context.ts
// 参考 claude-code-sourcemap services/claude.ts formatSystemPromptWithContext 的权威实现

export function buildSystemPrompt(
  userPrompt: string,
  slots: ContextSlot[],
): string[] {
  if (slots.length === 0) return [userPrompt];

  return [
    userPrompt,
    "\nAs you answer the user's questions, you can use the following context:\n",
    ...slots.map(
      ({ key, content }) => `<context name="${key}">${content}</context>`
    ),
  ];
}
```

### 运行时流程

```
ainvoke() 调用
  │
  ├─ skill.ts: 加载激活的 skill → ContextSlot[]
  │    key: "skill:sales-analyst"
  │
  ├─ (未来) memory.ts: 检索相关记忆 → ContextSlot[]
  │    key: "memory:recent"
  │
  └─ context.ts: buildSystemPrompt(userPrompt, [...skillSlots, ...memorySlots])
       → string[]  →  传入 TaskLoop
```

### 与 skill 的关系

Skill 内容通过 `ContextSlot` 进入组装管道，不直接拼接到 system prompt。skill.ts 负责把 SKILL.md 正文转换为 `ContextSlot`，context.ts 负责最终格式化。

---

## 10. Agent Skill 支持

### 格式标准

兼容 [agentskills.io](https://agentskills.io) 开放标准（Anthropic 发布）。Skill 是目录结构：

```
skills/
  sales-analyst/
    SKILL.md          ← 必须，正文建议 <200 行
    references/       ← 可选，agent 按需读取
    scripts/          ← 可选
    assets/           ← 可选
```

`SKILL.md` frontmatter 支持字段：

```markdown
---
name: sales-analyst
description: 用于销售数据分析、报表生成等场景
version: 1.0.0
model: claude-sonnet-4-5          # 可选，覆盖默认模型
allowed-tools: [read_file]        # 可选
disable-model-invocation: false   # true = 仅显式调用
user-invocable: true
---
```

### 三级加载机制

```
级别 1：元数据（始终在上下文，~100 词）
级别 2：SKILL.md 正文（显式/自动触发时加载，转为 ContextSlot 注入）
级别 3：references/*（agent 按需通过工具读取，不自动注入）
```

references 的按需读取参考 OpenMCP 实现：从正文 markdown 链接提取可读文件列表，由 agent 自行决定何时调用 `read_skill_file` 工具。

### 注入格式（via Context Assembly）

```
[用户 system prompt]

As you answer the user's questions, you can use the following context:
<context name="skill:sales-analyst">
（SKILL.md 正文）
</context>
```

此格式与 Claude Code 注入 `gitStatus`、`claudeFiles`、`readme` 等上下文完全一致，模型已针对此格式优化。

### 验收标准

- [ ] `listSkills()` 只读元数据，不加载正文
- [ ] 显式 `{ skill: "name" }` 时注入正文
- [ ] `autoSkill: true` 时语义匹配最相关 skill
- [ ] `references/` 不自动注入，通过工具按需读取
- [ ] CLI `--skill name` 参数支持
- [ ] SKILL.md 超 200 行时 warn

---

## 11. 实现顺序

### Phase 1：provider shim（前置，不阻塞其他开发）

1. 安装 `ai`、`@ai-sdk/openai`、`@ai-sdk/anthropic`、`@ai-sdk/google`
2. 新建 `mcp-core/src/provider-shim.ts`
3. 修改 `task-loop.ts` 使用 `streamText + fullStream`，DeepSeek reasoning 在 shim 后处理
4. 回归验证现有 Web / Electron 功能
5. 验证稳定后删除 `model-adapter.ts`

### Phase 2：SDK 包

1. 创建 `packages/leochat-sdk/`
2. 实现 `history.ts`（internalMessages 过滤，剥离 system）
3. 实现 `context.ts`（`ContextSlot`、`buildSystemPrompt`）
4. 实现 `LeoAgent`：loadConfig、setLLM、addMCPServer、ainvoke
5. 暴露 `onToolCall` / `onToolCalled` 钩子
6. 实现 `skill.ts`（三级加载，输出 `ContextSlot`）
7. 导出低层 `createTaskLoop`

### Phase 3：CLI

1. 创建 `packages/leochat-cli/`
2. 单次执行模式
3. 交互模式（readline REPL，history 自动传递）
4. `--skill` 参数

---

## 12. 验收标准

### provider shim

- [ ] `provider-shim.ts` 覆盖：openai / anthropic / google / openrouter / deepseek / custom
- [ ] OpenRouter header 正确注入
- [ ] DeepSeek reasoning delta 正确处理
- [ ] `model-adapter.ts` 删除后现有功能不变

### SDK

- [ ] `import { LeoAgent } from "@leochat/sdk"` 可用
- [ ] `loadConfig` 兼容 Claude Desktop 格式，支持 `${ENV}` 展开
- [ ] `ainvoke(string)` 和 `ainvoke({ messages, history })` 均工作
- [ ] `result.history` 不含 system message，可安全传回下次调用
- [ ] `onToolCall` / `onToolCalled` 钩子生效
- [ ] `useBackendProxy` 在 SDK 中不可用（或抛出明确错误）

### CLI

- [ ] `leochat "query" --config mcp.json` 单次执行
- [ ] `leochat --interactive` REPL 模式，history 自动跨轮传递
- [ ] `--skill name` 显式指定 skill

### Context Assembly

- [ ] `buildSystemPrompt` 输出格式与 Claude Code `formatSystemPromptWithContext` 一致
- [ ] `ContextSlot` 接口导出，第三方可扩展（为记忆系统预留）
- [ ] skill 内容通过 `ContextSlot` 进入组装管道，不直接拼接

### Skill

- [ ] 三级加载正确工作
- [ ] `result.history` 不含注入的 skill system prompt（skill 是宿主配置，不进公共历史）
