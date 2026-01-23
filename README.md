# AI Chatbox MCP

AI-Driven Multi-Modal Chatbox with Model Context Protocol (MCP) support.

## Features

- **Dual-Mode Architecture**: Works as both Web app and Electron desktop application
- **MCP Integration**: Connect to MCP servers via Streamable HTTP (SSE) and Stdio transports
- **Streaming UI**: Real-time streaming responses with skeleton placeholders
- **Dynamic Themes**: CSS variable-based theming with multiple presets
- **Generative UI**: Parse and render Markdown, code blocks, Mermaid diagrams, tables
- **Action Buttons**: Support for custom action tags in AI responses

## Tech Stack

- **Monorepo**: pnpm workspaces
- **Frontend**: Vite, React 19, TypeScript, Tailwind CSS v4
- **UI Components**: Shadcn UI (CSS variable customization)
- **Runtime**: Electron (desktop) + Node.js (web backend)
- **Protocol**: Model Context Protocol (MCP)
- **LLM**: OpenRouter API (streaming support)

## Project Structure

```
/
├── apps/
│   ├── web/                # Vite + React frontend
│   └── electron/           # Electron main & preload
├── packages/
│   ├── server/             # Node.js backend (Hono + SSE)
│   ├── ui/                 # Shared component library
│   ├── mcp-core/           # MCP Client & tool dispatcher
│   └── shared/             # Types & utilities
├── pnpm-workspace.yaml
└── package.json
```

## Getting Started

### Prerequisites

- Node.js >= 20.0.0
- pnpm >= 9.0.0

### Installation

```bash
# Install dependencies
pnpm install

# Build packages
pnpm build
```

### Environment Setup

```bash
# Copy environment example
cp .env.example .env

# Edit .env and add your OpenRouter API key
```

### Development

```bash
# Start web development (frontend + server)
pnpm dev:web
pnpm dev:server

# Or start Electron development
pnpm dev:electron
```

### Build

```bash
# Build all packages
pnpm build

# Build specific app
pnpm build:web
pnpm build:electron
```

## Theme Presets

Available theme presets:
- `light` - Default light theme
- `dark` - Default dark theme
- `light-purple` - Light background + purple accent
- `dark-green` - Dark background + green accent
- `dark-purple` - Dark background + purple accent
- `light-green` - Light background + green accent

## MCP Integration

The app supports connecting to MCP servers via:
- **Streamable HTTP (SSE)**: Remote MCP servers
- **Stdio**: Local process-based MCP servers

### Connecting to MCP Servers

```typescript
// Via API
await fetch('/api/mcp/servers', {
  method: 'POST',
  body: JSON.stringify({
    id: 'my-server',
    name: 'My MCP Server',
    transport: 'streamable-http',
    url: 'http://localhost:8080/mcp'
  })
});

await fetch('/api/mcp/servers/my-server/connect', { method: 'POST' });
```

## License

MIT
