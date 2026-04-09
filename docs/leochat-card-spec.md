# LeoChat Card System Detailed Spec

This specification is intended for implementation by multiple agents.

It defines:

- architecture boundaries
- data contracts
- file ownership
- migration rules
- acceptance criteria

This spec supersedes ad hoc extensions to the current parser-based card flow.

## 1. Scope

This spec covers:

- the generic LeoChat card schema
- message content integration
- rendering contract
- card action contract
- `leochat-mcp` narrowing
- compatibility handling for legacy parser-based cards

This spec does not cover:

- business-domain-specific cards
- full form engine support
- Feishu compatibility
- backend persistence redesign beyond what card integration requires

## 2. Goals

### Primary goals

- make cards first-class structured message content
- keep UI commands small and imperative
- stop depending on text tag parsing for new built-in features
- allow external and built-in MCP tools to return card payloads safely
- shrink `leochat-mcp` into a focused host command server

### Non-goals

- do not implement a universal page builder
- do not add arbitrary frontend control hooks
- do not make `leochat-mcp` a full UI automation surface

## 3. Core Design Rules

### Rule 1: Command is not content

Use `ui-command` only for host side effects.

Examples:

- theme switch
- open panel
- show notification
- focus input

Do not use `ui-command` for:

- structured summaries
- result previews
- review/approval presentation
- generated media blocks

Those must be represented as card content.

### Rule 2: New built-in card features must be schema-first

Any new built-in feature that visually behaves like a card must use the new schema path.

Do not add new features that depend on:

- `<card />`
- `<cards>`
- text-only action conventions

### Rule 3: Chat remains a container

Cards are content items inside a message.

The message transport may still be chat-oriented, but cards must not be treated as text decorations.

### Rule 4: Legacy parser flow remains compatibility-only

Parser-based cards remain supported during migration, but are deprecated for forward development.

### Rule 5: Data flow must stay explicit

No implementation agent should invent a new card transport path without updating this spec.

For v1, card data must travel through existing tool-result and message-content paths, not via a brand new SSE event type.

## 4. Target Architecture

```text
MCP Tool / Server Result
  -> LeoChat Structured Content Detection
  -> DisplayMessage.contentItems[]
  -> leo-card renderer
  -> card action runtime
  -> host UI command or agent event dispatch
```

Parallel compatibility path:

```text
Legacy text content
  -> parseCardTags()
  -> legacy card rendering
```

## 4.1 v1 Data Flow Contract

This section is normative for implementation.

### Existing transport path to reuse

For v1, structured cards must reuse the current backend/tool result transport:

```text
MCP Tool Result
  -> SSE event `tool_result`
  -> chat store tool-result handling
  -> structured card payload detection
  -> append `leo-card` content item into the active assistant DisplayMessage
  -> renderer displays the card
```

### No new SSE event type in v1

Do not introduce:

- `card`
- `card_result`
- `structured_content`

or any equivalent new SSE event type in the first pass.

The first pass must use the current `tool_result` event payload and detect structured card content inside its `result`.

### Tool result payload contract

When a tool returns a structured card, the payload must be representable in `tool_result.result`.

The minimum supported structured payload is:

```json
{
  "type": "leochat-card",
  "card": {
    "id": "card_1",
    "kind": "summary",
    "title": "Summary"
  }
}
```

### Detection ownership

Detection responsibility in v1:

- transport receives raw tool result
- shared utility validates/normalizes structured card payload
- web/store layer converts normalized payload into `contentItems`

### Message persistence rule

For v1:

- `Message.content` remains a string
- structured cards live in `DisplayMessage.contentItems`
- cards are not serialized into `Message.content`
- cards are not stored in `Message.metadata` as the primary representation

This means first-pass card support is a display-layer capability, not a fully durable conversation interchange format.

### Durability note

Because `DisplayMessage.contentItems` is what is currently persisted in LeoChat conversations, `leo-card` content items may be persisted there during the migration period.

However, this does not make them part of the canonical LLM message contract yet.

## 4.2 Swimlane For v1

```text
Tool / MCP server
  -> returns structured payload in tool result

Server / SSE layer
  -> emits normal `tool_result`

TaskLoop / chat store
  -> receives tool result
  -> runs structured card detection
  -> if card payload:
       append `leo-card` content item to assistant display message
     else:
       continue old behavior

Renderer
  -> renders `leo-card`

Card action runtime
  -> dispatches ui-command / agent-event / link
```

## 5. Type System

## 5.1 New Shared Types

