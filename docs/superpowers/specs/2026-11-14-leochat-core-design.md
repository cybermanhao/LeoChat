# @leochat/core 设计文档（第一期）

**日期：** 2026-11-14
**状态：** 草案，类型待评审，尚未实施
**相关：** `docs/research/deepseek-app-api-2026-11.md`

## 背景

LeoChat 重启。旧的 `@leochat/sdk` 没有被用户自己的两个 agent 项目采用：

| 项目 | 位置 | 运行环境 | 实际做法 |
|---|---|---|---|
| 博客 agent | `leo-astro-blog/src/agent/` | Cloudflare Workers | openai SDK，自写循环，带 tracer、计价、缓存命中统计、eval |
| 会展 demo | `expo-mcp-demo/src/` | Cloudflare Workers | 从博客复制了 `streamChat`；工具同时暴露成 MCP server，自己的 agent 也通过 fetch 垫片走 MCP |

旧 SDK 没被采用的原因：
- 依赖 `workspace:*`，在 monorepo 外装不上
- 用到 `fs` 和 `path`，Workers 里跑不了
- 工具只能来自 MCP server，而且无法注入 fetch 和 headers
- `ainvoke` 只返回最终结果，没有流式
- 没有可观测性
- 构建器式的 agent 实例不适合按请求切换身份和租户

另外，LeoChat 内部本身就有两个引擎：前端的 TaskLoop，以及 `server/src/routes/index.ts:194` 里的代理循环。TaskLoop 还把视图模型（`uiMessageId`、`contentItems`、`cardStatus`）耦合在流式解析里面。

## 已定决策

| # | 决策 |
|---|---|
| D1 | 自己写核心，不基于 Vercel AI SDK，但借鉴它的形状（tool part 状态机） |
| D2 | GUI 迁移到新核心，分三步走；新核心是唯一引擎 |
| D3 | 内部消息模型改成 content-block；provider 层重写 |
| D4 | 去掉浏览器直连 LLM。统一在服务端运行（electron 里是本地 server），前端只 reduce 事件 |
| D5 | 暂不发 npm，用私有 git 依赖 |
| D6 | 暂不做跨语言 server 模式 |
| D7 | 博客 agent 和会展 demo 两个项目都作为验收对象 |
| D8 | 第一期包括 core、DeepSeek provider、view reducer、声明式卡片 schema。MCP Apps 宿主放到 GUI 迁移之后 |
| D9 | 审批参考 dsh 的 `dsh-user-approval`：结果是封闭的几种取值，没拿到明确许可就拒绝；应答者组成一条链；会话级的策略。在此之上增加暂停式（serverless 需要），见 §4.1 |
| D10 | 卡片统一放在 `_meta["leochat/ui"]`，避开 MCP Apps 占用的 `_meta.ui`。会展 demo 同步修改 |
| D11 | 工具参数统一用 zod v4 定义（core 把 zod 列为 peer 依赖），不再另外维护一套 JSON Schema 写法 |
| D12 | 并行工具改用 `allSettled`；provider 兜底第一期交给应用层 |

## 范围

**In（第一期）**
- `@leochat/core`：消息模型、Provider 接口、Tool 接口、`run()` 循环、事件、可重放对话记录、Compactor 和 SessionStore 接口（只定义接口）
- `@leochat/core/view`：`reduce()` 和 `RunViewState`
- `@leochat/core/ui`：声明式卡片 schema
- `@leochat/mcp-kit`：把工具暴露成 MCP server，以及把 MCP server 当作工具来源
- `@leochat/deepseek`：DeepSeek provider，加上 Search、Fetch、OCR 三个工具
- 用新核心重写两个验收项目

**Out（之后再做）**
- Compactor 的具体实现（下一期，见 §8）
- `@leochat/node`（stdio MCP、配置文件、skills、JSONL SessionStore）
- 其他 provider：OpenAI、Anthropic、Gemini、Kimi。接口要留好，但第一期只实现 DeepSeek，外加一个通用的 OpenAI 兼容 adapter 作为对照
- MCP Apps 宿主、harness、GUI 迁移的第二步和第三步

## 包结构

```
packages/
  core/        @leochat/core        零运行时依赖，只用 Web 标准 API（fetch、ReadableStream、AbortSignal、crypto.randomUUID）
    src/index.ts      → run、类型
    src/view/         → @leochat/core/view
    src/ui/           → @leochat/core/ui
  mcp-kit/     @leochat/mcp-kit     peer: @leochat/core、@modelcontextprotocol/sdk
  deepseek/    @leochat/deepseek    peer: @leochat/core
```

- **不和现有包混在一起。** `mcp-core`、`leochat-sdk` 维持现状，等迁移完成后再废弃。
- **git 依赖（已验证，见 §13 Spike 1）。** 旧 SDK 就是因为 `dependencies` 里写了 `workspace:*` 才装不上。规则是：core 没有任何内部依赖；其他包对 core 一律用 `peerDependencies`；dist 只放在发布 tag `sdk-vX.Y.Z` 上；使用方写 `github:cybermanhao/LeoChat#sdk-vX.Y.Z&path:packages/<name>`。
- **校验库（D11）。** 工具参数统一用 zod v4 定义。zod 是纯 JS 库，可以在 Workers 和浏览器里运行，不违反"零 Node 依赖"。core 把它列为 `peerDependencies`，发给模型的 JSON Schema 由 `z.toJSONSchema()` 生成。来自 MCP server 的远程工具只有 JSON Schema，由 mcp-kit 包装成 `z.unknown()` 校验加上原始 JSON Schema 覆盖，参数校验交给远端 server 去做。

