# LeoChat - Agent Development Guide

This document provides essential information for agents working in the LeoChat codebase.

## Project Overview

LeoChat is an AI-Driven Multi-Modal Chatbox with MCP (Model Context Protocol) support. It's a monorepo built with pnpm workspaces containing web, electron, server, and shared packages.

## Project Structure

```
LeoChat/
├── apps/
│   ├── web/              # React frontend (Vite + React 19)
│   │   └── src/
│   │       ├── components/    # UI components
│   │       ├── pages/         # Page components
│   │       ├── stores/        # Zustand stores
│   │       └── lib/           # Utilities
│   └── electron/         # Electron desktop app
├── packages/
│   ├── shared/          # Shared types and utilities
│   ├── ui/             # UI component library (Radix + Tailwind)
│   ├── mcp-core/       # MCP protocol implementation
│   ├── server/         # Backend API (Hono)
│   └── leochat-mcp/    # Built-in MCP server
├── mcp-servers/        # External MCP servers (e.g., excel-mcp-server)
└── docs/               # Documentation
```

## Essential Commands

### Development
```bash
pnpm dev              # Build packages, then run web + server in parallel
pnpm dev:web         # Frontend only (port 5173)
pnpm dev:server      # Backend only (port 3001)
pnpm dev:electron    # Electron desktop app
```

### Building
```bash
pnpm build            # Build all packages
pnpm build:web       # Build frontend
pnpm build:electron  # Build Electron app
pnpm build:packages  # Build shared/ui/mcp-core packages
```

### Type Checking
```bash
pnpm typecheck       # Check all packages
```

### Other
```bash
pnpm clean           # Clean all dist folders
```

## Technology Stack

- **Frontend**: React 19, Vite 6, Tailwind CSS 4
- **UI Components**: Radix UI primitives, lucide-react icons
- **State Management**: Zustand with persist middleware
- **Backend**: Hono (Node.js framework)
- **MCP**: @modelcontextprotocol/sdk
- **Build**: tsup (for packages), Vite (for web)

## Key Patterns

### 1. Theme System

The project uses a CSS variable-based theme system with 6 presets:
- Light, Light Purple, Light Green
- Dark, Dark Purple, Dark Green

**DO:**
```tsx
bg-background  // Main page background
bg-card        // Cards, drawers, dropdowns
bg-muted       // Secondary areas
text-foreground
text-muted-foreground
border-border
```

**DON'T:**
```tsx
bg-blue-500    // Hardcoded colors
bg-gray-900
text-white
```

### 2. Zustand Stores

All global state uses Zustand with persist middleware:

```tsx
export const useMyStore = create<MyState>()(
  persist(
    (set, get) => ({
      value: "",
      setValue: (value) => set({ value }),
    }),
    {
      name: "leochat-my-storage",
      partialize: (state) => ({ value: state.value }),
    }
  )
);
```

**Critical:** Select state directly, not via methods:
```tsx
// ✅ Reactive
const disabledToolIds = useMCPStore((s) => s.disabledToolIds);

// ❌ Not reactive
const isEnabled = useMCPStore((s) => s.isToolEnabled);
```

### 3. UI Components

Components live in `packages/ui/src/components/`:
- File names: kebab-case (`chat-message.tsx`)
- Component names: PascalCase (`ChatMessage`)
- Use `cn()` from `lib/utils` to merge classNames
- Use `forwardRef` for components that need ref forwarding
- Export from `packages/ui/src/index.ts`

### 4. Backend API (Hono)

Routes are defined in `packages/server/src/routes/index.ts`:
```ts
app.get("/api/endpoint", (c) => {
  return c.json({ data: "response" });
});

app.post("/api/endpoint", async (c) => {
  const body = await c.req.json();
  return c.json({ success: true });
});
```

SSE streaming is supported - see `/api/chat` endpoint for reference.

### 5. MCP Integration

MCP servers are configured in `apps/web/src/stores/mcp.ts`:
- Built-in servers use official MCP packages
- Custom servers can be added via UI
- Server config format: `{ id, name, transport, command, args, env, url }`

### 6. Component Layout

Use `ThreeColumnLayout` for pages with sidebars:
```tsx
<ThreeColumnLayout
  leftDrawer={<MySidebar />}
  leftDrawerWidth={240}
  defaultCollapsed={false}
>
  {/* Main content */}
</ThreeColumnLayout>
```

### 7. Click Outside to Close

For dropdowns/popovers:
```tsx
const menuRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
      setOpen(false);
    }
  };
  if (open) {
    document.addEventListener("mousedown", handleClickOutside);
  }
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, [open]);
```

## Important Gotchas

1. **Package rebuild required**: After modifying `shared/`, `ui/`, or `mcp-core/` packages, run `pnpm build:packages` or restart `pnpm dev` to see changes.

2. **Theme testing**: Always test new components in all 6 themes, especially Dark Green and Dark Purple which have tinted card backgrounds.

3. **TypeScript types**: Shared types live in `packages/shared/src/types/`. Add new types there for cross-package usage.

4. **Tailwind CSS v4**: This project uses Tailwind v4 - configuration is in CSS files, not `tailwind.config.js`.

5. **Environment variables**: Required for API access - see `.env.example`. Common keys: `DEEPSEEK_API_KEY`, `OPENROUTER_API_KEY`.

6. **Electron build**: Use `pnpm build:electron` - the output goes to `apps/electron/out/`.

7. **Stream truncation**: Tool results over 3000 chars are truncated server-side to prevent large SSE payloads.

8. **MCP server paths**: Built-in servers use relative paths from project root (`../../packages/...`).

## Adding New Features

### Add a new UI component:
1. Create `packages/ui/src/components/my-component.tsx`
2. Export from `packages/ui/src/index.ts`
3. Use theme classes (`bg-card`, `text-foreground`, etc.)
4. Build: `pnpm build:packages`

### Add a new API endpoint:
1. Add route in `packages/server/src/routes/index.ts`
2. Create service if needed in `packages/server/src/services/`
3. Add shared types in `packages/shared/src/types/`
4. Add frontend API method in `apps/web/src/lib/api.ts`

### Add a new store:
1. Create in `apps/web/src/stores/`
2. Use Zustand + persist pattern
3. Export and use in components

## Configuration Files

- Root: `package.json`, `pnpm-workspace.yaml`, `tsconfig.json`
- Web: `apps/web/vite.config.ts`, `apps/web/tsconfig.json`
- UI: `packages/ui/tsup.config.ts`
- Shared: `packages/shared/tsup.config.ts`
- Server: `packages/server/tsup.config.ts`
- Electron: `apps/electron/electron-builder.yml`

## Development Workflow

1. **Start dev server**: `pnpm dev`
2. **Make changes** in appropriate package
3. **If shared/ui/mcp-core**: Run `pnpm build:packages`
4. **Typecheck**: `pnpm typecheck`
5. **Test**: Manual testing in browser

---

For more details on theme system and component patterns, see `CLAUDE.md`.
