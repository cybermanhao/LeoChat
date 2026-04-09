# LeoChat Generic Card System Draft

Schema details in this document are conceptual only.

The canonical type contract is:

- [leochat-card-spec.md](C:/code/LeoChat/docs/leochat-card-spec.md), especially Section 5.1

This document defines a proposed generic card system for LeoChat and a cleanup direction for `leochat-mcp`.

The goal is to move LeoChat from:

- text-first rich output with ad hoc parsing

to:

- structured card/message content
- small UI command protocol
- clearer MCP server responsibilities

## 1. Why A Generic Card System

LeoChat should not only support business-specific cards. It should provide a reusable card protocol that can be used by:

- LeoChat built-in MCP tools
- future domain agents
- external MCP servers
- vertical products derived from LeoChat concepts

This is closer to the value of Feishu cards:

- generic schema
- stable rendering primitives
- stateful actions
- business cards as instances of a shared protocol

## 2. Design Principles

### Keep command and content separate

- `ui-command` is for imperative side effects
- `card` is for structured renderable content

Examples:

- `update_theme` is a command
- product summary is a card
- render progress is a card
- open settings is a command

### Chat message is a container, not the protocol

Cards should be treated as first-class message content items, not as text fragments extracted from markdown-like output.

### Generic first, domain second

LeoChat should define generic card building blocks, then domain-specific cards are composed from those blocks.

### Agent actions should be explicit

Buttons, selects, confirmations, retries, approve/reject operations should emit structured events, not rely on text parsing or loose action tags.

## 3. Proposed Architecture

### Layer 1: UI Commands

Used for small imperative UI side effects only.

Examples:

- theme change
- open/close panel
- show notification
- focus input
- navigate to route
- scroll to entity/message

### Layer 2: Card Schema

Used for structured visual content and user-facing workflow nodes.

Examples:

- summary card
- media preview card
- list/detail card
- status/progress card
- review/approval card
- error/retry card
- choice card

### Layer 3: Card Action Runtime

Used to dispatch structured card actions back to the host.

Examples:

- approve
- reject
- retry
- open detail
- copy
- apply suggestion
- choose option
- request confirmation

## 4. Minimal Card Schema

The first version should stay small and composable.

See the detailed spec for the exact discriminated-union version of:

- `LeoCard`
- `LeoCardBlock`
- `LeoCardAction`

## 5. Minimal First-Class Card Types

The first milestone does not need a large component inventory.

### Summary Card

Use for:

- tool result summary
- product summary
- search result summary
- content suggestion summary

### Media Card

Use for:

- generated images
- source/reference images
- before/after comparison
- selectable asset previews

### List Card

Use for:

- ranked options
- candidate titles
- top search results
- generated variants

### Status Card

Use for:

- task progress
- batch execution
- queue state
- long-running agent operations

### Review Card

Use for:

- choose one of several outputs
- approve or reject generated content
- pick cover/title/caption

### Error Card

Use for:

- failed render
- failed fetch
- invalid configuration
- recoverable tool errors

## 6. Rendering Strategy

### Current system to preserve temporarily

- existing text rendering
- existing `<card />` and `<cards>` parser
- existing action tag parser

### New preferred rendering path

- tool/server returns structured card payload
- payload becomes a `message.contentItem`
- renderer renders card directly
- action runtime handles click/confirm/select interactions

### Compatibility strategy

- keep parser-based cards for backward compatibility
- mark parser-based card flow as deprecated
- all new built-in card features should use schema-based cards first

## 7. Card Actions vs UI Commands

### Should remain UI commands

- `update_theme`
- `show_notification`
- `open_panel`
- `close_panel`
- `copy_to_clipboard`
- `open_url`
- `set_input`
- `scroll_to_message`

These are small, imperative, host-level controls.

### Should become card actions or card content

- `render_cards`
- result selection flows
- approval/review flows
- generated image preview flows
- content comparison flows

These are content/workflow interactions, not UI side effects.

## 8. leochat-mcp Evolution

The built-in MCP server should become smaller and more intentional.

`generate_waifu` has been updated to return LeoCard JSON format (kind: "media"), serving as a built-in card demo.

## 9. Keep In leochat-mcp

### Keep

- `update_theme`
- `show_notification`
- `open_panel`
- `close_panel`
- `copy_to_clipboard`
- `open_url`
- `set_input`
- `generate_waifu` (updated to LeoCard format, serves as card demo)

These are valid built-in desktop/chat host capabilities.

### Keep but reconsider scope

- `show_confirm`
- `scroll_to_message`

Keep only if they are still useful as host-level utility tools. They should not become a substitute for card-level interaction design.

## 10. Independent MCP Servers Using LeoCard

Domain-specific interactive tools have been extracted into standalone MCP servers under `mcp-servers/`:

### pokemon-quiz