---

## 1. 消息模型（content-block）

```ts
type Role = 'system' | 'user' | 'assistant' | 'tool';

interface Message {
  role: Role;
  content: Block[];
  /** 引擎生成的稳定 ID，用于视图、重放和压缩时定位 */
  id: string;
}

type Block =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ServerToolUseBlock
  | ServerToolResultBlock
  | ImageBlock
  | FileBlock;

interface BlockBase {
  /** provider 私有的往返数据，比如 thinking 的 signature、encrypted_content。
   *  core 不解释它的内容，只保证原样回传给同一个 provider */
  providerData?: Record<string, unknown>;
}

interface TextBlock extends BlockBase { type: 'text'; text: string; citations?: Citation[] }
interface ThinkingBlock extends BlockBase { type: 'thinking'; text: string }          // DeepSeek reasoning_content 也映射到这里
interface ToolUseBlock extends BlockBase { type: 'tool_use'; id: string; name: string; input: unknown }
interface ToolResultBlock extends BlockBase {
  type: 'tool_result';
  toolUseId: string;
  content: Array<TextBlock | ImageBlock>;   // 给模型看的部分
  isError?: boolean;
  /** 不发给模型：结构化数据和 UI 提示（见 §9）。provider adapter 必须把它去掉 */
  data?: unknown;
  ui?: UiHint;
}
interface ServerToolUseBlock extends BlockBase { type: 'server_tool_use'; id: string; name: string; input: unknown }
interface ServerToolResultBlock extends BlockBase { type: 'server_tool_result'; toolUseId: string; name: string; results: SearchResult[] }
interface ImageBlock extends BlockBase { type: 'image'; source: { kind: 'url' | 'base64' | 'file_id'; value: string; mediaType?: string } }
interface FileBlock extends BlockBase { type: 'file'; fileId: string; filename?: string }

interface Citation { url: string; title?: string; citedText?: string; providerData?: Record<string, unknown> }
interface SearchResult { url: string; title: string; snippet?: string; siteName?: string; date?: string; providerData?: Record<string, unknown> }
```

约定：
- `tool` 角色的消息只能包含 `tool_result` 块。adapter 负责翻译成各家的格式：OpenAI 是每个结果一条 `role:'tool'` 消息；Anthropic 是合并进一条 `user` 消息。
- 一条 assistant 消息里的块是**有序的**，"文字 → 工具 → 文字"这种顺序会被保留下来。
- 现有代码的 `ChatMessage` 加 `contentItems` 是两套模型，迁移后合并成这一套（见 §11）。

## 2. Provider 接口

```ts
interface Provider {
  readonly id: string;                                  // 'deepseek'
  capabilities(model: string): Capabilities;
  stream(req: ModelRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent>;
  /** 可选：按 usage 计算费用。DeepSeek 要区分忙时和闲时 */
  price?(model: string, usage: Usage, at: Date): number | undefined;
}

interface Capabilities {
  contextWindow: number;
  maxOutput: number;
  tools: boolean;
  parallelToolCalls: boolean;
  thinking: boolean;
  vision: boolean;
  files: boolean;
  serverTools: ServerToolKind[];     // DeepSeek: ['web_search', 'read_url']
  cacheStats: boolean;               // 是否返回缓存命中和未命中的 token 数
  /** 开启服务端工具后会被忽略的参数，供上层提示用 */
  ignoredWhenServerTools?: string[];
}
type ServerToolKind = 'web_search' | 'read_url';

interface ModelRequest {
  model: string;
  system?: string;
  messages: Message[];
  tools?: ToolDef[];                       // 只包含模型可见的工具
  serverTools?: ServerToolKind[];
  thinking?: boolean | { effort: 'low' | 'medium' | 'high' };
  maxOutputTokens?: number;
  temperature?: number;
  safetyCheck?: 'high';                    // DeepSeek safety_check
  providerOptions?: Record<string, unknown>;   // 逃生口
}
interface ToolDef { name: string; description: string; inputSchema: JsonSchema }

/** 归一化后的流事件。每个 provider adapter 都输出同一套事件 */
type ProviderEvent =
  | { type: 'block_start'; index: number; block: Partial<Block> & { type: Block['type'] } }
  | { type: 'block_delta'; index: number; delta: BlockDelta }
  | { type: 'block_end'; index: number; block: Block }        // 完整的块，tool_use 的 input 已经解析好
  | { type: 'usage'; usage: Usage }
  | { type: 'finish'; reason: FinishReason };

type BlockDelta =
  | { kind: 'text'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'input_json'; partial: string }
  | { kind: 'citation'; citation: Citation };

type FinishReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'refusal' | 'stop_sequence' | 'other';

interface Usage {
  inputTokens: number;
  outputTokens: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  reasoningTokens?: number;
  serverToolCalls?: Partial<Record<ServerToolKind | 'image_search', number>>;
}

class ProviderError extends Error {
  kind: 'rate_limit' | 'overloaded' | 'context_overflow' | 'auth' | 'insufficient_balance'
      | 'invalid_request' | 'refusal' | 'network' | 'unknown';
  retryable: boolean;
  status?: number;
  retryAfterMs?: number;
}
```

