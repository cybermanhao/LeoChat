# LeoChat Card Migration Plan

This document turns the generic card system direction into a file-level migration plan.

It assumes LeoChat will:

- keep a small host-level UI command layer
- add first-class generic card content
- narrow `leochat-mcp`
- preserve compatibility during migration

## Phase 0: Freeze The Old Direction

### Goal

Prevent further expansion of the current ad hoc path while the new structure is introduced.

### Decisions

- do not add new built-in features based on `<card />` text tags
- do not add new built-in demo tools to `leochat-mcp`
- do not expand `UICommand` as a catch-all frontend control protocol

### Files affected

- [packages/leochat-mcp/src/index.ts](C:/code/LeoChat/packages/leochat-mcp/src/index.ts)
- [apps/web/src/lib/ui-commands.ts](C:/code/LeoChat/apps/web/src/lib/ui-commands.ts)
- [packages/shared/src/utils/stream.ts](C:/code/LeoChat/packages/shared/src/utils/stream.ts)

## Phase 1: Introduce First-Class Generic Card Types

### Goal

Add structured card definitions to the shared type system without breaking existing rendering.

### New files to add

- `packages/shared/src/types/card.ts`
- `packages/shared/src/utils/card-content.ts`

### Existing files to update

- [packages/shared/src/types/index.ts](C:/code/LeoChat/packages/shared/src/types/index.ts)
- [packages/shared/src/utils/index.ts](C:/code/LeoChat/packages/shared/src/utils/index.ts)

### Main changes

- add `LeoCard`, `LeoCardBlock`, `LeoCardAction`
- add richer card types beyond the current `CardData`
- add a new content item type such as `leo-card`
- keep legacy `card` support temporarily, but mark it as compatibility-only

### Result

LeoChat gains a real card schema layer in `shared`, independent from markdown/text parsing.

## Phase 2: Add A Dedicated Card Renderer

### Goal

Move rendering responsibility from text post-processing into a schema-driven card renderer.

### New files to add

- `packages/ui/src/components/leo-card.tsx`
- `packages/ui/src/components/leo-card-blocks.tsx`
- `packages/ui/src/components/leo-card-action-bar.tsx`

### Existing files to update

- [packages/ui/src/components/index.ts](C:/code/LeoChat/packages/ui/src/components/index.ts)
- [apps/web/src/components/MessageContent.tsx](C:/code/LeoChat/apps/web/src/components/MessageContent.tsx)
- [packages/ui/src/components/chat-message.tsx](C:/code/LeoChat/packages/ui/src/components/chat-message.tsx)

### Main changes

- render first-class card content items directly
- keep `ActionCardGroup` only as a legacy/simple renderer or internal primitive
- ensure card rendering works without passing through markdown parsing

### Result

Cards become real message content, not markdown-like decorations.

## Phase 3: Add Card Action Runtime

### Goal

Let generic cards emit structured actions back to the host.

### New files to add

- `apps/web/src/lib/card-actions.ts`
- `apps/web/src/lib/card-events.ts`

### Existing files to update

- [apps/web/src/stores/chat.ts](C:/code/LeoChat/apps/web/src/stores/chat.ts)
- [apps/web/src/components/ChatArea.tsx](C:/code/LeoChat/apps/web/src/components/ChatArea.tsx)
- [apps/web/src/lib/ui-commands.ts](C:/code/LeoChat/apps/web/src/lib/ui-commands.ts)

### Main changes

- define structured card action dispatch
- let card actions map to:
  - host ui command
  - agent event
  - link/open action
- move future approve/reject/apply/retry flows to card actions instead of free-form text actions

### Result

Cards become interactive workflow units instead of passive UI output.

## Phase 4: Add Structured Card Payload Support To Tool Results

### Goal

Allow MCP/server results to return structured card content directly.

### New files to add

- `packages/shared/src/mcp-schema.ts` additions or a new helper file for LeoChat content payloads

### Existing files to update

- [apps/web/src/lib/ui-commands.ts](C:/code/LeoChat/apps/web/src/lib/ui-commands.ts)
- [packages/server/src/routes/index.ts](C:/code/LeoChat/packages/server/src/routes/index.ts)
- [apps/web/src/stores/chat.ts](C:/code/LeoChat/apps/web/src/stores/chat.ts)

### Main changes

- detect a new result format such as `type: "leochat-card"` or equivalent structured payload
- create `contentItems` directly from structured payloads
- stop routing those cases through text parsing

### Result

Built-in and external MCP tools can target LeoChat cards explicitly.

## Phase 5: Narrow leochat-mcp

### Goal

Reduce `leochat-mcp` to a focused built-in host command server.

