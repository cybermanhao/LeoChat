# LeoChat Prompt Migration Plan

This document turns the prompt system spec into a file-level migration plan.

It assumes LeoChat will:

- separate system prompt, custom prompt, and MCP prompt into distinct layers
- stop auto-injecting MCP prompts into every request
- keep MCP prompt fetch for preview and display
- make MCP prompt attachment explicit

## Phase 0: Extract Assembly Logic

### Goal

Move prompt assembly out of ChatArea into a testable utility, without changing behavior yet.

### New files to add

- `apps/web/src/lib/prompt-assembly.ts`

### Existing files to update

- `apps/web/src/components/ChatArea.tsx`

### Main changes

- extract the `selectedPromptContent` useMemo logic into `assembleSystemPrompt()`
- ChatArea calls the new function instead of inline assembly
- behavior stays the same (still auto-injects all MCP prompts)
- add unit tests for the extracted function

### Result

Assembly is testable and isolated. No user-visible change.

## Phase 1: Add Explicit Attachment Mechanism

### Goal

Give users control over which MCP prompts are included.

### Existing files to update

- `apps/web/src/stores/prompt.ts`
- `apps/web/src/lib/prompt-assembly.ts`
- `apps/web/src/components/ChatArea.tsx`

### Main changes

- add `attachedMcpPrompts: string[]` to prompt store (persisted)
- add `promptVersion: number` to prompt store (persisted, default `0`)
- add `attachMcpPrompt` / `detachMcpPrompt` / `isAttached` actions
- update `assembleSystemPrompt` to use `attachedMcpPrompts` instead of all cached prompts
- remove the unconditional MCP prompt concatenation from ChatArea

### Migration behavior via `promptVersion`

- `promptVersion === 0` (pre-migration user): on first MCP prompt fetch cycle, auto-attach all fetched no-arg prompts into `attachedMcpPrompts`, then set `promptVersion = 1`
- `promptVersion === 1` (post-migration or new user): respect `attachedMcpPrompts` only, never auto-attach
- this means existing users see no behavior change on update, but gain the ability to detach
- new users start clean with nothing auto-attached

### Result

MCP prompts are only included when explicitly attached. Users can opt out.

## Phase 2: Add System Prompt Layer

### Goal

Add a host-level system prompt that is distinct from custom prompts.

### Existing files to update

- `apps/web/src/stores/prompt.ts`
- `apps/web/src/lib/prompt-assembly.ts`
- `apps/web/src/components/SystemPromptPanel.tsx`

### Main changes

- add `systemPrompt: string` to prompt store (persisted)
- add `setSystemPrompt` action
- update assembly to include system prompt as the first layer
- add system prompt section to SystemPromptPanel UI

### Result

Users can set a base system prompt that always applies, separate from per-task custom prompts and MCP templates.

## Phase 3: Update UI

### Goal

Rename UI elements and update interaction model.

### Existing files to update

- `apps/web/src/components/SystemPromptPanel.tsx`
- `apps/web/src/components/ChatArea.tsx` (trigger button label)
- locale files if i18n is used

### Main changes

- rename "系统提示词" -> "提示词"
- rename "MCP 提供（自动）" -> "MCP 模板"
- remove "自动" badge from MCP prompts
- add attach/detach toggle to each MCP prompt item
- update trigger button to show active layer summary
- add three-section layout: 系统提示 / MCP 模板 / 我的提示词

### Result

UI clearly communicates that MCP prompts are templates, not automatic system instructions.

## Phase 4: leochat-mcp Prompt Cleanup

### Goal

Align the built-in MCP server's prompt with the new model.

### Existing files to update

- `packages/leochat-mcp/src/index.ts`

### Main changes

- consider renaming `leochat_assistant` prompt to `leochat_tool_guide`
- update description to clarify it is a template, not a system instruction
- no functional change to the prompt content itself

### Result

The built-in MCP prompt is correctly positioned as a template.

## Recommended File Order

1. `apps/web/src/lib/prompt-assembly.ts` (new, extract + test)
2. `apps/web/src/stores/prompt.ts` (add attachment state)
3. `apps/web/src/components/ChatArea.tsx` (wire new assembly)
4. `apps/web/src/components/SystemPromptPanel.tsx` (UI update)
5. `packages/leochat-mcp/src/index.ts` (prompt rename, optional)

## Parallel Execution

This work is a single-agent task. The dependency chain is linear:

```text
Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4
```

Phase 4 is optional and can be deferred.

This migration is fully independent of the card system migration. They can run in parallel.

## Suggested First Deliverable

The minimum viable change:

- extract `assembleSystemPrompt` with tests
- add `attachedMcpPrompts` and `promptVersion` to store
- switch from auto-inject to explicit attach
- `promptVersion`-based migration: auto-attach for old users, explicit for new users

This gives users immediate control without breaking their current setup.

## Non-Goals For The First Pass

- do not implement prompt argument UI
- do not add per-conversation prompt selection (keep global)
- do not add prompt import/export
- do not build prompt versioning
- do not change TaskLoop prompt handling
