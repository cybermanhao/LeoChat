# LeoChat 特色特性盘点：对照 dsh 之后还要不要

> 2026-11-16 整理。对象是 LeoChat 现有的功能（来自代码和项目记忆），对照 deepseek-harness（dsh，本地 `C:\code\deepseek-harness`）的做法和新的 `@leochat/core`，逐项给出"取代 / 保留但改 / 保留 / 去掉"的建议。
> 需要你拍板的点集中在文末。

## 一、已被新 core 取代（GUI 迁移完成后删除）

这些是 TaskLoop 时代的"特色"，本质上是在补一个不完整的循环。新 core 把它们变成了循环本身的规则，dsh 的做法也是一样的。

| 现有特性 | 位置 | 新 core 里的对应 | dsh 的做法 |
|---|---|---|---|
| 工具调用计时（`duration`） | TaskLoop | `tool_end.ms`；trace 里的 tool span | 会话日志里的事件时间 |
| 按消息条数截断上下文、溢出时减半重试 | TaskLoop `contextLength` | `prepareStep` + Compactor；`context_overflow` 时强制压缩一次 | `packages/compaction`（修剪工具结果 → 摘要，命中前缀缓存） |
| token 统计 | TaskLoop | `step_end.usage` / `run_end.usage`，含缓存命中 | `token-meter` |
| JSON 参数错误时让模型重写（最多 N 次） | TaskLoop `maxJsonParseRetry` | 不变量 4：返回错误结果，让模型在下一步修正 | 同样是返回错误结果 |
| 工具调用前后钩子 | TaskLoop `registerOnToolCall` | `hooks.beforeToolCall` / `afterToolCall` | tools 执行流水线 |
| 中断后修补半截工具调用 | `apps/web/src/stores/context-repair.ts` | 不变量 1：每个 tool_use 都有结果；`unansweredToolUses()` | 会话日志保证配对 |
| LLM 请求的指数退避 + 熔断器 | `packages/mcp-core/src/retry.ts`（370 行） | `retry` 配置；只在还没有输出时重试（可选 `retryAfterPartialOutput`） | `llm-retry`：在持久的 step 边界重试，**没有熔断器** |
| 工具批量调度（`Promise.all`，一个失败全失败） | `dispatcher.ts` | `allSettled` + 执行模式 + 并发上限 | `maxParallelToolCalls`，区分可并行/独占 |
| 两套持久化：浏览器 IndexedDB checkpoint + 服务端 TaskStore（JSON 文件） | `checkpoint-storage.ts`、`server/src/task-store.ts` | 一个 `SessionStore` 接口（内存、D1；JSONL 放到 `@leochat/node`） | 事件溯源的 JSONL 会话日志 |
| 服务端代理模式里的第二个循环 | `server/src/routes/index.ts` `/chat` | 服务端直接调用 `run()`，事件原样走 SSE | 只有一个 agent loop |
| Bash 审批（`/tools/approve/:id` + 前端横幅） | server + web | 审批应答者链（GUI 用等待式）；界面保留，换掉底层机制 | `user-approval` + 沙箱升权 |

**熔断器的结论：去掉。** dsh 也没有给 LLM 请求加熔断器。熔断器适合"很多请求打同一个下游"的服务端，对单用户的桌面应用来说，失败了直接告诉用户比自动熔断更好理解。MCP 连接的熔断见下一节。

## 二、保留，但改成 dsh 的做法

| 现有特性 | 建议 | 理由 |
|---|---|---|
| **MCP 客户端的熔断 + 退避重连 + 渐进式自动连接** | 保留功能，重写连接管理：参考 dsh `mcp-client` 的"连接监督器"——重连 500ms 起翻倍、上限 30s、连续失败 10 次后移除工具；断线期间仍列出工具但调用失败；**初始连接、listChanged 通知、重连全部串行到同一个队列** | 你记忆里的已知问题"listChanged 导致 connect 永久挂住"，根因正是 autoRefresh 和 refreshTools() 并发。dsh 用串行队列从结构上避免了这类竞态。渐进式自动连接（GUI 渲染后逐个连）是 GUI 体验，保留 |
| **工具开关（`disabledToolIds`）** | 保留，实现改为 `prepareStep` 返回 `activeTools` | 注意：会话中途改工具列表会破坏前缀缓存。以后按 dsh 的 developer 消息方案（C9）处理 |
| **系统提示词面板 + 附加 MCP prompt 模板**（`stores/prompt.ts`） | 保留，组装方式参考 dsh `system-prompt`（分段 + 变量） | 同样要注意缓存：会话中途改 system prompt 会让之前的缓存全部失效。dsh 的做法是把变化作为一条消息**追加在历史末尾**，不改写开头 |
| **Skills（SDK 里把 skill 注入 system prompt）** | 改成**按需加载**：模型先看到 skill 目录，需要时调用 `load_skill` 工具读取全文 | dsh 的 `tool-skill` 就是这样。全部注入既占上下文，又让每次增删 skill 都破坏缓存 |
| **leo-card 生成式卡片 + 卡片动作** | 和 core 的声明式卡片（`UiHint` / `CardAction`）合并成一套 | 会展、博客、GUI 现在各有一套卡片格式；统一后 MCP 工具返回的卡片在 GUI 里也能显示 |
| **leochat-mcp 里的"让 agent 操作界面"的工具**（`update_theme`、`show_notification`、`open_panel`、`scroll_to_message`、`set_input`、`resize_window` 等） | **保留**（dsh 没有，这是 LeoChat 独有的），但从独立的 stdio MCP 进程改成 GUI 本地 server 里的进程内工具，通过 `ctx.emit` 发 `custom` 事件给前端 | 现在每次调用都要经过子进程和 IPC 往返；进程内工具更简单、更快。`show_confirm` 与审批功能重叠，可以去掉 |
| **bash 工具** | 保留；harness 阶段再参考 dsh 补沙箱（Windows ACL 受限令牌）、持久 shell、后台任务 | 现在的实现够 GUI 用；无人值守跑任务时必须有沙箱 |
| **MCP 资源 / prompts 浏览界面** | 保留；另外参考 dsh `mcp-resources`，给模型一个读取资源的工具 | 现在只有用户能看资源，模型用不上 |
| **多 provider（OpenRouter、Kimi、Gemini、Anthropic 适配器）** | 短期保留现有实现；长期按 C10 换成"DeepSeek 原生 + pi-ai 桥接" | 你已决定 Kimi / pi-ai 暂缓 |