### Existing files to update

- [packages/leochat-mcp/src/index.ts](C:/code/LeoChat/packages/leochat-mcp/src/index.ts)

### Keep

- `update_theme`
- `show_notification`
- `open_panel`
- `close_panel`
- `copy_to_clipboard`
- `open_url`
- `set_input`

### Review carefully

- `show_confirm`
- `scroll_to_message`

### Move out or delete

- `test_tool_call`
- `generate_waifu`
- text-driven `render_cards` idea

### Main changes

- remove demo/tooling-oriented features from product-facing built-in server
- keep the built-in MCP server aligned with host UI capability, not novelty tools
- optionally create a separate demo/debug MCP server later

### Result

`leochat-mcp` becomes smaller, clearer, and easier to maintain.

## Phase 6: Deprecate Parser-Based Card Flow

### Goal

Move parser-based rich content into compatibility mode.

### Existing files to update

- [packages/shared/src/utils/stream.ts](C:/code/LeoChat/packages/shared/src/utils/stream.ts)
- [apps/web/src/components/ChatArea.tsx](C:/code/LeoChat/apps/web/src/components/ChatArea.tsx)
- [apps/web/src/components/MessageContent.tsx](C:/code/LeoChat/apps/web/src/components/MessageContent.tsx)

### Main changes

- keep `parseCardTags()` temporarily
- do not use it for new built-in functionality
- annotate internally as legacy/compat behavior
- eventually restrict it to old content or external fallback only

### Result

The product no longer depends on text-tag cards for forward motion.

## Phase 7: Fix Prompt Semantics Around Cards

### Goal

Ensure prompts describe when to use cards, but do not collapse prompt/template/content layers.

### Existing files to update

- [packages/leochat-mcp/src/index.ts](C:/code/LeoChat/packages/leochat-mcp/src/index.ts)
- [apps/web/src/stores/prompt.ts](C:/code/LeoChat/apps/web/src/stores/prompt.ts)
- [apps/web/src/components/SystemPromptPanel.tsx](C:/code/LeoChat/apps/web/src/components/SystemPromptPanel.tsx)

### Main changes

- stop using MCP prompts as silent global system prompt material
- present prompts as templates or reusable capability snippets
- add explicit prompt application UX later if needed

### Result

Prompt usage becomes cleaner and less entangled with rendering behavior.

## Recommended File Order

If implementation starts now, this is the recommended order:

1. [packages/shared/src/types/index.ts](C:/code/LeoChat/packages/shared/src/types/index.ts)
2. `packages/shared/src/types/card.ts`
3. [packages/shared/src/utils/index.ts](C:/code/LeoChat/packages/shared/src/utils/index.ts)
4. `packages/ui/src/components/leo-card.tsx`
5. [packages/ui/src/components/index.ts](C:/code/LeoChat/packages/ui/src/components/index.ts)
6. [apps/web/src/components/MessageContent.tsx](C:/code/LeoChat/apps/web/src/components/MessageContent.tsx)
7. [apps/web/src/components/ChatArea.tsx](C:/code/LeoChat/apps/web/src/components/ChatArea.tsx)
8. [apps/web/src/stores/chat.ts](C:/code/LeoChat/apps/web/src/stores/chat.ts)
9. [apps/web/src/lib/ui-commands.ts](C:/code/LeoChat/apps/web/src/lib/ui-commands.ts)
10. [packages/leochat-mcp/src/index.ts](C:/code/LeoChat/packages/leochat-mcp/src/index.ts)

## Parallel Execution Reality

The work is only partially parallelizable.

Actual dependency chain:

```text
Agent A (shared protocol) ---> Agent B (UI rendering) ---> Agent C (web integration)
Agent D (MCP cleanup) is mostly independent
```

### Practical execution order

1. Start Agent A and Agent D immediately
2. Start Agent B after Agent A lands canonical types
3. Start Agent C after Agent A lands and Agent B stabilizes renderer props

Do not start full web integration before the shared type surface is settled.

## Suggested First Deliverable

The first real milestone should be intentionally small:

- add first-class `leo-card` message content type
- add one schema-driven card renderer
- keep old parser-based cards working
- remove no tools yet
- mark `generate_waifu` and `test_tool_call` as deprecated in design docs

This gives LeoChat a new architectural direction without forcing a big-bang rewrite.

## Non-Goals For The First Pass

- do not build a full Feishu-compatible card system
- do not add forms, tables, and every possible widget immediately
- do not replace all action tags at once
- do not couple the card system to one business domain

The first pass should prove:

- structured cards can live as first-class content
- card actions can be handled cleanly
- `leochat-mcp` can become smaller, not larger
