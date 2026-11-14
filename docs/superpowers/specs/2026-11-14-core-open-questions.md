# @leochat/core 实现中的待确认问题

> 按 /goal 的约定：实现过程中遇到的疑问记录在这里。不影响后续工作的，先按"当前做法"实现；依赖疑问的部分先跳过。最后统一向用户确认。
> 每条都写明：当前做法、备选方案、影响范围。

## 第 2 步：run() 循环

### Q1 插话和后续消息是一次全部投递，还是一次一条？
- **当前做法：** 在 step 边界，把队列里的插话**全部**插入 transcript；自然结束时，把排队的后续消息也全部插入，再跑一轮。
- **备选：** pi-agent-core 默认一次一条（`one-at-a-time`），可配置成 `all`。一次一条的好处是每条消息都能得到单独的回应。
- **影响：** 输入框第 1 期的排队体验。改动很小（加一个 `steeringMode` / `followUpMode` 选项）。

### Q2 已经流式输出了一部分内容后出错，要不要重试？
- **当前做法：** 只在**还没有任何块输出**时重试；一旦输出过内容就直接以 `error` 结束。原因：重试会让 UI 收到重复的增量。
- **备选：** 允许重试，同时发一个 `step_reset` 事件，让 reducer 丢弃这一步已经显示的部分内容（Vercel、dsh 的做法不同，dsh 的重试发生在持久化的 step 边界）。
- **影响：** 长回复中途断网时的体验。需要 reducer 配合（第 4 步）。

### Q3 客户端回传的历史里，末尾有没出结果的 tool_use，怎么处理？
- **当前做法：** **不执行**，只补一条"未完成"的错误结果（C1：客户端历史不可信，执行它等于让客户端伪造工具调用）。只有 `resume()` 会执行待处理的调用，而且状态来自服务端 store。
- **备选：** 无（执行它不安全）。这里只是确认你认可这个行为。
- **影响：** 如果有应用依赖"把半截对话发回来接着执行工具"，需要改用 `resume()`。

### Q4 停止条件在一批工具执行完后触发，transcript 就以工具结果结尾、没有最终回答。要不要补一轮？
- **当前做法：** 直接停止（与 Vercel 一致）。transcript 是合法的，下次发消息时模型会看到这些工具结果。
- **备选：** 触发停止后再跑一个"禁用所有工具"的 step，让模型基于已有结果给出总结（OpenAI Agents 的 `errorHandlers.maxTurns` 可以做类似的事）。
- **影响：** 会展 demo 现在达到 6 轮时直接报错；博客 agent 达到 12 轮时也是直接结束。可以做成选项 `finalStepOnStop: true`。

### Q5 两个 resume() 同时进来（例如用户连点两次"同意"）怎么办？ — 已解决（第 6 步）
- **做法：** `SessionStore.claimPaused(runId, ttl)` 原子地认领暂停的运行，第二个 resume 直接得到 `conflict` 错误，不会再保存过期的状态。认领 5 分钟后过期，防止处理它的进程崩溃后永远锁住；再次暂停时自动解除认领。D1 实现用单条条件 UPDATE 保证原子性，已用真实 SQLite 测过并发场景。
- 不需要你决定，只是告知。

## 第 3 步：DeepSeek adapter

> 2026-11-14 实测：通过构建后的 `@leochat/core` + `@leochat/deepseek` 调用真实 API，四个场景都通过——工具调用往返（带 thinking）、服务端联网搜索（带引用）、搜索之后的下一轮对话（重发服务端块和签名）、把独立的 web_search 当客户端工具用。四次合计花费约 0.002 美元。

### Q6 C2（原始参数逐字节回传）在 Messages 端点上做不到
- **事实：** Anthropic 协议里 `tool_use.input` 是 JSON **对象**，不是字符串。adapter 只能把原始字符串解析后再发出去，序列化由 `JSON.stringify` 决定（键顺序保留，空白会被规范化）。
- **当前做法：** 照此实现。core 里仍然以原始字符串为准；它对走 Chat Completions 的 provider（以后 pi-ai 桥接里的 OpenAI 兼容服务）才真正有意义。
- **影响：** DeepSeek 服务端大概率也会把 input 规范化后再拼进 prompt，所以对缓存的影响应该很小，但没有实测。

### Q7 图片和文件用 file_id 引用的写法没有实测
- **当前做法：** 按 Anthropic Files API 的写法：图片 `{type:'image', source:{type:'file', file_id}}`，文档 `{type:'document', source:{type:'file', file_id}}`。DeepSeek 文档说 Messages 端点引用文件要加 `anthropic-beta: files-api-2025-04-14` 头，目前**没有加**。
- **计划：** 做输入框第 3 期（附件）时再实测并修正。现在没有调用方用到。

