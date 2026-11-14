# 同类 agent core 对比（2026-11）

> 2026-11-14 整理。目的：在动手实现 `@leochat/core` 之前，用同类项目检验 `docs/superpowers/specs/2026-11-14-leochat-core-design.md`。
> 资料来源：dsh 读的是本地源码和 README；其他项目读的是官方文档（链接见文末）。Mastra、Claude Agent SDK 没有深入看：前者是带工作流和记忆的大框架，后者需要拉起 Claude Code 进程、跑不了 Workers，和我们的定位都不同。

## 1. 参照对象

| 项目 | 定位 | 跑在哪里 | 对我们的价值 |
|---|---|---|---|
| **dsh**（`packages/core`、`packages/llm`） | DeepSeek 官方 harness；插件化、事件溯源 | Node 长期运行的进程 | 消息和块模型、原样回放、工具并发、审批 |
| **Vercel AI SDK**（v6/v7） | 通用 TS AI SDK，带 agent 循环和 UI 协议 | Node / Edge / 浏览器 | 停止条件、`prepareStep`、审批的暂停与恢复、UI parts、实验性的插话（steering） |
| **OpenAI Agents SDK（JS）** | agent 编排（handoff、guardrail） | Node | 人工介入时中断运行、`RunState` 序列化，以及**安全注意事项** |
| **pi-mono**（pi-ai、pi-agent-core） | 轻量的统一 LLM 接口加 agent 循环 | Node / 浏览器 | 和我们的设计最接近；插话和后续消息队列、工具执行模式、自定义消息类型 |

一个值得注意的事实：**dsh 自己就是用 pi-ai 来接入 DeepSeek 以外的 provider 的**（`packages/llm/llm-pi-ai`）。DeepSeek 官方用的是自己写的原生适配器（`llm-deepseek`，走 Messages 端点）。

## 2. 逐项对比

### 2.1 消息和块模型

| | dsh | Vercel | pi-ai | 我们的设计文档 |
|---|---|---|---|---|
| 角色 | system / **developer** / user / assistant / tool | system / user / assistant / tool | user / assistant / toolResult（system 单独放） | system / user / assistant / tool |
| 工具调用参数 | **`arguments: string`，保存模型产出的原始 JSON** | 解析后的 input | 解析后的 arguments（流式时尽量解析不完整的 JSON） | 解析后的 `input`，原始字符串放进 `providerData.rawInput` |
| thinking | `reasoning` 块，签名之类放在消息的 `replayState` 里 | reasoning part 加 provider metadata | `thinking` 块 | `thinking` 块加 `providerData` |
| 服务端工具 | **没有建模**（dsh 的联网搜索用自己的客户端工具） | 有 provider-executed tools | 没有 | `server_tool_use` / `server_tool_result` |
| 动态工具 | 用 `developer` 消息加 `tool-addition` / `tool-removal` 块，**不改写请求头，所以不破坏前缀缓存** | `activeTools` 按 step 切换 | 赋值 `agent.state.tools` | 没有考虑 |

**启发：**
- **工具参数应该以原始字符串为准（参考 dsh）。** DeepSeek 前缀缓存要求历史消息逐字节一致。如果把解析后的对象重新序列化，键顺序或空格一变就会导致缓存未命中。改成 `ToolUseBlock.arguments: string` 作为准确值，`input` 作为解析后的派生字段。
- 动态工具（例如 MCP 的 `listChanged`、harness 运行中途加工具）以后会遇到。dsh 的 developer 消息方案很好，第一期先不做，在设计文档里记下。

### 2.2 循环控制

| | dsh | Vercel | OpenAI Agents | pi-agent-core | 我们 |
|---|---|---|---|---|---|
| 步数上限 | 由配置决定 | `stopWhen: isStepCount(n)`，可以组合多个条件；`ToolLoopAgent` 默认 20 | `maxTurns` 默认 10，超出时抛 `MaxTurnsExceededError` | `finishTurn` 返回 continue 或 end | `maxSteps` 默认 10 |
| 每个 step 前的钩子 | `agent/request` 扩展点 | **`prepareStep`**：可以改 model、activeTools、toolChoice、messages、采样参数 | `callModelInputFilter` | `prepareRequest`、`transformContext` | 列为待定问题 |
| 自定义停止条件 | — | `hasToolCall(...)`、自定义函数 | `errorHandlers` 把错误转成输出 | `finishTurn` | 没有 |