Create a new file:

- `packages/shared/src/types/card.ts`

This file is the canonical home for generic LeoChat card types.

### Required exports

```ts
export type LeoCardTone =
  | "default"
  | "info"
  | "success"
  | "warning"
  | "error";

export type LeoCardKind =
  | "summary"
  | "media"
  | "list"
  | "status"
  | "review"
  | "error"
  | (string & {});

export interface LeoCardTextBlock {
  type: "text";
  text: string;
  format?: "plain" | "markdown";
}

export interface LeoCardFieldsBlock {
  type: "fields";
  fields: Array<{ label: string; value: string }>;
}

export interface LeoCardImageBlock {
  type: "image";
  image: {
    url: string;
    alt?: string;
  };
}

export interface LeoCardImagesBlock {
  type: "images";
  images: Array<{
    url: string;
    alt?: string;
  }>;
}

export interface LeoCardProgressBlock {
  type: "progress";
  progress: {
    value: number;
    max?: number;
    label?: string;
  };
}

export interface LeoCardBadgeBlock {
  type: "badge";
  badge: {
    text: string;
    tone?: LeoCardTone;
  };
}

export interface LeoCardDividerBlock {
  type: "divider";
}

export type LeoCardBlock =
  | LeoCardTextBlock
  | LeoCardFieldsBlock
  | LeoCardImageBlock
  | LeoCardImagesBlock
  | LeoCardProgressBlock
  | LeoCardBadgeBlock
  | LeoCardDividerBlock;

export interface LeoCardConfirm {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
}

export interface LeoCardUICommandAction {
  type: "ui-command";
  command: string;
  payload?: Record<string, unknown>;
}

export interface LeoCardAgentEventAction {
  type: "agent-event";
  name: string;
  payload?: Record<string, unknown>;
}

export interface LeoCardLinkAction {
  type: "link";
  url: string;
}

export type LeoCardActionTarget =
  | LeoCardUICommandAction
  | LeoCardAgentEventAction
  | LeoCardLinkAction;

export interface LeoCardAction {
  id: string;
  label: string;
  kind?: "primary" | "secondary" | "danger";
  action: LeoCardActionTarget;
  confirm?: LeoCardConfirm;
}

export interface LeoCard {
  id: string;
  kind: LeoCardKind;
  title?: string;
  subtitle?: string;
  tone?: LeoCardTone;
  body?: LeoCardBlock[];
  actions?: LeoCardAction[];
  metadata?: Record<string, unknown>;
}
```

### Kind rendering rule

`LeoCardKind` is open for external tool extensibility.

Renderer rule:

- known kinds may receive kind-specific visuals
- unknown kinds must fall back to generic summary-style rendering

### Metadata rule

`LeoCard.metadata` is pass-through data for host/agent use.

Renderer rule:

- renderer must ignore unknown metadata keys
- renderer must not require metadata to display the card

### Card size rule

The schema does not impose a hard count limit in v1.

Renderer rule:

- it must handle large `body` and `actions` arrays gracefully
- it must not crash on unusually large cards
- truncation, scrolling, or wrapping are UI concerns, not schema errors

### Future block types

Not required in v1, but explicitly reserved for future expansion:

- code block
- table block
- richer markdown block

Implementation agents must not invent incompatible one-off block shapes for these in v1.

## 5.2 Content Item Integration

Update:

- [packages/shared/src/types/index.ts](C:/code/LeoChat/packages/shared/src/types/index.ts)

### Required changes

#### Add new content item type

Add:

```ts
| "leo-card"
```

to `ContentItemType`.

#### Add new content payload support

Update `ContentItem.content` to support `LeoCard`.

#### Backward compatibility

Keep current legacy `card` support for now.

Do not delete:

- `CardData`
- existing `card` content item type

But mark them in comments as legacy/simple compatibility types.

### Acceptance criteria

- `shared` types compile
- existing imports do not break
- new `leo-card` content items can be represented without unsafe casts

### Render-cards note

`render_cards` still appears in some current code surfaces.

For forward design:

- do not use it for new work
- mark it deprecated where touched
- remove it from canonical new contracts

## 6. Utility Layer

## 6.1 New utility file

Create:

- `packages/shared/src/utils/card-content.ts`

### Responsibilities

- detect structured LeoChat card payloads
- normalize raw payloads to `LeoCard`
- provide type guards for runtime safety

### Required exports

