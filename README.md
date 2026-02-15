# LeoChat

AI Chat Application with Model Context Protocol (MCP) support.

## Features

- **Multi-Provider LLM**: DeepSeek, OpenRouter, OpenAI — configurable via UI or environment variables
- **MCP Integration**: Connect to multiple MCP servers via Stdio and Streamable HTTP transports
- **Built-in MCP Servers**: LeoChat (UI control), Filesystem, Memory, Fetch, Excel, Everything
- **Dual-Mode**: Web app + Electron desktop application
- **Streaming UI**: Real-time streaming responses with tool call status tracking
- **Dynamic Themes**: 6 theme presets (3 light + 3 dark) with CSS variable system
- **Generative UI**: Markdown, code blocks, Mermaid diagrams, action buttons, card rendering
- **i18n**: Chinese / English / Japanese / German / French / Spanish

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: Vite, React 19, TypeScript, Tailwind CSS v4, Zustand
- **UI Components**: Shadcn UI (Radix primitives)
- **Backend**: Hono + Node.js (SSE streaming)
- **Desktop**: Electron 33
- **Protocol**: Model Context Protocol (MCP)

## Project Structure

```
LeoChat/
├── apps/
│   ├── web/                # Vite + React frontend
│   └── electron/           # Electron main & preload
├── packages/
│   ├── server/             # Node.js backend (Hono + SSE)
│   ├── ui/                 # Shared component library
│   ├── mcp-core/           # MCP Client & tool dispatcher
│   ├── shared/             # Types & utilities
│   └── leochat-mcp/        # Built-in MCP server (UI control)
├── pnpm-workspace.yaml
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9

### Install

```bash
pnpm install
pnpm build:packages
```

### Environment (optional)

API keys can be configured via the Settings UI. Alternatively, set them in `.env` for backend defaults:

```bash
cp .env.example .env
```

```env
DEEPSEEK_API_KEY=sk-...
OPENROUTER_API_KEY=sk-or-...
OPENAI_API_KEY=sk-...
```

### Development

```bash
# Web (frontend + backend)
pnpm dev

# Electron desktop
pnpm --filter @ai-chatbox/electron dev
```

### Build

```bash
# Build all packages
pnpm build

# Electron — directory (unpacked)
pnpm --filter @ai-chatbox/electron build
pnpm --filter @ai-chatbox/electron run pack

# Electron — installer (NSIS)
pnpm --filter @ai-chatbox/electron run dist
```

## Theme Presets

| Light | Dark |
|-------|------|
| Light | Dark |
| Light Purple | Dark Purple |
| Light Green | Dark Green |

## MCP Servers

Built-in servers auto-connect on startup. Custom servers can be added via the MCP settings page.

| Server | Package | Description |
|--------|---------|-------------|
| LeoChat | built-in | UI control (theme, notifications, panels) |
| Everything | `@modelcontextprotocol/server-everything` | Reference/test server |
| Filesystem | `@modelcontextprotocol/server-filesystem` | File operations |
| Memory | `@modelcontextprotocol/server-memory` | Knowledge graph memory |
| Fetch | `@tokenizin/mcp-npx-fetch` | Web content fetching |
| Excel | `@negokaz/excel-mcp-server` | Excel read/write |

## License

MIT
