# LeoChat Refactor Directions

This note records current refactor directions for LeoChat based on observed design mismatches and incomplete product layers.

## Current Assessment

LeoChat already has a usable core chat + MCP loop, but several surrounding systems are still in a transitional design state:

- UI command and card rendering are mixing command execution with text-postprocessing
- MCP prompts are being used as a system prompt input channel rather than as prompt templates
- persistence is partially implemented and not yet a fully reliable product layer

The goal of this document is to keep the next refactors aligned around clearer boundaries.

## 1. UI Command And Card System

### Current State

- Command-style MCP tools such as theme switching fit the current design well
- Cards and other rich UI elements are less mature
- `render_cards` is not fully enabled in the LeoChat MCP server
- card rendering currently relies heavily on model-emitted text tags such as `<card />` and `<cards>`
- action execution is not yet a complete closed loop

### Main Problem

The current design mixes two different concepts:

- command execution: change state, open panel, set input, show notification
- structured content rendering: cards, media blocks, richer message widgets

Commands are currently represented as structured JSON, while cards are mostly represented as text conventions parsed later. That makes cards much less stable than theme changes.

### Refactor Direction

- Keep UI commands as a first-class structured protocol for imperative actions
- Move cards away from text-tag parsing toward first-class structured message content
- Separate `command` payloads from `content` payloads
- Treat card rendering as message content, not as a side-effect command
- Add a clear action callback contract for interactive cards/buttons

### Target Shape

- `ui-command`: imperative UI side effects
- `message-content`: structured renderable content such as cards, media, buttons, tables
- text tags remain only as a temporary compatibility layer, not the primary protocol

### Migration Notes

- preserve existing `update_theme` flow as the reference implementation
- introduce `render_cards` only after a stable structured payload is defined
- keep parser-based `<card />` support during migration, then gradually demote it

## 2. MCP Prompt Usage

For the detailed executable spec, see:

- [leochat-prompt-spec.md](C:/code/LeoChat/docs/leochat-prompt-spec.md)
- [leochat-prompt-migration-plan.md](C:/code/LeoChat/docs/leochat-prompt-migration-plan.md)

### Current State

MCP prompts are currently being treated like a source of system prompt text:

- prompts are listed from MCP servers
- no-arg prompts are auto-fetched
- fetched prompt text is cached
- cached MCP prompt text is concatenated with custom prompt text
- the combined result is passed into chat as `systemPrompt`

### Main Problem

This collapses multiple layers into one:

- system prompt
- user-selected custom prompt
- MCP-provided prompt templates

MCP prompts are better understood as reusable prompt templates or task-scoped prompt fragments, not as a default global system prompt channel.

### Refactor Direction

- keep system prompt as host-owned global behavior and safety layer
- keep custom prompt as user-selected behavioral/task overlay
- treat MCP prompts as callable or attachable prompt templates
- do not auto-promote all MCP prompts into the highest-priority instruction layer
- support explicit prompt application instead of implicit prompt injection

### Target Shape

- `system prompt`: application-level base instruction
- `custom prompt`: user-selected overlay
- `MCP prompt`: optional server-provided template/snippet, attached per task or explicit selection

### Migration Notes

- stop thinking of MCP prompt as “the place to put system prompt”
- add UI language that presents MCP prompts as templates/capabilities instead of global prompt sources
- keep auto-fetch/cache only if the cached result is used as optional material, not silently merged into every request

## 3. Persistence And Storage

### Current State

- chat persistence is moving away from plain localStorage
- browser side now has IndexedDB-based storage adapter
- Electron side now has IPC-backed file storage
- migration logic exists, but the persistence model is still relatively young

### Main Problem

Persistence is still closer to a technical patch than a mature storage architecture:

- storage responsibilities are split across browser and Electron adapters
- data model durability rules are not clearly documented
- there is limited evidence of corruption recovery, versioning, or migration strategy beyond simple transfer
- conversation/tool state persistence behavior is partially ad hoc

### Refactor Direction

- define persistence as a product-level subsystem, not just a Zustand adapter
- document what must persist and what must remain runtime-only
- add versioned storage schemas and explicit migration strategy
- formalize recovery behavior for partial generations, pending tool calls, and interrupted sessions
- decide whether long-term storage should stay client-local or move partly to backend/desktop DB

### Target Shape

- clear storage schema versions
- explicit migration path
- stable separation between persisted conversation data and ephemeral execution state
- one documented persistence contract across Web and Electron

### Migration Notes

- current adapter abstraction is a useful start and should be preserved
- runtime cleanup of stale `pending/running` tool states is good defensive behavior and should remain
- next maturity step is schema governance, not just more adapters

## Suggested Refactor Order

1. Clarify protocol boundaries: command vs content vs prompt
2. Fix MCP prompt semantics in product/UI language and request assembly
3. Promote cards to structured content protocol
4. Complete action callback loop for rich UI content
5. Formalize persistence schema and migration rules

## Guiding Principle

LeoChat should avoid treating everything as “more prompt text”.

The cleaner long-term architecture is:

- prompts shape model behavior
- tools perform actions or fetch data
- commands drive imperative UI changes
- content schemas render rich message UI
- persistence stores durable state with explicit lifecycle rules