```ts
export function isLeoCard(value: unknown): value is LeoCard;
export function isLeoCardContentPayload(value: unknown): value is { type: "leochat-card"; card: LeoCard };
export function normalizeLeoCard(value: unknown): LeoCard | null;
```

### Rules

- be permissive enough for MCP payload parsing
- do not mutate input
- return `null` on invalid payloads

### Test requirement

This file must include unit tests or equivalent validation coverage for:

- `isLeoCard`
- `isLeoCardContentPayload`
- `normalizeLeoCard`

## 6.2 Update utils index

Update:

- [packages/shared/src/utils/index.ts](C:/code/LeoChat/packages/shared/src/utils/index.ts)

Export the new card utility file.

## 7. UI Layer

## 7.1 New UI components

Create:

- `packages/ui/src/components/leo-card.tsx`
- `packages/ui/src/components/leo-card-blocks.tsx`
- `packages/ui/src/components/leo-card-action-bar.tsx`

### Ownership

These files are owned by the UI/rendering implementation agent.

### Required component contract

#### `LeoCardView`

```ts
interface LeoCardViewProps {
  card: LeoCard;
  onAction?: (action: LeoCardAction) => void;
  className?: string;
}
```

#### Rendering requirements

- use theme classes only
- support:
  - title
  - subtitle
  - tone
  - all initial block types
  - action buttons
- no hardcoded product-specific layout
- no hardcoded business vocabulary

### Action behavior

- component must not execute actions directly except optional pure link fallback
- primary path is passing action objects to `onAction`

### Acceptance criteria

- a sample `LeoCard` renders correctly
- unknown metadata is ignored safely
- empty body or empty actions do not crash rendering
- unknown `kind` falls back safely
- `text.format === "markdown"` renders through the intended markdown path or a clearly defined temporary fallback

## 7.2 Update component exports

Update:

- [packages/ui/src/components/index.ts](C:/code/LeoChat/packages/ui/src/components/index.ts)

Export the new card components.

## 8. Web Rendering Integration

## 8.1 Message content renderer

Update:

- [apps/web/src/components/MessageContent.tsx](C:/code/LeoChat/apps/web/src/components/MessageContent.tsx)

### Required behavior

- add explicit support for `contentItem.type === "leo-card"`
- render `LeoCardView`
- route card action clicks to the card action runtime

### Rules

- do not route `leo-card` through markdown parsing
- do not depend on `parseCardTags()` for `leo-card`
- leave legacy text/tag card flow intact

### Acceptance criteria

- a message containing a `leo-card` content item renders with no parser involvement
- legacy text content still renders unchanged

## 8.2 Chat area

Update:

- [apps/web/src/components/ChatArea.tsx](C:/code/LeoChat/apps/web/src/components/ChatArea.tsx)

### Required behavior

- keep legacy parser-based rendering working
- do not introduce new schema logic here if it belongs in `MessageContent`
- if action dispatch needs wiring, delegate to shared runtime helpers

### Constraint

Do not make `ChatArea.tsx` the permanent home of card protocol logic.

## 9. Card Action Runtime

## 9.1 New files

Create:

- `apps/web/src/lib/card-actions.ts`
- `apps/web/src/lib/card-events.ts`

### Responsibilities

#### `card-actions.ts`

- dispatch `LeoCardAction`
- map actions to:
  - `ui-command`
  - `agent-event`
  - link opening

#### `card-events.ts`

- define browser event names for agent-facing events if needed
- centralize event payload typing

### Required exports

```ts
export async function executeLeoCardAction(action: LeoCardAction): Promise<void>;
```

### Required behavior

- if action has `confirm`, perform confirm step before execution
- `ui-command` path must delegate into existing `executeUICommand()`
- `agent-event` path must dispatch a structured browser event
- `link` path must open safely

### v1 scope decision for `agent-event`

For v1, `agent-event` is `stub-but-real`.

Meaning:

- dispatch is implemented
- naming contract is defined
- browser event is observable
- no response/ack contract is required in v1
- no guaranteed consumer is required in v1

Implementation agents must not invent a request/response bus for v1.

### Required browser event shape

The browser event must use a stable name:

- `leochat:card-action`

Suggested event detail:

```ts
{
  actionId: string;
  cardId?: string;
  name: string;
  payload?: Record<string, unknown>;
}
```

### Acceptance criteria

- clicking a card action can trigger an existing UI command
- confirm gate works
- agent event dispatch is observable from the host

## 10. Store Integration

Update:

- [apps/web/src/stores/chat.ts](C:/code/LeoChat/apps/web/src/stores/chat.ts)