- **tool_calls 增量拼接**（按 index 累积）、**JSON 解析**、**错误分类**，都在 adapter 里一次性做完。两个验收项目各自写过一遍的 `streamChat`，会被这一层取代。
- tool_use 的参数 JSON 解析失败时：`block_end` 里 `input` 为 `{}`，并在 `providerData.rawInput` 里保留原始字符串。是否需要让模型修正，由 run 循环决定（见 §5）。

## 3. 工具

```ts
import type { z } from 'zod';

interface Tool<S extends z.ZodType = z.ZodType, Ctx = unknown> {
  name: string;
  description: string;
  input: S;                               // 校验和类型推导都以它为准
  /** 只给远程工具用（mcp-kit）：直接发给模型的原始 JSON Schema，此时 input 为 z.unknown() */
  jsonSchemaOverride?: JsonSchema;
  /** 与 MCP Apps 对齐。'app' 表示只有界面能调用，不会发给模型。默认 ['model'] */
  visibility?: Array<'model' | 'app'>;
  /** 由工具自己决定这次调用要不要审批（dsh 的原则：由使用方判断，审批服务只负责回答）。
   *  返回字符串时，这个字符串就是审批理由 */
  needsApproval?: boolean | ((input: z.infer<S>, ctx: ToolContext<Ctx>) => boolean | string | Promise<boolean | string>);
  execute(input: z.infer<S>, ctx: ToolContext<Ctx>): ToolOutput | Promise<ToolOutput>;
}

/** 写工具的辅助函数，负责类型推导 */
function defineTool<S extends z.ZodType, Ctx = unknown>(t: Tool<S, Ctx>): Tool<S, Ctx>;

interface ToolOutput {
  /** 给模型看的内容。省略时由 data 做 JSON.stringify 得到 */
  content?: Array<TextBlock | ImageBlock> | string;
  data?: unknown;
  ui?: UiHint;
  isError?: boolean;
}

interface ToolContext<Ctx> {
  runId: string;
  callId: string;
  signal: AbortSignal;
  /** 应用传进来的按请求上下文：身份、租户、Workers bindings（ai、kv、env）等 */
  app: Ctx;
  /** 发出应用自定义事件，例如博客的 command */
  emit(name: string, data: unknown): void;
}

/** 工具来源：静态数组、MCP server，以后还可以是 skills 等 */
interface ToolSource<Ctx = unknown> {
  list(ctx: { app: Ctx; signal: AbortSignal }): Promise<Tool<unknown, Ctx>[]>;
}

/** 抛出这个错误表示业务错误：消息会给模型看，isError 为 true，不算系统故障 */
class ToolError extends Error {}
```

- 会展的 `ToolSpec`（纯函数加上副作用登记）和博客的 `dispatchTool(name, args, ai, kv)` 都能直接套进来。按角色过滤工具，就是在 `ToolSource.list` 里读 `ctx.app.identity` 来决定返回哪些。
- 其他异常一律转成 `isError` 结果，给模型看的文本是泛化的 `"Tool execution failed"`（遵守 CLAUDE.md 的后端安全规范），完整错误写进 `tool_end` 事件，事件里带 `internal: true` 标记。

## 4. run()

```ts
function run<Ctx = unknown>(opts: RunOptions<Ctx>): RunHandle;

interface RunOptions<Ctx> {
  provider: Provider;
  model: string;
  system?: string;
  messages: Message[];               // 可以是上次 run_end 返回的 transcript，加上新的 user 消息
  tools?: Array<Tool<any, Ctx> | ToolSource<Ctx>>;
  app?: Ctx;
  serverTools?: ServerToolKind[];
  thinking?: ModelRequest['thinking'];
  safetyCheck?: 'high';
  maxSteps?: number;                 // 默认 10
  maxToolResultChars?: number;       // 第一期先做"超长截断"，完整的修剪放到 Compactor
  retry?: { maxAttempts: number; baseDelayMs: number; maxDelayMs: number };
  approval?: ApprovalConfig<Ctx>;    // 见 §4.1
  hooks?: {
    /** 程序化的策略钩子（不是人工审批）：可以改写参数，或按规则拒绝 */
    beforeToolCall?(call: ToolUseBlock, ctx: ToolContext<Ctx>):
      | void | { deny: string } | { input: unknown }
      | Promise<void | { deny: string } | { input: unknown }>;
    afterToolCall?(call: ToolUseBlock, out: ToolOutput, ctx: ToolContext<Ctx>): ToolOutput | void | Promise<ToolOutput | void>;
  };
  compactor?: Compactor;             // 第一期只定义接口
  signal?: AbortSignal;
  providerOptions?: Record<string, unknown>;
}

interface RunHandle extends AsyncIterable<AgentEvent> {
  result: Promise<RunResult>;
  abort(reason?: string): void;
  /** 插话（steer）：运行中途追加一条用户消息。不打断正在进行的模型请求或工具，
   *  而是在下一个 step 开始前插入 transcript（插在本轮所有 tool_result 之后，保证不变量 1）。
   *  如果 run 在下一个 step 之前就结束了，返回 'missed'，由调用方转成排队消息 */
  steer(message: Message): 'accepted' | 'missed';
}
// 排队（queue）不需要 core 支持：由应用在 run_end 之后，用 transcript 加上排队的消息发起下一次 run()。
// 插话和排队的区分参考 Codex（运行中 Enter 插话，Tab 排队）和 dsh（可以配置，Ctrl/Cmd+Enter 走另一种）。

interface RunResult {
  reason: 'completed' | 'max_steps' | 'aborted' | 'error' | 'awaiting_approval' | 'refusal';
  transcript: Message[];             // 完整、可以重放，包含工具调用和结果
  usage: Usage;
  costUsd?: number;
  pending?: Array<{ callId: string; name: string; input: unknown; reason?: string }>;
}
```

