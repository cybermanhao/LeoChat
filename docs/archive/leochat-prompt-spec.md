# LeoChat Prompt System Spec

This specification fixes the MCP prompt misuse and defines a layered prompt architecture.

It is intended for implementation by agents and supersedes the ad hoc MCP-prompt-as-system-prompt pattern.

## 1. Scope

This spec covers:

- the three prompt layers and their boundaries
- MCP prompt lifecycle (fetch, display, attach, detach)
- system prompt assembly contract
- UI naming and interaction model
- migration from the current auto-inject behavior

This spec does not cover:

- prompt marketplace or sharing
- prompt versioning or history
- multi-turn prompt workflows with arguments (v2)
- backend-side prompt storage

## 2. The Problem

### Current behavior

1. All no-arg MCP prompts are auto-fetched on server connect (`ChatArea.tsx:166-196`)
2. All cached MCP prompt content is unconditionally concatenated (`ChatArea.tsx:199-215`)
3. The concatenated result is mixed with the active custom prompt
4. The combined string is passed as `systemPrompt` to `sendMessage()` (`ChatArea.tsx:276`)
5. `sendMessage` forwards it directly to TaskLoop (`chat.ts:255`)
6. The UI labels this "系统提示词" and shows MCP prompts as "自动" with no opt-out

### Why this is wrong

This collapses three distinct layers into one:

- **system prompt**: host-owned base instructions and safety rules
- **custom prompt**: user-selected behavioral/task overlay
- **MCP prompt**: server-provided reusable template/snippet

The MCP protocol defines prompts as "reusable prompt templates and workflows", not as a system prompt injection channel. Auto-injecting all MCP prompts into every request:

- pollutes the instruction context with irrelevant material
- gives external MCP servers implicit control over model behavior
- prevents the user from selectively using prompt templates
- makes prompt debugging nearly impossible

## 3. Goals

### Primary goals

- separate system prompt, custom prompt, and MCP prompt into distinct layers
- make MCP prompt attachment explicit and user-controlled
- stop auto-injecting MCP prompt content into every request
- align with MCP protocol intent: prompts are templates, not system instructions

### Non-goals

- do not build a prompt IDE or visual prompt editor
- do not implement prompt argument UI in v1 (keep showing "needs args" badge)
- do not remove MCP prompt fetching entirely (keep fetch for preview/display)
- do not change how `systemPrompt` is consumed by TaskLoop (only change what goes in)

## 4. Target Architecture

### The three layers

```text
Layer 1: System Prompt (host-owned)
  - application-level base instruction
  - safety guardrails
  - always present if configured
  - not editable per-conversation (global setting)

Layer 2: Custom Prompt (user-owned)
  - user-created behavioral/task overlay
  - one active at a time (current behavior, keep)
  - editable, selectable, deletable

Layer 3: MCP Prompt Templates (server-provided)
  - reusable snippets/templates from MCP servers
  - NOT auto-injected
  - must be explicitly attached by user
  - zero, one, or many can be attached per conversation
```

### Assembly order

When building the final prompt for a request:

```text
[system prompt]       -- always first, if present
[attached MCP templates]  -- in attachment order
[active custom prompt]    -- last overlay
```

Each section is separated by `\n\n`.

If no sections have content, no `systemPrompt` is passed.

## 5. Type System Changes

### 5.1 Prompt store updates

Update:

- `apps/web/src/stores/prompt.ts`

#### New state fields

```ts
interface PromptState {
  // --- existing (keep) ---
  customPrompts: CustomPrompt[];
  activePrompt: ActivePrompt;
  mcpPromptCache: Record<string, string>;

  // --- new ---
  /** Explicitly attached MCP prompt keys, ordered. Key format: "${serverId}:${promptName}" */
  attachedMcpPrompts: string[];

  /** Optional host-level system prompt (global, not per-conversation) */
  systemPrompt: string;

  /**
   * Migration version flag.
   * - undefined / 0: pre-migration user (auto-inject era)
   * - 1: migrated to explicit attachment model
   */
  promptVersion: number;

  // --- new actions ---
  attachMcpPrompt: (serverId: string, promptName: string) => void;
  detachMcpPrompt: (serverId: string, promptName: string) => void;
  isAttached: (serverId: string, promptName: string) => boolean;
  setSystemPrompt: (content: string) => void;
}
```