### Required changes

- support adding `leo-card` content items into `DisplayMessage.contentItems`
- do not force cards into text channels
- preserve compatibility with existing text/tool-call handling

### Optional for first pass

- agent-event handling can remain minimal
- no full workflow engine required yet

### Current integration point

For v1, Agent C should assume:

- no new `toDisplayMessage()` card persistence path is required
- card injection happens in chat/store update handling when tool results arrive
- canonical `Message` remains string-based for LLM exchange

## 11. Structured Tool Result Handling

Update:

- [apps/web/src/lib/ui-commands.ts](C:/code/LeoChat/apps/web/src/lib/ui-commands.ts)

### Required changes

Split responsibilities clearly:

- `ui-commands.ts` should remain responsible for UI commands
- card payload detection should be added without turning the file into a generic renderer

### Preferred design

Either:

- add a parallel helper in a new file for tool-result structured content parsing

or:

- keep card parsing logic in `ui-commands.ts` minimal and extract later

### New supported tool result format

At minimum support:

```json
{
  "type": "leochat-card",
  "card": {
    "id": "card_1",
    "kind": "summary",
    "title": "Summary"
  }
}
```

### Important rule

Do not represent cards as a `ui-command` named `render_cards`.

Cards are content, not side effects.

### File note

If card-result parsing starts to make `ui-commands.ts` too broad, split it into:

- `ui-commands.ts`
- `tool-result-content.ts`

This split is allowed in v1 if it reduces ambiguity.

## 12. leochat-mcp Narrowing

Update:

- [packages/leochat-mcp/src/index.ts](C:/code/LeoChat/packages/leochat-mcp/src/index.ts)

## 12.1 Keep

Keep these tools product-facing:

- `update_theme`
- `show_notification`
- `open_panel`
- `close_panel`
- `copy_to_clipboard`
- `open_url`
- `set_input`

## 12.2 Review

Keep only if still justified:

- `show_confirm`
- `scroll_to_message`

If kept, they remain host utility tools, not workflow substitutes.

## 12.3 Status Update

- `test_tool_call` — deprecated, dev/debug only
- `generate_waifu` — updated to LeoCard JSON format (kind: "media"), retained as built-in card demo
- `pokemon_quiz` — extracted to standalone MCP server `mcp-servers/pokemon-quiz/` (3 tools: start/answer/next)
- `ecommerce` — new standalone MCP server `mcp-servers/ecommerce/` (8 tools: search/detail/cart/order)

## 12.4 Do not revive `render_cards` as a command

The commented `render_cards` direction must not be restored as a command-based design.

Replace it with structured card content support.

## 13. Legacy Compatibility Rules

### Must keep working during migration

- `parseActionTags()`
- `parseCardTags()`
- current `ActionCardGroup`
- existing text+markdown rendering flow

### Must be marked internally as legacy

- parser-based card rendering
- text tag card generation for built-in features

### Must not be used for new built-in work

- `<card />`
- `<cards>`
- text-generated card blocks for built-in MCP tools

## 14. File Ownership For Parallel Agents

Use this ownership split if multiple agents implement in parallel.

### Agent A: Shared protocol

Owns:

- `packages/shared/src/types/card.ts`
- [packages/shared/src/types/index.ts](C:/code/LeoChat/packages/shared/src/types/index.ts)
- `packages/shared/src/utils/card-content.ts`
- [packages/shared/src/utils/index.ts](C:/code/LeoChat/packages/shared/src/utils/index.ts)

### Agent B: UI rendering

Owns:

- `packages/ui/src/components/leo-card.tsx`
- `packages/ui/src/components/leo-card-blocks.tsx`
- `packages/ui/src/components/leo-card-action-bar.tsx`
- [packages/ui/src/components/index.ts](C:/code/LeoChat/packages/ui/src/components/index.ts)

### Agent C: Web integration

Owns:

- [apps/web/src/components/MessageContent.tsx](C:/code/LeoChat/apps/web/src/components/MessageContent.tsx)
- [apps/web/src/components/ChatArea.tsx](C:/code/LeoChat/apps/web/src/components/ChatArea.tsx)
- `apps/web/src/lib/card-actions.ts`
- `apps/web/src/lib/card-events.ts`
- [apps/web/src/stores/chat.ts](C:/code/LeoChat/apps/web/src/stores/chat.ts)

### Agent D: Built-in MCP cleanup

Owns:

- [packages/leochat-mcp/src/index.ts](C:/code/LeoChat/packages/leochat-mcp/src/index.ts)

### Shared caution

No parallel agent should edit the same file set as another agent unless explicitly coordinated.

## 14.1 Actual Dependency Chain

Parallelism is partial, not full.

Real dependency order:

```text
Agent A (shared protocol) ---> Agent B (UI rendering) ---> Agent C (web integration)
Agent D (leochat-mcp cleanup) is largely independent
```

### Practical sequencing

- Agent A and Agent D can start immediately
- Agent B should start after Agent A lands the canonical types
- Agent C should start after Agent A lands, and ideally after Agent B defines renderer props

## 15. Acceptance Criteria By Milestone

## Milestone 1: Protocol introduced ✅

Done:

- `LeoCard` types exist in `packages/shared/src/types/card.ts`
- `leo-card` is a valid content item type in `ContentItemType`
- project type surface remains backward compatible
- `normalizeLeoCard`, `isLeoCard` guards in `card-content.ts`

## Milestone 2: Renderer introduced ✅

Done:

- `LeoCardView` renders from structured content (`packages/ui/src/components/leo-card.tsx`)
- `LeoCardBlocks` renders all block types (`leo-card-blocks.tsx`)
- `LeoCardActionBar` renders action buttons (`leo-card-action-bar.tsx`)
- existing text/card flow still works
- unknown kinds fall back to summary-style rendering

## Milestone 3: Card actions work ✅

Done:

- `card-actions.ts` dispatches ui-command / link / agent-event
- `card-events.ts` defines `leochat:card-action` browser event
- `send_message` ui-command enables card → LLM interactive loops
- `ChatMessage` (UI) passes `onCardAction` prop for action handling

## Milestone 4: leochat-mcp narrowed ✅

Done:

- `generate_waifu` updated to LeoCard format, retained as card demo
- `test_tool_call` deprecated
- `render_cards` remains absent as a command path
- Domain tools (pokemon-quiz, ecommerce) extracted to `mcp-servers/`

## 15.1 Test Strategy

### Required tests for Agent A

- unit tests for card payload validation and normalization
- type-surface sanity checks where practical

### Required tests for Agent B

- smoke render test for `LeoCardView`
- smoke render test for unknown `kind`
- smoke render test for empty `body` / `actions`

### Required tests for Agent C

- integration-style test or local verification path:
  - tool result with `type: "leochat-card"`
  - converted into `leo-card` content item
  - rendered in message UI

### Required tests for Agent D

- no formal unit tests required if changes are purely subtractive/documenting
- if payload format changes are introduced, add targeted validation

## 16. Example Payloads

## 16.1 Simple summary card

```json
{
  "type": "leochat-card",
  "card": {
    "id": "summary_1",
    "kind": "summary",
    "title": "Generated Content",
    "subtitle": "3 variants ready",
    "tone": "success",
    "body": [
      {
        "type": "fields",
        "fields": [
          { "label": "Variants", "value": "3" },
          { "label": "Status", "value": "Ready" }
        ]
      }
    ],
    "actions": [
      {
        "id": "open_1",
        "label": "Open",
        "kind": "primary",
        "action": {
          "type": "ui-command",
          "command": "open_panel",
          "payload": { "panel": "history" }
        }
      }
    ]
  }
}
```

## 16.2 Review card

```json
{
  "type": "leochat-card",
  "card": {
    "id": "review_1",
    "kind": "review",
    "title": "Pick a Variant",
    "body": [
      {
        "type": "text",
        "text": "Choose the best version to apply."
      }
    ],
    "actions": [
      {
        "id": "apply_a",
        "label": "Apply Variant A",
        "kind": "primary",
        "action": {
          "type": "agent-event",
          "name": "apply_variant",
          "payload": { "variantId": "A" }
        },
        "confirm": {
          "title": "Apply variant",
          "message": "Use Variant A as the final version?"
        }
      }
    ]
  }
}
```

## 17. Implementation Constraints

- use ASCII unless existing file style requires otherwise
- preserve current exported APIs where possible
- do not break existing chat rendering during the first implementation pass
- do not delete legacy card parser utilities until replacement is proven
- do not introduce domain-specific naming into the generic card schema

## 18. Final Intended State

LeoChat after migration should have:

- a small host command server
- a reusable generic card schema
- a renderer that treats cards as first-class content
- a card action runtime for structured interaction
- legacy text-tag parsing only as fallback compatibility

That is the intended foundation for future domain-specific agent work.