### 4.1 审批（D9，参考 dsh `packages/interaction/user-approval`）

**从 dsh 借鉴的原则：**

| dsh 的做法 | 我们的对应 |
|---|---|
| 结果是封闭的几种取值：`allowed-once / rejected / cancelled / unavailable`；只有 `allowed-once` 才放行，其他一律拒绝 | 照搬，并增加 `deferred`（见下） |
| 没有应答者、应答者抛异常、或返回不合规的值，都按 `unavailable` 处理，然后拒绝 | 照搬 |
| 由工具或沙箱判断要不要审批；审批服务只负责回答 | 由 `Tool.needsApproval` 判断 |
| 应答者组成一条链：负责的就回答，不负责的就调用 `next()` 交给下一个；人工 UI、机器自动化、LLM 自动审查都是应答者 | 照搬，`answerers` 是一个数组 |
| 会话级策略 `ask / never`。`never` 在调用应答者之前就确定性地拒绝，用于 CI 和无人值守运行 | 照搬，harness 默认用 `never` |
| 审批请求只带 `callId`，不复制参数；UI 把审批附在已经显示出来的那个工具调用上 | 照搬 |
| abort 会撤回请求，结果为 `cancelled`，之后到达的回答直接丢弃 | 照搬 |
| 审计事件只写日志，模型只看到最终的工具结果 | 照搬：`approval_*` 事件不进 transcript |
| 策略变化时，在历史末尾追加一条上下文快照告诉模型，不改写 system，所以不破坏前缀缓存 | 第一期不做，harness 阶段再加 |
| 审批必须发生在一个进行中的轮次里，由长期运行的宿主一直等着 | **这一点不同。** dsh 不需要跑在 serverless 上，我们需要，所以增加暂停式 |

```ts
type ApprovalOutcome = 'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'
                     | 'deferred';   // 我们新增的：这次 run 先结束，等以后恢复

interface ApprovalRequest {
  callId: string;
  toolName: string;
  reason?: string;          // 写进审计的文字
  displayReason?: string;   // 给 UI 看的本地化文案
  signal: AbortSignal;
}

type Answerer<Ctx> = (
  req: ApprovalRequest,
  ctx: ToolContext<Ctx>,
  next: () => Promise<ApprovalOutcome>,
) => ApprovalOutcome | Promise<ApprovalOutcome>;

interface ApprovalConfig<Ctx> {
  policy?: 'ask' | 'never';                 // 默认 ask
  answerers?: Answerer<Ctx>[];              // 链走到头还没人回答 → unavailable → 拒绝
  /** 从暂停状态恢复时传入：对指定的调用给出一次性决定，优先于应答者链 */
  decisions?: Record<string, 'allowed-once' | 'rejected'>;
}

/** 内置应答者 */
const deferAnswerer: Answerer<unknown>;     // 直接返回 deferred，用于 serverless
```

**三种用法：**
- **GUI（等待式）：** 应答者返回一个 Promise，用户在 UI 上点"允许"或"拒绝"时 resolve。
- **Workers（暂停式）：** `answerers: [deferAnswerer]`。run 以 `reason:'awaiting_approval'` 结束，`pending` 列出待审批的调用。用户确认后，传入同一份 transcript 和 `approval.decisions: { [callId]: 'allowed-once' }` 再跑一次。core 发现最后一条 assistant 消息里还有没出结果的 tool_use，就先处理这些调用，再继续。
- **harness（无人值守）：** `policy: 'never'`，或者在链上挂一个 LLM 自动审查的应答者，对应 dsh 的 Auto review。

**模型看到什么：** 被拒绝的调用会得到一条错误工具结果，例如 `"Tool call was not approved by the user"`。`unavailable` 和 `cancelled` 各有对应的措辞。模型看不到审批 UI，也看不到审计事件。

**会展 demo：** 现在的"draft_inquiry 签发确认令牌 → send_inquiry"可以改成：`send_inquiry` 设置 `needsApproval: true`，用暂停式审批；确认卡片上的按钮对应 `CardAction` 的 `kind:'approve'`（见 §9）。确认令牌原本的作用（把确认绑定到具体的展商和正文），由 `callId` 加上不可篡改的 transcript 来保证。是否迁移，等验收时再决定。

## 5. 由 core 负责的不变量

两个验收项目各自踩过、各自修过的问题，全部收进 core，并且每一条都要有测试：