**启发：** 四家都有"每个 step 前的钩子"，这是标配。应该从待定问题提升为第一期功能：`prepareStep`。Compactor 也可以作为 `prepareStep` 的一个实现，Vercel 的 `pruneMessages` 就是这样定位的。停止条件改成 `stopWhen`，可以组合多个。

### 2.3 工具

| | dsh | Vercel | OpenAI Agents | pi-agent-core | 我们 |
|---|---|---|---|---|---|
| 并发 | `maxParallelToolCalls` 默认 10；**区分可并行和必须独占的调用** | `toolCallConcurrency` | — | **每个工具可设 `executionMode: sequential \| parallel`**，批次里只要有一个 sequential 就整批串行 | 一律 `allSettled` 并行 |
| 结果顺序 | 按原顺序 | 按原顺序 | — | 结束事件按完成顺序发出，持久化的结果按原顺序 | 按原顺序 |
| 参数错误 | 返回错误结果 | `repairToolCall`，可以换更强的模型来修复 | — | 抛错后变成 `isError` 结果 | 返回错误结果，让模型修正 |
| 执行中的进度 | — | `onInputDelta`（入参流式） | — | `execute(..., onUpdate)` 加 `tool_execution_update` 事件 | 没有 |
| 给模型看的内容 | — | `toModelOutput` | `toolErrorFormatter` | — | `ToolOutput.content` 与 `data`、`ui` 分开（已对齐） |

**启发：**
- 增加 `Tool.executionMode`（默认 parallel）和 `maxParallelToolCalls`。写文件、执行 bash 这类工具必须串行。
- 增加 `ctx.update(progress)` 和 `tool_progress` 事件。长时间运行的工具（OCR、harness 里的 bash）需要报告进度。

### 2.4 审批、中断和恢复（**最重要的修正在这里**）

| | Vercel | OpenAI Agents | 我们 |
|---|---|---|---|
| 暂停方式 | 循环停下，结果里带 `tool-approval-request`（`approvalId`、`isAutomatic`） | 结果里带 `interruptions`，状态是 `RunState` | `deferred`，返回 `pending` |
| 恢复方式 | 把 `tool-approval-response` 追加成一条 tool 消息，再调一次 | 调用 `state.approve()` 或 `reject()` 后执行 `run(agent, state)` | 带上 `approval.decisions` 再调一次 `run()` |
| 记住决定 | — | `alwaysApprove` / `alwaysReject`：这次运行里对同一个工具一直有效 | 没有 |
| 拒绝时的提示 | `reason` | `reject({ message })`：自定义模型看到的拒绝文字 | 固定措辞 |
| **防伪造** | **`experimental_toolApprovalSecret`：服务端验证这个审批确实是它发出的** | **状态不可信：完整快照放在服务端存储，只给审批人不透明的决定 ID；服务端校验审批人身份、权限，并且原子地消费请求，防止同一快照被恢复两次** | **没有考虑，有漏洞** |

**我们设计里的漏洞：** 暂停式审批假设"`callId` 加上不可篡改的 transcript"就能保证安全。但在 Workers 场景下，transcript 是由**客户端回传**的。客户端可以伪造一个 tool_use，再声称它已经被批准；也可以把同一个批准重复提交。会展 demo 原来的"签名的确认令牌"做法其实是对的，我们的设计反而退步了。

**修正方案：**
- 暂停式审批**必须配合服务端存储**。暂停时，把待审批的调用和 transcript 写进 `SessionStore`，存储后端可以是 KV、D1 或 Durable Object。返回给客户端的只有 `runId` 和不透明的 `approvalId`。
- 恢复改成 `resume({ runId, decisions: { [approvalId]: … } })`，由服务端读取存储。每个 approvalId 只能消费一次，这要求存储支持原子操作。
- 没有配置存储时，不允许使用 `deferAnswerer`，启动时直接报错。
- 普通的多轮对话历史仍然可以由客户端回传（两个验收项目都是这么做的）。但要在文档里说明：客户端回传的历史**不可信**，不能作为任何授权的依据。
- 增加：对同一工具"本次运行内一直允许"的选项，以及拒绝时可以自定义模型看到的文字。

### 2.5 插话和后续消息