## 三、保留，与 dsh 无关的产品功能

主题系统（6 套）、i18n、引导向导、QuickAccess、网络代理设置、带 SSRF 防护的图片代理、MCP 统计面板、Electron 窗口管理。这些是 GUI 产品本身的功能，dsh 有类似的（`ui-theme`、`locale`），但没有需要借鉴的差异。

## 四、建议去掉或收起

| 现有 | 建议 | 理由 |
|---|---|---|
| `@leochat/sdk` | 标记废弃，由 `@leochat/core` 取代 | 第一期的目标就是取代它 |
| `@leochat/cli` | 暂时保留；harness 阶段在 core 上重写 | harness 计划放在 CLI 里跑 |
| KnowledgeBase 页面（52 行占位） | 先从导航里隐藏 | mem0 方向还没立项，空页面会让人困惑 |
| `generate_waifu` 工具 | 移出 leochat-mcp，放到独立的 MCP 或 skill | 和核心功能无关 |
| OCR 实验分支（PaddleOCR，独立发布线） | **需要你决定**：是否停止这条发布线 | DeepSeek 的 OCR API 和 Files API（文档上传时直接解析，已实测）基本覆盖了它，而且不需要本地安装。代价是要联网、文件要上传到 DeepSeek |

## 五、值得从 dsh 补进来、LeoChat 还没有的

| dsh 的功能 | 价值 | 建议时机 |
|---|---|---|
| `compaction`（修剪 → 摘要，命中缓存） | 长对话的成本和质量 | 下一步（core 的 Compactor 接口已留好） |
| `spill`：超大工具输出存成文件，只给模型预览和取回方式 | core 现在只是截断；GUI 和 harness 都需要能取回完整内容 | 和 compaction 一起 |
| `repeat-tool-reminder`：同一工具同参数重复调用 3/5/8 次时提醒模型 | 防止 agent 卡在循环里；实现很便宜（一个 `afterToolCall` 钩子） | 现在就可以加，harness 尤其需要 |
| `timeout-policy`：每个工具的超时上限 | 慢工具不会拖住整个运行 | 和 harness 一起 |
| 会话标题自动生成（用首条消息让模型起标题） | GUI 历史列表体验 | GUI 迁移时 |
| `goal` / `schedule` / `jobs` / `todo` | 长任务、定时、后台任务 | harness 阶段 |

## 决定与执行（2026-11-16，用户全部同意）

| # | 决定 | 状态 |
|---|---|---|
| 1 | 去掉 LLM 熔断器；MCP 连接改成 dsh 式监督器 | ✅ 提交 `8374092`：同步串行（结构上消除 listChanged 卡死）、开始处理 `tools/list_changed`、500ms→30s 退避、单次断线最多 10 次失败、稳定 30s 后重置计数、断线期间保留工具；熔断器从 MCPClient、TaskLoop、shared 类型里全部删除。已用真实的 leochat-mcp 验证 |
| 2 | 界面操作工具改成本地 server 里的进程内工具 | ⏸ 放到 GUI 迁移时做：现在 GUI 还跑在旧 TaskLoop 上，现在挪等于做两遍 |
| 3 | Skills 按需加载 | ✅ 提交 `456162a`：core 提供 `skillCatalog()` + `loadSkillTool()` + `staticSkills()`；磁盘来源以后放进 `@leochat/node` |
| 4 | 停止 OCR 实验发布线 | ✅ 记录决定，分支和已发布版本保持原样，不再继续发布；需要 OCR 时用 DeepSeek OCR / Files API |
| 5 | 隐藏 KnowledgeBase 占位页 | ✅ 提交 `aa91055`：只去掉导航入口，路由和页面保留 |
| 6 | 重复调用提醒进 core | ✅ 提交 `456162a`：默认开启，阈值 3/5/8，与 dsh 一致 |

## 需要你拍板的（已于 2026-11-16 全部同意，见上表）

1. **熔断器：** LLM 请求的熔断器（`retry.ts`）是否同意去掉？MCP 连接的熔断改成 dsh 式的"退避重连 + 失败次数上限"。
2. **界面操作工具：** 是否把 `update_theme` 等工具从 leochat-mcp 独立进程挪到 GUI 本地 server 里的进程内工具？
3. **Skills：** 是否改成按需加载（`load_skill` 工具）？
4. **OCR 实验发布线：** 是否停止，改用 DeepSeek OCR / Files API？
5. **KnowledgeBase 占位页：** 是否先隐藏？
6. **repeat-tool-reminder：** 是否现在就加进 core（默认开启，阈值 3/5/8，与 dsh 相同）？