1. 每个 `tool_use` 在下一次请求之前，都必须有对应的 `tool_result`。工具被拒绝、中途中止、执行出错，都要补一条错误结果。
2. 本轮已经流式输出的文字，要保留在 assistant 消息里，否则模型下一轮会把答案重说一遍。
3. thinking 和 reasoning_content 按 provider 的要求回传。是否回传由 adapter 决定，core 只负责保留。
4. 工具参数 JSON 不合法时，返回一个错误结果，提示模型修正，而不是直接崩溃。重试次数计入 `maxSteps`。
5. 达到 `maxSteps` 时，以 `reason:'max_steps'` 正常结束，不抛异常。
6. 中止时，进行中的模型请求和工具都会收到 signal；transcript 保持合法（满足第 1 条）。
7. 可重试的 ProviderError 按 `retry` 配置做指数退避，并发出 `retry` 事件。遇到 `context_overflow` 时，如果配置了 compactor，就强制压缩一次再重试；没有配置就直接报错。
8. 发给 provider 之前，去掉 `tool_result` 里的 `data` 和 `ui`。
9. 工具调用并行执行（`Promise.allSettled`），结果按 `tool_use` 原来的顺序写入。单个工具失败不影响其他工具。这一点与现在 `dispatchMany` 用的 `Promise.all` 不同。
10. 审批没拿到明确许可就拒绝：只有 `allowed-once` 才会执行，应答者出现任何异常都按 `unavailable` 处理并拒绝。

## 6. 事件（只发事实）

```ts
type AgentEvent =
  | { type: 'run_start'; runId: string; at: number }
  | { type: 'step_start'; stepId: string; index: number }
  | { type: 'message_start'; stepId: string; messageId: string; role: 'assistant' }
  | { type: 'block_start'; messageId: string; index: number; block: Partial<Block> & { type: Block['type'] } }
  | { type: 'block_delta'; messageId: string; index: number; delta: BlockDelta }
  | { type: 'block_end'; messageId: string; index: number; block: Block }
  | { type: 'step_end'; stepId: string; finish: FinishReason; usage: Usage }
  | { type: 'tool_start'; callId: string; name: string; input: unknown }
  | { type: 'approval_request'; callId: string; toolName: string; reason?: string; displayReason?: string }
  | { type: 'approval_resolved'; callId: string; outcome: ApprovalOutcome }
  | { type: 'tool_end'; callId: string; ok: boolean; output: ToolOutput; ms: number; internal?: { error: string } }
  | { type: 'retry'; attempt: number; delayMs: number; error: { kind: string; message: string } }
  | { type: 'compaction'; info: CompactionInfo }          // 先预留
  | { type: 'custom'; name: string; data: unknown }       // 来自 ctx.emit
  | { type: 'user_message'; message: Message; via: 'steer' }   // 插话的消息进入 transcript 时发出
  | { type: 'error'; error: { kind: string; message: string; retryable: boolean } }
  | { type: 'run_end'; result: RunResult };
```

- 事件可以直接序列化成 JSON，SSE、IPC、JSONL 日志用的是同一份。
- `internal` 字段只在服务端可见。转发给浏览器之前，用 `toPublicEvent(e)` 去掉它，以及其他敏感字段。
- 不再有 `cardStatus`、`uiMessageId` 这类视图概念，它们全部由 §7 的 reducer 推导出来。
- **可观测性：** 第一期提供 `@leochat/core/trace` 里的 `eventsToSpans()`，把事件流转换成 GenAI 规范的 span。博客现在的 `Tracer` 和 `pricing.ts` 迁移过来以后就是这一块。

## 7. View：reducer

```ts
// @leochat/core/view
function initialViewState(transcript?: Message[]): RunViewState;
function reduce(state: RunViewState, event: AgentEvent): RunViewState;   // 纯函数，结构共享

interface RunViewState {
  status: 'idle' | 'connecting' | 'reasoning' | 'generating' | 'tool_running'
        | 'awaiting_approval' | 'done' | 'error' | 'aborted';
  messages: ViewMessage[];
  usage: Usage;
  costUsd?: number;
  error?: { kind: string; message: string };
  retry?: { attempt: number; delayMs: number };
}

interface ViewMessage { id: string; role: Role; parts: ViewPart[] }

type ViewPart =
  | { type: 'text'; text: string; citations?: Citation[]; streaming: boolean }
  | { type: 'reasoning'; text: string; streaming: boolean }
  | { type: 'tool'; callId: string; name: string; state: ToolPartState;
      inputText?: string; input?: unknown; output?: ToolOutput; ui?: UiHint; ms?: number; approvalReason?: string }
  | { type: 'server_tool'; callId: string; name: string; input?: unknown; results?: SearchResult[] }
  | { type: 'image' | 'file'; block: ImageBlock | FileBlock }
  | { type: 'custom'; name: string; data: unknown };

/** 参考 Vercel AI SDK UI 的 tool part 状态，加上审批相关的状态 */
type ToolPartState =
  | 'input-streaming' | 'input-available' | 'awaiting-approval'
  | 'running' | 'output-available' | 'output-error' | 'denied';
```

- `status` 的推导规则：
  - 请求已发出、还没有收到 block → `connecting`
  - 最后收到的是 thinking 增量 → `reasoning`
  - 最后收到的是 text 增量 → `generating`
  - 有工具处于 `running` → `tool_running`
  - 有工具处于 `awaiting-approval` → `awaiting_approval`