**路径**: `mcp-servers/pokemon-quiz/`

猜宝可梦互动问答游戏，展示 LeoCard 交互式卡片的完整能力。

**工具**:
- `pokemon_start` — 开始新游戏（支持 zh/en/ja，easy/normal/hard 难度）
- `pokemon_answer` — 提交答案
- `pokemon_next` — 下一题

**卡片特性**:
- kind: "quiz" (自定义 kind，fallback 为 summary 样式)
- 使用 image、fields、progress、badge 等 block
- 按钮通过 `ui-command: send_message` 驱动游戏循环
- `llmInstruction` 防止 LLM 自问自答

**连接方式**: `node mcp-servers/pokemon-quiz/dist/index.js`

### ecommerce

**路径**: `mcp-servers/ecommerce/`

电商业务卡片演示，展示完整购物流程的结构化卡片。

**工具**:
- `product_search` — 搜索商品（关键词/分类/排序）
- `product_detail` — 商品详情
- `cart_add` / `cart_view` / `cart_remove` — 购物车管理
- `order_place` — 下单（购物车结算或直接购买）
- `order_pay` — 模拟付款
- `order_status` — 订单物流追踪

**卡片特性**:
- 多种 kind: list (搜索结果), summary (商品详情/购物车), status (订单追踪)
- 使用全部 block 类型: text, fields, image, progress, badge, divider
- 全部 tone: default, info, success, warning, error
- 按钮驱动完整购物流程: 搜索 → 详情 → 加购 → 结算 → 付款 → 物流
- 内置 8 件 mock 商品（电子产品/家电/家居/图书）

**连接方式**: `node mcp-servers/ecommerce/dist/index.js`

## 11. Do Not Expand leochat-mcp Into A General UI DSL Server

This is a key constraint.

`leochat-mcp` should not become a giant “control the whole frontend” surface.

That path leads to:

- weak boundaries
- protocol sprawl
- fragile UX contracts
- hard-to-maintain built-in tools

The built-in MCP server should stay focused on:

- host-level commands
- a few carefully chosen desktop/UI affordances
- card/action examples only when they validate the generic schema

## 12. What Should Replace render_cards

Instead of enabling `render_cards` as another command, LeoChat should introduce a structured content return format.

Preferred direction:

```json
{
  "content": [
    {
      "type": "leochat-card",
      "card": {
        "id": "card_1",
        "type": "summary",
        "title": "Generated Variants",
        "body": [
          {
            "type": "fields",
            "fields": [
              { "label": "Count", "value": "3" }
            ]
          }
        ],
        "actions": [
          {
            "id": "apply_1",
            "label": "Apply",
            "action": {
              "type": "agent-event",
              "name": "apply_variant",
              "payload": { "variantId": "v1" }
            }
          }
        ]
      }
    }
  ]
}
```

The host should detect this content type and render it directly.

## 13. Implementation Status

### ✅ Already Implemented

1. ~~Freeze the current built-in tool set~~ — done
2. ~~Declare parser-based cards deprecated for new built-in features~~ — done
3. ~~Introduce first-class card content item type~~ — `leo-card` in `ContentItemType`
4. ~~Build card renderer for the minimal schema~~ — `LeoCardView` in `packages/ui`
5. ~~Add card action dispatch runtime~~ — `card-actions.ts`, `card-events.ts`
6. ~~Move demo tools out of `leochat-mcp`~~ — pokemon-quiz, ecommerce 已独立
7. ~~Narrow `leochat-mcp` to host commands and protocol examples~~ — 保留 host 命令 + waifu 作为 card demo

### Key infrastructure

- **`send_message` ui-command**: 卡片按钮可通过此命令向 LLM 发送消息，实现卡片→对话的交互循环
- **Card detection pipeline**: toolresult → JSON parse → MCP envelope extraction → `normalizeLeoCard` → append contentItem
- **`ChatMessage` (UI package)**: 支持 `leo-card` content item 渲染，通过 `onCardAction` prop 传递 action

### Interactive card pattern

```
用户请求 → LLM 调用 MCP tool → tool 返回 LeoCard JSON
→ 卡片渲染 + 按钮显示 → 用户点击按钮
→ send_message ui-command → LLM 收到文本 → 调用下一个 tool
→ 循环...
```

## 14. End State

Current LeoChat architecture:

- `leochat-mcp` = host command server + card demo (waifu)
- `mcp-servers/*` = domain-specific interactive card servers (pokemon-quiz, ecommerce)
- `ui-commands` = imperative host UI controls + `send_message` for card interaction
- `card schema` = generic structured content protocol (`LeoCard` types in shared)
- `card renderer` = `LeoCardView` + block renderers in UI package
- `card action runtime` = `card-actions.ts` dispatching ui-command / agent-event / link

This preserves the useful part of the current system while making cards a real platform capability instead of a text-rendering trick.