| | Vercel（实验性） | pi-agent-core | dsh | 我们 |
|---|---|---|---|---|
| 插话 | `steering.steer(text)`，在下一个 step 边界插入，返回 outcome：`delivered` 或 `finished`、`stop-condition`、`error` | `agent.steer()`：当前工具执行完、下一次请求之前插入；可以一次插一条，也可以一次插全部 | 由 Host 的 inbox 投递 | `steer()` 返回 `accepted` 或 `missed` |
| 后续消息（排队） | `steering.queue(text)`：当前任务结束后再执行 | `agent.followUp()`：没有工具调用、也没有插话时，再跑一轮 | 由 Host 的 inbox 投递 | 交给应用层 |

**启发：** 我们的 `steer()` 方向是对的。可以参考 pi 把后续消息也放进 core（`followUp()`）：run 不结束，而是接着处理排队的消息，这样 harness 和 GUI 都不用自己写这段逻辑。返回值参考 Vercel，从 `missed` 细化为具体原因。

### 2.6 自定义消息类型

pi-agent-core 允许应用通过声明合并扩展 `AgentMessage`，在发给 LLM 之前由 `convertToLlm` 映射或过滤。dsh 的消息带 `source` 字段，标明这条消息是谁产生的。

**启发：** 我们也会遇到不该原样发给模型的消息，比如 UI 提示、压缩产生的摘要、审批策略变化的通知。可以在 `prepareStep` 里统一处理（把 messages 转成发给模型的样子）。第一期提供这个钩子即可，不需要单独的消息类型系统。

### 2.7 Provider 层

- pi-ai 支持很多线上协议：`anthropic-messages`、`openai-completions`、`openai-responses`、`google-generative-ai`、`bedrock-converse-stream`……它提供模型目录、能力字段、`thinkingLevelMap`、费用计算（区分 provider 报告的费用和按目录价格估算的费用），也能在浏览器里运行。
- dsh 的做法是：**DeepSeek 用自己写的原生适配器，其他 provider 一律交给 pi-ai。**
- 如果我们照这个做，就不用自己写 OpenAI、Anthropic、Gemini、Kimi 的适配器了。这些正是从 openmcp-client 继承来、最难维护的部分。

## 3. 对设计文档的修改建议

| # | 修改 | 依据 | 优先级 |
|---|---|---|---|
| C1 | 暂停式审批必须配服务端 `SessionStore`；客户端只拿到不透明的 ID；改为 `resume()` 恢复；每个审批只能消费一次 | OpenAI、Vercel | **必须改** |
| C2 | `ToolUseBlock.arguments: string`（原始 JSON）作为准确值，`input` 为派生字段 | dsh，以及 DeepSeek 前缀缓存 | 必须改 |
| C3 | 增加 `prepareStep` 钩子（第一期）；Compactor 作为它的一个实现 | 四家都有 | 建议 |
| C4 | 用 `stopWhen`（可以组合多个条件）取代单独的 `maxSteps` | Vercel | 建议 |
| C5 | 增加 `Tool.executionMode` 和 `maxParallelToolCalls` | dsh、pi | 建议 |
| C6 | 增加 `ctx.update()` 和 `tool_progress` 事件 | pi | 建议 |
| C7 | 增加 `followUp()` 进 core；`steer()` 的返回值细化为具体原因 | pi、Vercel | 建议 |
| C8 | 审批增加"本次运行内一直允许"和自定义拒绝文字 | OpenAI | 建议 |
| C9 | 动态工具用 developer 消息实现，保护前缀缓存 | dsh | 记下，以后做 |
| C10 | 非 DeepSeek 的 provider 交给 pi-ai，DeepSeek 用自己的原生适配器 | dsh 的做法；已实测能在 workerd 里运行（设计文档 §13 Spike 4） | **需要你决定** |

> 状态（2026-11-14）：C1–C8 已合入设计文档（D14），C9 记在待定问题里，C10 等用户决定。

## 来源

- dsh：本地 `C:\code\deepseek-harness\packages\llm\llm`、`packages\core\agent-loop`、`packages\interaction\user-approval`
- https://ai-sdk.dev/docs/agents/loop-control
- https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling
- https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-tool-usage
- https://openai.github.io/openai-agents-js/guides/human-in-the-loop/
- https://openai.github.io/openai-agents-js/guides/running-agents/
- https://github.com/badlogic/pi-mono/tree/main/packages/agent
- https://github.com/badlogic/pi-mono/tree/main/packages/ai