- 博客的 `searching` 和 `waiting` 事件不再需要：页面按 `tool` part 的名字和状态来渲染就行。
- GUI 里的 zustand store 只负责 `set(s => reduce(s, e))`。

## 8. Compactor（第一期只定义接口）

```ts
interface Compactor {
  /** 每个 step 开始前调用。返回 null 表示不压缩 */
  maybeCompact(input: {
    messages: Message[];
    lastUsage?: Usage;              // 用上一轮真实的 inputTokens 做测量
    capabilities: Capabilities;
    provider: Provider;
    model: string;
    system?: string;
    tools?: ToolDef[];
    force?: boolean;                // context_overflow 时为 true
    signal: AbortSignal;
  }): Promise<null | { messages: Message[]; info: CompactionInfo }>;
}

interface CompactionInfo {
  kind: 'prune' | 'summary';
  replacedMessageIds: string[];
  estimatedTokensFreed: number;
  summaryMessageId?: string;
}
```

下一期的默认实现参考 dsh 的 `packages/compaction`：
1. 先修剪工具结果：截成"头部 + 已省略标记 + 尾部"，不调用模型
2. 达到上下文窗口 80% 时触发，保留最近 16% 的原文
3. 不拆开 tool_use 和 tool_result 配对；永远保留 system
4. 摘要请求原样重放上一轮请求的前缀，把压缩指令作为最后一条 user 消息追加，以命中 DeepSeek 前缀缓存
5. 摘要用固定的 Markdown 模板，结果包在 `<compacted-summary>` 里
6. 原始消息保留在 transcript 之外的日志中（交给 SessionStore 实现）

## 9. 声明式卡片 schema（`@leochat/core/ui`）

以会展的 `UiHint` 为基础，抽成通用版本：

```ts
type UiHint = CardsHint | CustomHint | McpAppHint;

interface CardsHint { type: 'cards'; label?: string; cards: Card[] }
interface Card {
  id?: string;
  title: string;
  subtitle?: string;
  avatar?: { text: string; hue: number } | { imageUrl: string };
  badges?: Array<{ text: string; tone?: 'success' | 'warning' | 'neutral' }>;  // 用语义色调，由宿主主题映射成具体颜色
  tags?: Array<{ text: string; code?: string }>;
  lines?: string[];
  note?: string;
  href?: string;
  actions?: CardAction[];
}
type CardAction =
  | { kind: 'ask'; label: string; text: string }                          // 把一句话填进对话并发送
  | { kind: 'tool'; label: string; tool: string; input: unknown }        // 直接调用 visibility 包含 'app' 的工具（对应会展的 post）
  | { kind: 'approve'; label: string; callId: string; outcome: 'allowed-once' | 'rejected' }  // 回答一个待审批的调用
  | { kind: 'link'; label: string; url: string };

/** 应用私有的富组件，比如会展的平面图路线。宿主不认识就忽略，显示文字降级 */
interface CustomHint { type: 'custom'; kind: string; data: unknown }   // kind 例：'expo.route_map'

/** 第二期 MCP Apps 宿主再用：指向 ui:// 资源 */
interface McpAppHint { type: 'mcp_app'; resourceUri: string }
```

**放在哪里（D10）：** MCP Apps 规范占用了 `_meta.ui`（写在工具定义上的 `_meta.ui.resourceUri`、`_meta.ui.visibility`）。所以卡片统一放在 MCP 工具**结果**的 `_meta["leochat/ui"]` 里，由 `@leochat/mcp-kit` 统一读写。会展 demo 已同步修改（2026-11-14）。

## 10. 外围包

### @leochat/mcp-kit

```ts
/** 工具定义一次，暴露成 Streamable HTTP MCP server（无状态，用 Web 标准 Request/Response，Workers 可直接用） */
function toMcpHandler<Ctx>(opts: {
  name: string; version: string;
  tools: Tool<any, Ctx>[] | ToolSource<Ctx>;
  resolveApp(req: Request): Promise<Ctx | null>;   // 例如验证 Bearer 令牌、查出身份。返回 null 时响应 401
}): (req: Request) => Promise<Response>;

/** 把 MCP server 当作工具来源 */
function mcpTools<Ctx>(opts: {
  url: string;
  fetch?: typeof fetch;                              // 会展的进程内垫片：fetch: (u, i) => handler(new Request(u, i))
  headers?: (ctx: Ctx) => Record<string, string> | Promise<Record<string, string>>;   // 按请求注入 Bearer
}): ToolSource<Ctx>;
```

- 工具结果里的 `_meta["leochat/ui"]` 会被还原成 `ToolOutput.ui`；`visibility` 与 MCP Apps 的 `_meta.ui.visibility` 互相映射。
- 进程内使用时，可以跳过 MCP 直接把 `tools` 交给 `run()`。会展保留 MCP 垫片这一层，是为了"自己的 agent 和外部宿主走同一个接口"，这是它的演示目的，是否保留由应用决定。

### @leochat/deepseek

```ts
function deepseek(opts: { apiKey: string; baseURL?: string; fetch?: typeof fetch }): Provider;
// 工具（同时可以通过 mcp-kit 暴露成 MCP server）
function deepseekSearch(opts): Tool;   // POST /v1/tools/search，给模型 summary 字段，给 UI snippet 字段
function deepseekFetch(opts): Tool;    // POST /v1/tools/fetch
function deepseekOcr(opts): Tool;      // POST /v1/tools/ocr（multipart）。要检查 200 响应里的 error body
```

