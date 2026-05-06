# 博客大纲：MCP Prompt 的边界与协议空白——从 LeoChat 实现到 OpenMCP 的启发

> 感谢 OpenMCP 作者在 agent 架构上的引路。本文是我在实现 LeoChat 过程中，对 MCP Prompt 设计意图的一些思考梳理，供同行参考和指正。

---

## 1. 引言：一次实现引发的困惑

- 背景：我在开发 LeoChat 的 MCP 支持时，遇到了 prompt 架构的抉择
- 初始假设（现已修正）：MCP Prompt 是一种"自动提示词注入"机制
- 这个假设直接影响了 LeoChat 的 prompt 分层设计
- 后来对比 OpenMCP 和 Claude Code 的实现，发现各家对 Prompt 的理解并不相同
- 本文不是"科普"，而是记录我在这个过程中的认知变化，以及对协议空白的一点观察

---

## 2. 我的初始假设：Prompt 作为 Server 自我说明

### 2.1 这个假设从何而来

- 从 Server 开发者视角："我提供了工具，自然应该把'怎么用'封装在包里"
- 从 Client 开发者视角："连接 server → 获取 prompts → 自动加载到上下文"
- 看起来像是 OpenAPI description 的延伸

### 2.2 这个假设在 LeoChat 中的落地

```typescript
// LeoChat 早期的做法（已计划重构）
const allPrompts = mcpPromptCache.values().join('\n');
const systemPrompt = customPrompt + allPrompts;
```

- 把所有 no-arg prompts 无条件拼进 system prompt
- 用户无感知，server 无法控制注入范围

### 2.3 这个假设的问题

- System prompt 膨胀、不可控
- 每个请求携带 server 的"说明书"
- 但最大的问题是：**如果 Prompt 只是自动注入，协议不需要单独设计一套 `prompts/list` + `prompts/get` + 参数化机制**

---

## 3. 协议的意图：Prompt 是模板引擎，不是配置通道

### 3.1 从 API 设计反推

- `prompts/get(name, arguments)` → **参数化渲染**
- 返回 `PromptMessage[]` → **消息片段**，不是字符串
- 协议原文："reusable prompt **templates** and **workflows**"

### 3.2 与 Tool 的对比

| | Tool | Prompt |
|--|------|--------|
| 返回 | 执行结果 | 消息内容 |
| 调用方 | LLM 决定 | **用户决定** |
| 作用域 | 外部世界 | 对话上下文 |

Prompt 的调用方是**用户**，不是 LLM。这一点很关键。

### 3.3 我的修正

理解了这一点后，LeoChat 正在重构 prompt 架构：
- System prompt 完全由 host 控制
- MCP Prompts 作为 user message 插入（用户主动触发）
- 参考了 Claude Code 的做法

---

## 4. 三家实现的对比：不同选择，不同权衡

### 4.1 Claude Code：Prompt 作为对话消息

```typescript
// /server:promptName → prompts/get → 包装为 user message
const messages = result.messages.map(m => ({
  role: 'user',
  content: wrapInXml(m)
}));
```

- System prompt 保持静态
- Prompt 结果是**对话片段**
- 最贴近协议的字面设计

### 4.2 OpenMCP：Skill 系统作为补充层

- Skill（SKILL.md）注入 system prompt，但通过 `/skillName` 用户主动选择
- MCP Prompt 也有支持，但 Skill 是更主要的"能力封装"方式

**我的理解**：OpenMCP 的 Skill 系统不是"误用 prompt"，而是在**协议缺失的层面做了补充**。

### 4.3 LeoChat：早期走了弯路

- Auto-inject 到 system prompt
- 正在向"用户触发 + 消息插入"模式迁移

### 4.4 对比不是比高下，而是看不同场景的选择

| | Claude Code | OpenMCP | LeoChat（目标）|
|--|-------------|---------|---------------|
| Prompt | User message | User 触发的 skill | User message |
| Server 指南 | 靠 tool description | Skill 系统 | Skill 系统 + tool description |
| 架构重心 | CLI 工具 | VS Code 扩展 | 独立聊天应用 |

---

## 5. 协议的空白区：Server 使用指南该由谁维护？

### 5.1 修正后的新困惑

当我把 Prompt 从"自动注入"重新定位为"用户模板"后，产生了一个实际问题：

> Agent 怎么知道如何正确使用这个 Server 的工具？

Tool description 可以写，但有长度限制。复杂的使用模式（最佳实践、常见组合）很难塞进去。

### 5.2 这不是"某个项目做错了"

我越来越觉得这不是实现层面的问题，而是**协议层面的空白**：

```
✅ tools/list       → 机器可读的 schema
✅ resources/list   → 资源目录
✅ prompts/list     → 用户触发的对话模板
❌ ???              → Server 级别的使用说明/最佳实践
```

### 5.3 几种填补方式

| 方式 | 维护者 | 优点 | 局限 |
|------|--------|------|------|
| Tool description | Server 作者 | 标准、自动传递 | 长度受限 |
| MCP Prompt | Server 作者 | 可参数化 | 需用户触发，不适合"默认知识" |
| Client Skill | Client/社区 | 可控、可组合 | 需要人工维护，不随 server 更新 |

OpenMCP 的 Skill 系统选择了第三条路，在 VS Code 扩展这个场景下是合理的。

### 5.4 一点设想

如果协议未来有一个轻量的 `server/documentation` 或 `instructions` 字段（初始化时返回，有长度限制），可能可以填补这个空白。但当前协议下，没有标准答案。

---

## 6. 结语：从引路人的实践中学习

- 回顾整个过程：我从"自动注入"的假设出发，通过对比 OpenMCP 和 Claude Code 的实现，逐步修正了认知
- OpenMCP 的 Skill 系统让我意识到：**协议的空白需要 client 层自己填补**，而填补的方式取决于产品形态
- 对 VS Code 扩展来说，Skill 是合理的补充；对独立聊天应用来说，可能更需要 prompt-as-message 的简洁
- 没有唯一正确的答案，只有不同场景下的权衡

---

## 附录：参考与致谢

- [Model Context Protocol Specification](https://modelcontextprotocol.io)
- [OpenMCP](https://github.com/OpenMCP/openmcp-client) —— 我的 agent 架构引路项目
- [LeoChat](https://github.com/cybermanhao/LeoChat) —— 本文的实践来源
- Claude Code —— 参考了其 prompt 处理方式

---

> 致 OpenMCP 作者：
> 
> 本文不是批评，而是梳理。OpenMCP 是我研究 agent 架构的起点，Skill 系统的设计让我看到了"协议不足时 client 如何自保"的思路。如果方便，很想听听你对"Skill 与 MCP Prompt 边界"的看法——特别是 Skill 作为 system prompt 注入和 Prompt 作为 user message 插入，在你看来是否是互补的两种模式？