#### Persistence rules

- `attachedMcpPrompts`: persist (user choice survives restart)
- `systemPrompt`: persist (global setting)
- `promptVersion`: persist (migration state)
- `mcpPromptCache`: do NOT persist (session-level, keep current behavior)

### 5.2 ActivePrompt type

Keep current `ActivePrompt` type unchanged:

```ts
export type ActivePrompt =
  | { type: "custom"; id: string }
  | null;
```

Do not add MCP prompts to this type. MCP prompt attachment is a separate mechanism (multi-select, not single-select).

## 6. MCP Prompt Lifecycle

### 6.1 Fetch

Keep the current auto-fetch behavior for **preview and display purposes only**.

When an MCP server connects and reports prompts:

- fetch no-arg prompts for preview (current behavior)
- cache content in `mcpPromptCache` (current behavior)
- do NOT auto-attach (unless migration auto-attach, see 6.5)

The fetch is for the UI to show what is available, not to inject content.

### 6.5 Migration auto-attach

Use `promptVersion` to detect pre-migration users and preserve their behavior:

| `promptVersion` | User type | Behavior on MCP prompt fetch |
|---|---|---|
| `undefined` / `0` | Pre-migration (was using auto-inject) | After first MCP connect, auto-attach all fetched no-arg prompts, then set `promptVersion = 1` |
| `1` | Post-migration or new user | Respect `attachedMcpPrompts` only, never auto-attach |

#### Implementation rule

The migration auto-attach runs **once**, on the first MCP prompt fetch cycle after the store initializes with `promptVersion === 0`.

After auto-attach completes, `promptVersion` is set to `1` and the migration path is never triggered again.

This means:

- old users see no behavior change on update (their prompts remain attached)
- old users gain the ability to detach prompts they do not want
- new users start in explicit-attach mode from the beginning
- no toast or hint needed (behavior is seamlessly preserved)

### 6.2 Display

Show MCP prompts in the prompt panel with:

- server name and prompt name
- description if available
- cached content preview (first ~100 chars)
- attach/detach toggle
- "needs args" badge for prompts with required arguments

### 6.3 Attach / Detach

User explicitly toggles MCP prompts on or off:

- attach: adds the prompt key to `attachedMcpPrompts`
- detach: removes the prompt key from `attachedMcpPrompts`
- only no-arg prompts can be attached in v1
- prompts with required arguments show "needs args" and are not attachable

### 6.4 Stale prompt handling

When an MCP server disconnects:

- keep `attachedMcpPrompts` entries (user intent survives reconnect)
- mark disconnected prompts visually as unavailable in UI
- exclude disconnected prompt content from assembly (no cache hit = no content)
- on reconnect, re-fetch and resume including attached prompt content

## 7. System Prompt Assembly

### 7.1 New assembly location

Move prompt assembly out of `ChatArea.tsx` into:

- `apps/web/src/lib/prompt-assembly.ts` (new file)

### 7.2 Required export

```ts
export function assembleSystemPrompt(options: {
  systemPrompt: string;
  attachedMcpPrompts: string[];
  mcpPromptCache: Record<string, string>;
  activePrompt: ActivePrompt;
  customPrompts: CustomPrompt[];
}): string | undefined;
```

### 7.3 Assembly rules

1. Start with `systemPrompt` if non-empty
2. For each key in `attachedMcpPrompts` (in order):
   - look up content in `mcpPromptCache`
   - if found, append
   - if not found (server disconnected / not yet fetched), skip silently
3. If `activePrompt` is set, look up content in `customPrompts` and append
4. Join all parts with `\n\n`
5. Return `undefined` if no parts have content

### 7.4 What changes in ChatArea.tsx

Replace the current `selectedPromptContent` useMemo with a call to `assembleSystemPrompt`.

The current code:

```ts
// ChatArea.tsx:199-215 -- REMOVE THIS
const selectedPromptContent = useMemo(() => {
  const parts: string[] = [];
  // unconditionally adds ALL cached MCP prompts
  for (const source of mcpSources) { ... }
  ...
}, [...]);
```

Replace with:

```ts
const assembledPrompt = useMemo(() => {
  return assembleSystemPrompt({
    systemPrompt,
    attachedMcpPrompts,
    mcpPromptCache,
    activePrompt,
    customPrompts,
  });
}, [systemPrompt, attachedMcpPrompts, mcpPromptCache, activePrompt, customPrompts]);
```

### 7.5 What changes in sendMessage

No change to `sendMessage` signature. It still receives `systemPrompt?: string`.

The only change is what value is passed in.

## 8. UI Changes

### 8.1 Naming

| Current | New |
|---------|-----|
| 系统提示词 | 提示词 |
| MCP 提供（自动） | MCP 模板 |
| 自动 (badge) | Remove |
| 已激活 | 已附加 |
| 系统提示 (button label) | 提示词 |

### 8.2 SystemPromptPanel redesign

Update:

- `apps/web/src/components/SystemPromptPanel.tsx`

#### New sections

The panel should have three sections:

```text
[系统提示] (collapsible)
  - text area for host-level system prompt
  - global, not per-conversation
  - label: "基础指令"

[MCP 模板] (collapsible)
  - list of MCP prompts from connected servers
  - each item has attach/detach toggle
  - attached items show checkmark
  - unattached items show empty circle
  - "needs args" items show disabled badge
  - label: "来自 MCP 服务器"

[我的提示词] (collapsible)
  - current custom prompt list (keep as-is)
  - single-select behavior (keep as-is)
  - label: "自定义提示词"
```

#### Interaction model

- System prompt: edit inline, auto-save on blur or debounce
- MCP templates: click to toggle attach/detach
- Custom prompts: click to select (single), edit/delete via hover actions

### 8.3 Status indicator

The trigger button should reflect all active layers:

```ts
// Examples:
// nothing active -> "提示词"
// only system prompt -> "提示词 ·"  (dot indicator)
// system + 2 MCP attached -> "提示词 · MCP×2"
// system + custom "翻译助手" -> "提示词 · 翻译助手"
// all three -> "提示词 · MCP×2 · 翻译助手"
```

## 9. leochat-mcp Prompt Cleanup

Update:

- `packages/leochat-mcp/src/index.ts`

### Current state

The `leochat_assistant` prompt in leochat-mcp is a tool usage guide that gets auto-injected as system prompt. This is the exact anti-pattern.

### Required change

Keep the prompt defined in leochat-mcp (it is a valid MCP prompt). But:

- it should no longer be auto-injected
- the user must explicitly attach it if they want the LeoChat tool usage guide
- consider renaming from `leochat_assistant` to `leochat_tool_guide` for clarity

### No other changes to leochat-mcp for this spec

Tool definitions remain unchanged. Only the prompt's consumption path changes.

## 10. File Ownership

### Agent E: Prompt system

Owns:

- `apps/web/src/stores/prompt.ts`
- `apps/web/src/lib/prompt-assembly.ts` (new)
- `apps/web/src/components/SystemPromptPanel.tsx`

### Shared with card system agents

- `apps/web/src/components/ChatArea.tsx` (Agent C also touches this for card integration)

Coordination rule: prompt agent changes only the `selectedPromptContent` assembly and auto-fetch logic in ChatArea. Card agent changes only the card rendering and action dispatch logic.

### Independent from card system

This spec can be implemented independently of the card system spec. No blocking dependency in either direction.

## 11. Migration Rules

### Must keep working during migration

- custom prompt create/edit/delete/select
- MCP prompt fetch and cache (for display)
- `sendMessage(content, systemPrompt)` signature

### Must change

- MCP prompts stop being auto-injected
- `selectedPromptContent` is replaced by `assembleSystemPrompt`
- UI labels change from "系统提示词" / "自动" to new naming

### Breaking change mitigation