- 计价表内置 `deepseek-flash` 和 `deepseek-v4-pro`，区分忙时和闲时（UTC 01–04、06–10，工作日），外加工具调用的费用。
- 用哪个线上端点，待 Spike 2 决定。

---

## 11. GUI 迁移（D2，第一期只做第一步）

1. **第一步（第一期）：** server 改用 `run()`，事件原样走 SSE。前端加一个适配层，把 `AgentEvent` 翻译成旧的 `TaskLoopEvent`，`chat-generation.ts` 不用改。`Message` 和 `contentItems` 保留，通过 transcript 转换得到。
2. **第二步：** `chat-generation.ts:338` 的 switch 换成 `reduce()`，组件直接渲染 `ViewPart`。
3. **第三步：** 删掉 TaskLoop、`server/src/routes/index.ts` 里的循环、`contentItems` 和旧 `ChatMessage`；旧的 checkpoint 改用 SessionStore。

## 12. 验收

### 会展 demo（重写 `src/agent.ts` 和 `src/llm.ts` 的示意）

```ts
import { run } from '@leochat/core';
import { deepseek } from '@leochat/deepseek';
import { mcpTools } from '@leochat/mcp-kit';

export function runAgent({ identity, transcript, userText, env, signal }) {
  return run({
    provider: deepseek({ apiKey: env.DEEPSEEK_API_KEY }),
    model: 'deepseek-flash',
    system: systemPrompt(identity),                      // 原样保留
    messages: [...transcript, userMessage(userText)],    // 不再只保存文字，上一轮的工具结果也在
    tools: [mcpTools({
      url: 'https://internal.invalid/mcp',
      fetch: (u, i) => handleMcp(new Request(u, i), env),
      headers: async () => ({ Authorization: `Bearer ${await mintToken(env, identity)}` }),
    })],
    maxSteps: 6,
    temperature: 0.2,
    safetyCheck: 'high',                                 // 面向公众的应用必须开启
    signal,
  });
}
// worker 里：for await (const e of handle) sse.write(toPublicEvent(e))
// 页面里：state = reduce(state, e)；tool part 的 ui 渲染成卡片或平面图
```

**通过标准：**
- `llm.ts`（87 行）被删掉，`agent.ts` 从 169 行降到 40 行以内
- 现有的 `demo.test.ts` 全部通过
- 跨轮次追问能用上上一轮的工具结果

### 博客 agent（映射表）

| 博客现有 | 新核心中的对应 |
|---|---|
| `LLMService`，Kimi 为主、DeepSeek 兜底 | Provider。兜底由应用层处理：捕获 `ProviderError` 后换一个 provider 再跑一次。第一期 core 不内置兜底 |
| `chunk` / `tool_call` / `tool` 事件 | `block_delta` / `tool_start` / `tool_end` |
| `searching` / `waiting` | 页面按 tool part 的 name 和 state 渲染 |
| `command` | 工具里调用 `ctx.emit('command', …)` 产生 `custom` 事件，或者放进 `ToolOutput.ui` 作为 `custom` hint |
| `citations` | 自己 RAG 的引用改成 `custom`；以后换 DeepSeek 服务端搜索时，直接用 `TextBlock.citations` |
| `usage`（缓存命中率） | `step_end.usage`；命中率在页面里计算 |
| `Tracer` / `pricing.ts` | `eventsToSpans()` / `provider.price()` |
| `dispatchTool(name, args, ai, kv)` | `Tool.execute(input, ctx)`，其中 `ctx.app = { ai, kv }` |
| `detectIdentity` 修补 system prompt | 应用层在调用 `run({ system })` 之前处理 |

**通过标准：**
- 博客现有的 vitest 测试和 `eval:agent` 结果不下降
- `agent.ts` 加 `llm.ts` 的总行数明显减少

## 13. Spike（实施前先验证）

1. **私有 git 依赖：** 在一个空的 Workers 项目里，用 pnpm 安装 monorepo 子路径下的包，验证带 `dist`、peer 依赖都能正常解析。
2. **DeepSeek 线上端点：** 对 `deepseek-flash`，同时开启函数工具、thinking、`deepseek_web_search`，分别打 Chat Completions 和 Messages 端点，对比以下几点：
   - 服务端工具块、引用、reasoning 在两种端点下的格式
   - thinking 模式下是否必须回传 `reasoning_content`
   - 缓存命中字段的名字
   结果决定 adapter 默认走哪个端点。
3. **确认 `deepseek-chat` 现在的状态**（会展 demo 的默认模型）。

### Spike 2、3 实测结果（2026-11-14）