### Q8 联网搜索之后的下一轮对话，缓存命中是 0
- **现象：** 第一轮搜索的请求有 1024 个 token 命中缓存；第二轮把第一轮的全部内容（含服务端搜索块、thinking 签名）原样发回，`cacheHitTokens` 却是 0，而且 inputTokens 从 3475 降到 1133，说明服务端对重发的搜索结果做了压缩或重新展开。
- **猜测：** 服务端展开 `encrypted_content` 的方式和第一轮不同，导致前缀不一致。
- **可选的应对：** ①接受（搜索场景的对话通常不长）；②重发时去掉 `server_tool_result` 块，只保留带引用的文字，再测缓存命中；③问 DeepSeek 官方。
- **影响：** 搜索类长对话的成本。不影响功能，先记下，之后再实测方案 ②。

### Q9 OCR 工具的文件从哪里来？
- **当前做法：** 模型只能给出一个"文件引用"字符串，由应用传入的 `resolveFile(ref)` 去取文件内容（R2、上传目录等）。core 和 adapter 不管文件存储。
- **备选：** 让模型直接给 URL，由工具下载后再上传（要做 SSRF 防护，Workers 里尤其麻烦）。
- **影响：** 博客和会展目前都没有 OCR 需求；GUI 接附件时会用到。

### Q10 联网搜索按哪个数字计费？
- **当前做法：** 按 usage 里的 `web_search_requests` 计费，每次 0.00075 美元。
- **待确认：** 同一次搜索里 `tool_search` 是 2、`web_search_requests` 是 1（§13 Spike 2 已记录），需要对一下账单。计价表集中在 `packages/deepseek/src/pricing.ts`，改起来很容易。

## 第 5 步：mcp-kit

### Q11 MCP SDK 用 v2，会展 demo 还在 v1
- **事实：** LeoChat（`@modelcontextprotocol/client` / `server` ^2.0.0）和博客（server 2.3.1）都已经在用 SDK v2；会展 demo 用的是 v1（`@modelcontextprotocol/sdk` 1.32）。mcp-kit 按 v2 实现（2.4.0），用 `createMcpHandler` 做无状态端点、`StreamableHTTPClientTransport` 支持注入 fetch。
- **计划：** 第 7 步验收会展 demo 时，顺便把它升级到 v2。v2 默认按 2026-07-28 协议，也兼容 2025 年的客户端（`legacy: 'stateless'`）。WorkBuddy、千问办公的接入本来就没实测过，升级后需要再测一次。
- **需要你确认：** 可以把会展 demo 升级到 SDK v2 吗？

### Q12 needsApproval 通过 MCP 暴露时无法强制
- **事实：** 工具通过 MCP 交给外部宿主（WorkBuddy 等）时，是否询问用户由宿主决定，服务端拦不住。
- **当前做法：** mcp-kit 照常注册这类工具，并在文档里提醒：需要服务端确认的写操作，继续用会展那种"签名确认令牌"的应用层设计。
- **备选：** 让 `toMcpServer` 默认**不暴露** `needsApproval` 的工具，需要显式 `exposeApprovalTools: true`。更安全，但会展的 `send_inquiry` 本身就靠令牌保护，用不上这个限制。
- **影响：** 以后把带审批的工具开放给外部宿主时的默认安全性。

## 实现中做出的、值得你知道的决定（不需要确认，有异议再说）

- `run()` 返回的 `result` **从不 reject**：所有错误都变成 `reason: 'error'` 的结果，并发出 `error` 事件。
- 模型返回空内容时，不往 transcript 里追加空的 assistant 消息。
- 工具不响应 abort 信号时，core 不会一直等它：中止后立即以"已中止"结束这次调用（工具本身可能还在后台跑完）。
- 审批：只有真正去问应答者时才发 `approval_request`；`policy: 'never'`、"本次运行内一直允许/拒绝" 这类自动决定只发 `approval_resolved`（`automatic: true`）。
- `SessionStore` 增加了 `deletePaused()`：恢复成功后删除暂停记录，之后再用同一个 runId 恢复会得到 `not_found`（测试发现不删会导致重放时 transcript 不合法）。
- `ToolSource` 增加了可选的 `release()`：mcp-kit 每次 run 建立一个 MCP 客户端，run 结束时由 core 调用 `release()` 关闭连接。