The `promptVersion` migration strategy (Section 6.5) ensures no user sees a behavior change on update:

- pre-migration users (`promptVersion` undefined/0) get their MCP prompts auto-attached on first connect, then `promptVersion` is set to 1
- post-migration users and new users are in explicit-attach mode from the start

No toast or hint is needed. The migration is seamless.

## 12. Acceptance Criteria

### Milestone 1: Assembly refactored

Done when:

- `assembleSystemPrompt` exists and is tested
- `ChatArea.tsx` uses it instead of inline assembly
- no behavioral change yet (still auto-injects, for safe rollout)

### Milestone 2: Explicit attachment

Done when:

- `attachedMcpPrompts` and `promptVersion` state exists in prompt store
- MCP prompts are only included when explicitly attached
- migration auto-attach works: `promptVersion === 0` triggers one-time auto-attach, then sets to `1`
- UI shows attach/detach toggle
- unconditional auto-inject is removed

### Milestone 3: System prompt layer

Done when:

- host-level system prompt field exists in store
- system prompt is editable in the panel
- assembly order is: system -> attached MCP -> custom

### Milestone 4: UI polish

Done when:

- all labels updated to new naming
- status indicator shows active layers

## 13. Test Strategy

### Required tests

- `assembleSystemPrompt` unit tests:
  - empty inputs -> undefined
  - system prompt only -> system prompt string
  - system + attached MCP -> correct order and separator
  - attached MCP key not in cache -> skipped silently
  - all three layers -> correct assembly order
- prompt store tests:
  - attach/detach updates `attachedMcpPrompts`
  - detached prompt is excluded from assembly
  - persistence round-trip for `attachedMcpPrompts`, `systemPrompt`, and `promptVersion`
- migration tests:
  - `promptVersion === 0` + MCP prompts fetched -> auto-attach all, set `promptVersion = 1`
  - `promptVersion === 1` + MCP prompts fetched -> no auto-attach
  - `promptVersion === 0` + no MCP prompts -> set `promptVersion = 1`, `attachedMcpPrompts` stays empty

### Smoke tests

- open prompt panel, verify three sections visible
- attach an MCP prompt, send a message, verify it appears in the prompt sent
- detach it, send again, verify it is absent
- simulate pre-migration user (clear `promptVersion`), connect MCP server, verify prompts auto-attached

## 14. Example Assembly

### Input

```ts
{
  systemPrompt: "You are a helpful assistant. Be concise.",
  attachedMcpPrompts: ["leochat-mcp:leochat_assistant"],
  mcpPromptCache: {
    "leochat-mcp:leochat_assistant": "You have access to theme, notification, and panel tools..."
  },
  activePrompt: { type: "custom", id: "custom-123" },
  customPrompts: [
    { id: "custom-123", name: "翻译助手", content: "You are a translator. Translate between Chinese and English.", ... }
  ]
}
```

### Output

```text
You are a helpful assistant. Be concise.

You have access to theme, notification, and panel tools...

You are a translator. Translate between Chinese and English.
```

### Input (nothing attached)

```ts
{
  systemPrompt: "",
  attachedMcpPrompts: [],
  mcpPromptCache: { "leochat-mcp:leochat_assistant": "..." },
  activePrompt: null,
  customPrompts: []
}
```

### Output

```text
undefined
```

The cached MCP prompt is not included because it is not in `attachedMcpPrompts`.

## 15. Implementation Constraints

- do not change `sendMessage` signature
- do not change TaskLoop prompt handling
- do not change MCP prompt fetch mechanism (keep auto-fetch for preview)
- do not delete `mcpPromptCache` (still needed for display and attached content)
- do not couple this work to the card system implementation
- preserve all current custom prompt CRUD functionality

## 16. Final Intended State

After migration, LeoChat prompt handling should be:

- system prompt: host-owned, always first, editable in settings
- custom prompt: user-created overlay, single-select, editable
- MCP prompt: server-provided template, explicit attach, multi-select
- assembly: deterministic order, testable, no implicit injection
- UI: clear naming that distinguishes templates from system instructions