| 项目 | Chat Completions | Messages（`/anthropic/v1/messages`） |
|---|---|---|
| 服务端搜索的过程 | delta 里有 `server_tool_calls`（只有搜索词和 action） | 完整的 `server_tool_use` 块（搜索词、`kind: deep_search`） |
| 搜索结果 | **没有结果列表**，只在文末给出 `annotations: url_citation`（url、title、start/end index） | `web_search_tool_result` 块，每条结果有 title、url、`encrypted_content` |
| 引用 | `url_citation`（字符区间） | `citations_delta`，每条带 `cited_text` 原文片段 |
| thinking | `reasoning_content` 字符串 | `thinking` 块，带 `signature` |
| 函数工具和服务端工具同时使用 | **关闭 thinking 时返回 400**："client tools can only be used together with deepseek_web_search … in thinking mode" | 开启 thinking 时可以（Messages 端点默认就开启 thinking） |
| 回传 thinking / reasoning_content | 不回传也返回 200，没有强制要求 | 去掉 thinking 块也返回 200 |
| usage | `prompt_tokens`（**包含**缓存命中的部分）、`prompt_cache_hit_tokens`、`prompt_cache_miss_tokens`、`completion_tokens_details.reasoning_tokens`、`server_tool_use.{tool_search,tool_fetch,tool_image_search}` | `input_tokens`（**不含**缓存读取，Anthropic 语义）、`cache_read_input_tokens`、`output_tokens_details.thinking_tokens`、`server_tool_use.{web_search_requests,tool_search,…}` |

- `/models` 只列出 `deepseek-flash` 和 `deepseek-v4-pro`。`deepseek-chat` 仍然能调用，但响应里的 `model` 是 `deepseek-flash`，说明已经被路由过去。会展 demo 应该显式改用 `deepseek-flash`。
- **结论：DeepSeek adapter 默认走 Messages 端点。** 它的输出更完整（有搜索结果列表和引用原文），而且和我们的 content-block 模型几乎一一对应。Chat Completions 的翻译逻辑保留，给通用的 OpenAI 兼容 provider（Kimi 等）使用。
- adapter 要把两种 usage 统一成 `Usage`：`inputTokens` 一律表示**全部输入**，Messages 端点要加上 `cache_read_input_tokens`。
- 虽然不回传 thinking 也不报错，core 仍然原样回传（不变量 3），避免影响缓存命中和推理质量。
- 待确认：Messages 端点 usage 里 `web_search_requests`（1 次）和 `tool_search`（2 次）是什么关系、按哪个计费。可以对一下账单。
### Spike 1 实测结果（2026-11-14，pnpm 10.12.4）

LeoChat 仓库是**公开**的，所以这里的"私有 git 依赖"实际含义是"不发 npm，直接从 GitHub 安装"，不涉及认证。测试方式：用本地模拟的 monorepo 测各种情况，再用真实的 GitHub 地址验证写法。

| 情况 | 结果 |
|---|---|
| `github:cybermanhao/LeoChat#master&path:packages/shared`（真实仓库） | ✅ 能解析（约 20 秒，会下载整个仓库的压缩包） |
| core 带构建好的 dist，deepseek 用 peer 依赖 core | ✅ 安装正常；只有一份 core 实例（`instanceof` 成立，模块只加载一次） |
| 用 `wrangler deploy --dry-run` 打包到 Workers | ✅ core 只被打包一次；带上完整 zod 后约 770 KB，gzip 后 120 KB |
| 子路径导出 `@leochat/core/view` | ✅ |
| `devDependencies` 里写 `workspace:*` | ✅ 不受影响（依赖包的 devDependencies 不会被安装） |
| **`dependencies` 里写 `workspace:*`** | ❌ `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`。**这就是旧 `@leochat/sdk` 装不上的原因** |
| `peerDependencies` 里写 `workspace:*` | 能装上，但版本范围没有意义，不要这么写，改成 `*` 或具体范围 |
| 不带 dist，靠 `prepare` 脚本在安装时构建 | ⚠️ pnpm 会在包目录里跑一遍 `npm install` 再构建，能成功但很慢（19 秒），而且每个使用方都要装一遍构建工具 |
| `prepare` 加上 devDependencies 里有 `workspace:*` | ❌ npm 不认识 `workspace:` 协议（`EUNSUPPORTEDPROTOCOL`） |

**结论（细化 D5）：**
1. 包之间只能用 `peerDependencies` 互相引用，`dependencies` 里绝不能出现 `workspace:*`。用 lint 规则检查。
2. **不依赖 `prepare`，dist 只放在发布 tag 上。** 写一个 `scripts/release-sdk.mjs`：构建 core、mcp-kit、deepseek → 在一个专门的发布分支上提交带 dist 的版本 → 打 tag `sdk-vX.Y.Z`。master 上不提交 dist。
3. 使用方锁定到 tag：`"@leochat/core": "github:cybermanhao/LeoChat#sdk-v0.1.0&path:packages/core"`，结果可复现，pnpm 也能缓存。
4. 只在 pnpm 10.12 上测过。LeoChat 自己锁定的是 pnpm 9.15（只用于开发 monorepo，不影响使用方）。如果使用方用 pnpm 9，需要再验证一次 `&path:` 写法。
5. 仓库是公开的，任何人都能这样安装。如果以后要真正私有，需要把仓库改为私有，并在使用方的 CI 里配置 GitHub token。

## 14. 待定问题

- core 的 `run()` 要不要内置多 provider 兜底链？当前倾向不内置，第一期交给应用层。
- `maxToolResultChars` 截断与 Compactor 里的修剪，最终是否合并成一个机制？
- 要不要在 `RunOptions` 里提供 `prepareStep(state) → partial RunOptions`，让应用在每个 step 之前动态调整工具和 system（参考 Vercel 的同名能力）？harness 可能会用到，第一期先不做。
