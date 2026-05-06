# Blog ↔ SDK Cross-Reference: Optimizations and Capability Alignment

This document records observations from a parallel implementation of a portfolio blog agent
(`leo-astro-blog`, branch `feat/vercel-ssr-leo-agent`) that reimplements parts of the LeoChat
SDK stack independently. The blog's agent is a simpler, single-file version of the TaskLoop
pattern. Reviewing both codebases surfaces:

1. **Patterns the blog got right that should be back-ported to SDK**
2. **SDK capabilities the blog currently reinvents or ignores that it should use**
3. **Bugs found in the SDK during the review**

---

## Part 1 — Blog → SDK: Patterns Worth Back-Porting

### 1.1 Command vs. Data Tool Discrimination at the SSE Layer

**Problem in SDK:**
The SDK's `refactor-directions.md` already identifies that "UI commands" and "structured content"
are mixed. In practice the SDK emits every tool result as a visible `ToolCallBlock` in the UI,
including tools that are pure side-effects with no displayable result.

**How the blog solved it:**
Tool return values are discriminated by a `type` field. Any tool that returns
`{ type: 'command', action: string, params: {} }` is emitted by the server as a separate
`command` SSE event — the client executes the command silently and no block is added to the
message state. All other tools emit a `tool` SSE event that becomes a visible block.

```
SSE event types:
  chunk     → append text to current message
  tool      → add a visible MessageBlock (cards, file, tech stack, etc.)
  command   → execute client-side effect silently (no block added)
  searching → show "searching..." indicator (discarded after next event)
  waiting   → show "正在等待 Xs..." bubble (discarded after next event)
  citations → append citation footer
  done      → close stream
```

**What to add to SDK:**
- A `command` result type in the `TaskLoopEvent` union
- Server-side detection: if a tool's return value has `type === 'command'`, emit a separate
  `command` event rather than `tool_result`
- Client-side `onCommand` handler in TaskLoop that dispatches to a registered command executor
- `registerCommandHandler(action: string, handler: (params) => void)` API on TaskLoop

This aligns with the target shape in `refactor-directions.md` §1 ("ui-command: imperative UI
side effects"), and gives it a concrete implementation path.

---

### 1.2 Wait Tool with Coordinated SSE Feedback

**Problem in SDK:**
`test_tool_call` simulates delays for testing but is not a production sequencing primitive.
There is no way for an agent to pause between commands so that effects play sequentially.

**How the blog solved it:**
A dedicated `wait` tool (server-side `setTimeout`) is paired with a `waiting` SSE event that
the client shows as a transient bubble. The clamp logic is exported as a pure helper so the
SSE-emit side and the execution side always agree on the displayed duration:

```ts
// commands.ts
export function clampWaitMs(ms: number): number {
  return Math.min(Math.max(ms, 200), 8000);
}

export async function runWait(input: { ms: number }) {
  const clamped = clampWaitMs(input.ms);
  await new Promise(r => setTimeout(r, clamped));
  return { type: 'wait_done', ms: clamped };
}

// agent.ts — emits BEFORE executing, so UI shows bubble during sleep
const ms = clampWaitMs(Number(tc.args.ms ?? 1000));
emit({ event: 'waiting', data: { ms } });
await dispatchTool('wait', tc.args);
// wait_done result is deliberately NOT emitted (it's not renderable)
```

**What to add to SDK:**
- A `wait` built-in tool in `@leochat-mcp` (not test-only)
- A `waiting` TaskLoopEvent type emitted before the sleep begins
- Export `clampWaitMs` so host apps can render the accurate duration in UI

---

### 1.3 Silent Tool Result Suppression

**Problem in SDK:**
`executeToolCalls` always emits `toolresult` for every tool. Tools like `wait` (once added),
`update_theme`, or any other pure side-effect tool don't have a displayable result, but
they still appear as collapsible `ToolCallBlock` entries.

**How the blog solved it:**
At the emit site in `agent.ts`, `wait` results are explicitly skipped:

```ts
if (tc.name === 'wait') {
  // handled by 'waiting' event — no tool block needed
} else if (result?.type === 'command') {
  emit({ event: 'command', ... });
} else {
  emit({ event: 'tool', ... });
}
```

**What to add to SDK:**
- A `silent: true` flag on MCP tool definitions (or on the `TaskLoopOptions.onToolCall` return)
- When a tool is marked silent, its result is pushed to `messages` (LLM sees it) but
  no `toolresult` event is emitted (UI doesn't render it)
- Candidate silent tools: `wait`, `update_theme`, `show_notification`, `open_panel`

---

### 1.4 Known-Types Allowlist in SSE Parser

**Problem in SDK (backend proxy mode):**
`processBackendSSEResponse` parses incoming `tool_result` events and calls the result handler
without validating whether the result type is one the renderer knows about. An unknown `type`
field would either reach `LeoCardBlockRenderer`'s `default: return null` (harmless) or
`StreamingContent` (not a block renderer, would just ignore it). Currently safe by accident.

**How the blog solved it:**
An explicit Set is checked before calling `onTool`:

```ts
const KNOWN_BLOCK_TYPES = new Set([
  'text', 'file', 'tech_stack', 'project_list', 'contact', 'citations', 'cards'
]);

else if (currentEvent === 'tool' && KNOWN_BLOCK_TYPES.has(data.result?.type)) {
  onTool(data.result as MessageBlock);
}
```

This prevents unknown result types from polluting message state even before they reach any
renderer.

**What to add to SDK:**
- In `processBackendSSEResponse`, filter `tool_result` events through a `KNOWN_RESULT_TYPES`
  allowlist before pushing to `contentItems`
- Or: expose a `registerBlockType(type, renderer)` registry so the allowlist is auto-derived
  from registered renderers

---

### 1.5 `BlockRenderer` Null Fallthrough

**Status: SDK already correct.**
`LeoCardBlockRenderer` has `default: return null` in its switch — the same fix that was
applied to the blog's `BlockRenderer`. No action needed.

---

## Part 2 — SDK → Blog: Capabilities the Blog Should Use

### 2.1 Replace Custom Agent Loop with TaskLoop

**Current state in blog:**
`src/agent/agent.ts` implements a bespoke loop: `for (let round = 0; round < MAX_ROUNDS; round++)`
with manual tool call collection, manual message history assembly, and manual SSE emit.

**What TaskLoop provides:**
- Configurable `maxEpochs` (default 50, vs blog's 12)
- JSON parse error retry (up to `maxJsonParseRetry`, default 3)
- Parallel or serial tool execution via `parallelToolCalls` option
- Checkpoint and recovery for interrupted sessions
- Abort signal integration
- Pre-call and post-call hook registration
- Token counting

**Migration path:**
The blog's `runAgent()` function can be replaced with a `TaskLoop` instance.
The custom `LLMService` can be replaced with the appropriate TaskLoop model adapter
(`OpenAIAdapter` already supports OpenAI-compatible endpoints, so Kimi/DeepSeek work out of box).
The blog's `emit(SSEEvent)` function maps to TaskLoop's event emission, but the event schemas
need alignment (see Part 3).

---

### 2.2 Use Model Adapters Instead of Hardcoded OpenAI Client

**Current state in blog:**
`src/agent/llm.ts` creates an `OpenAI` client directly, hardcodes the Kimi/DeepSeek base URLs,
and manually parses streaming chunks. The `reasoning_content` extraction is Kimi-specific.

**What the SDK provides:**
- `OpenAIAdapter` — works with any OpenAI-compatible endpoint (Kimi, DeepSeek, OpenRouter)
- `AnthropicAdapter` — native Claude streaming format
- `GeminiAdapter` — Google native format
- All adapters handle `reasoning_content` / thinking tokens in a unified way

**Migration benefit:**
The blog can support Claude and Gemini with zero streaming code changes by swapping adapters.

---

### 2.3 Adopt `StreamingContent` for Richer Markdown Rendering

**Current state in blog:**
`<MarkdownText>` wraps `ReactMarkdown` directly with no special handling for incomplete
markdown during streaming (code fences that haven't closed, tables mid-row, etc.).

**What `StreamingContent` provides:**
- Detects incomplete code blocks during streaming and shows `<CodeBlockSkeleton>`
- Detects incomplete mermaid diagrams and shows `<MermaidSkeleton>`
- Detects `<table>` HTML and shows `<TableSkeleton>` (once XSS is fixed — see Part 3)
- `isComplete` flag prevents partial syntax from being rendered as broken markdown

**Migration:**
Replace `<MarkdownText content={block.content} />` with
`<StreamingContent content={block.content} isStreaming={isStreaming} />`.

---

### 2.4 Adopt `ToolCallBlock` for Visible Tool Results

**Current state in blog:**
Tool results that are rendered (file blocks, tech stack cards, project lists) are displayed
as custom React components without any indication of their origin (which tool call produced
them, how long it took, whether it succeeded).

**What `ToolCallBlock` provides:**
- Status indicator: pending → running → success / error
- Indeterminate progress bar during execution
- Expandable arguments and result panel
- Duration display

**Migration:**
When the blog's `streamChat` receives a `tool` SSE event and the result is a raw data block,
wrap the rendered block in a collapsed `ToolCallBlock` (status = success) so the user can
optionally inspect the source.

---

### 2.5 Adopt `LeoCard` Block Types for Richer Card Content

**Current state in blog:**
`CardsBlock` supports: `title`, `subtitle`, `imageUrl`, `tags`, `link`, `badge`, `badgeColor`.
This is a flat card schema with no sub-structure.

**What `LeoCardBlock` adds:**
- `fields` — key-value grid (good for structured data like contact info, stats)
- `progress` — progress bar with label (good for skills/proficiency display)
- `badge` — inline badge with tone (cyan/green/yellow/destructive/default)
- `divider` — visual separator inside a card
- `images` — multi-image grid within a single card

**Migration:**
The blog's `show_cards` tool and `CardsBlock` type can be superseded by the SDK's
`LeoCard` schema. The agent's `context.ts` card data (education, work experience, hobbies)
can be re-expressed as `LeoCard` objects with `fields` blocks instead of flat tag arrays.

---

### 2.6 Tool Result Truncation

**Current state in blog:**
Tool results are serialized to JSON and pushed directly into `messages` with no size limit.
A large `search_blog` result could bloat the context window significantly.

**What the SDK provides:**
```ts
const MAX_TOOL_RESULT_LENGTH = 3000;
function truncateToolResult(content: string, maxLength = MAX_TOOL_RESULT_LENGTH): string {
  if (content.length <= maxLength) return content;
  return content.substring(0, Math.floor(maxLength * 0.85)) + `\n\n[内容已截断 - 原长度: ${content.length}]`;
}
```

**Migration:**
Apply `truncateToolResult` to all tool results in `runAgent()` before pushing to `messages`.

---

## Part 3 — SDK Bugs Found During Review

These should be fixed in the SDK independently of the blog migration.

### 3.1 XSS in `StreamingContent` Table Rendering (HIGH)

**File:** `packages/ui/src/components/streaming-content.tsx`

```tsx
// Current — vulnerable
<div dangerouslySetInnerHTML={{ __html: block.content }} />
```

LLM-generated `<table>` content may contain `<script>`, `onerror=`, `href=javascript:` etc.
Install `dompurify` and sanitize before injection:

```tsx
import DOMPurify from 'dompurify';
<div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(block.content) }} />
```

---

### 3.2 `test_tool_call` Shipped in Production Package (MEDIUM)

**File:** `mcp-servers/leochat-mcp/src/tools/test-tools.ts` (or equivalent)

`test_tool_call` with `shouldFail` and artificial delay should not be available in production
builds. Guard with:

```ts
if (process.env.NODE_ENV !== 'production') {
  server.registerTool('test_tool_call', testToolCallHandler);
}
```

Or move to a `@leochat-mcp/dev` package that is never listed as a production dependency.

---

### 3.3 No Line Size Guard in Backend SSE Parser (LOW)

**File:** `packages/mcp-core/src/task-loop.ts`, `processBackendSSEResponse`

```ts
buffer += decoder.decode(value, { stream: true });
const lines = buffer.split('\n');
buffer = lines.pop() || '';
```

A malformed stream with no newlines accumulates indefinitely. Add a max buffer size:

```ts
if (buffer.length > 1_000_000) {
  throw new Error('SSE buffer overflow — stream malformed');
}
```

---

### 3.4 No LeoCard Streaming Skeleton (LOW)

`StreamingContent` shows skeletons for incomplete code/mermaid/table blocks during streaming.
`LeoCard` blocks (parsed from tool results mid-stream) have no skeleton. When a card arrives,
the layout jumps from empty to populated. Add a `LeoCardSkeleton` component and show it while
`isStreaming && !isComplete`.

---

## Migration Priority for Blog

Suggested order for migrating `leo-astro-blog` to use SDK capabilities:

| Priority | Change | Effort |
|---|---|---|
| 1 | Apply `truncateToolResult` to all tool results | trivial |
| 2 | Replace `<MarkdownText>` with `<StreamingContent>` | small |
| 3 | Add `ToolCallBlock` wrapper for visible tool results | small |
| 4 | Adopt `LeoCard` schema for `show_cards` tool | medium |
| 5 | Replace custom `LLMService` with SDK model adapters | medium |
| 6 | Replace `runAgent()` loop with `TaskLoop` | large |

Items 1–4 can be done without touching the agent loop.
Items 5–6 require aligning the SSE event schema between blog and SDK (the blog uses
`command`/`waiting`/`searching` events that TaskLoop doesn't emit natively — these would
need to be added to TaskLoop as part of the command pattern work in Part 1).
