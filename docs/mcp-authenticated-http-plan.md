# Authenticated `streamable-http` MCP servers — findings + implementation plan

**Status:** proposal / not started. No code changed by this doc.

## Why this came up

While prepping for a job interview (Front, Integrations team — third-party API / OAuth / webhook territory), the question was: "can LeoChat connect to an authenticated MCP server, e.g. Gmail?" This doc is the answer, plus a concrete plan if we want to actually build it.

## Current state (verified against the code)

`packages/mcp-core/src/transports.ts` + `client.ts`, and the schema in `packages/shared/src/mcp-schema.ts` / `types/index.ts`.

- **stdio transport already supports "auth"**, just not as a first-class concept — `config.env` is passed straight into the spawned process:
  ```ts
  if (config.env) Object.assign(env, config.env);
  const transport = new StdioClientTransport({ command, args, env, ... });
  ```
  This is enough for the common "local Gmail MCP server that does its own Google OAuth and takes a client id/secret/refresh token as env vars" pattern — **works today, zero code changes needed**. Most personal-use "connect Claude Desktop to Gmail" setups are exactly this shape.

- **`streamable-http` transport has zero auth support:**
  ```ts
  // createStreamableHTTPTransportAsync
  const transport = new StreamableHTTPClientTransport(new URL(config.url));
  ```
  No headers, no bearer token, no OAuth provider. `MCPServerConfigSchema` has no `auth`/`headers`/token fields at all. So a **remote** authenticated MCP endpoint (the more "modern" pattern — a hosted connector requiring OAuth per request, which is what Front-shaped integrations work usually looks like) cannot be reached at all right now.

- **The underlying SDK already has everything needed.** `@modelcontextprotocol/client@2.0.0`'s `StreamableHTTPClientTransportOptions` has a full `authProvider` option accepting either a minimal `AuthProvider` (`{ token(): Promise<string|undefined>, onUnauthorized?(ctx) }` — good enough for a static bearer token / API key) or a complete `OAuthClientProvider` (dynamic client registration, PKCE, token refresh, 403 insufficient-scope step-up re-authorization — the SDK's `auth()` function drives all of that internally; the provider only needs to implement storage hooks and `redirectToAuthorization()`/`redirectUrl`). This is a real gap in *our* integration layer, not a missing capability in the dependency.

## What "supporting OAuth" actually requires from us

The SDK does discovery, PKCE, dynamic registration, and token exchange automatically once given an `OAuthClientProvider`. Our job is narrower than it sounds:

1. **Schema**: add an `auth` field to `MCPServerConfig` (both the zod schema and the plain TS interface), discriminated by type:
   ```ts
   type MCPServerAuth =
     | { type: "none" }
     | { type: "bearer"; token: string }   // static API key, `{ token: async () => token }` as AuthProvider
     | { type: "oauth"; scope?: string };  // full OAuthClientProvider flow
   ```
2. **A `FileOAuthClientProvider`** (new file, e.g. `packages/mcp-core/src/oauth-provider.ts`) implementing `OAuthClientProvider`:
   - Persists `clientInformation`, `tokens`, and `discoveryState` to a small JSON file per server id (so re-connecting doesn't re-trigger the browser).
   - `redirectUrl` = `http://127.0.0.1:<port>/oauth/callback` — a loopback redirect, the standard pattern for installed/desktop apps (same approach `gcloud`, GitHub CLI, etc. use). No custom protocol / deep-link registration needed in Electron.
   - `redirectToAuthorization(url)`: opens the system browser (`shell.openExternal` in Electron; a plain callback in Node/tests) and starts (or reuses) a short-lived local HTTP server to catch the redirect.
   - `clientMetadata`: public client, PKCE, `token_endpoint_auth_method: "none"` (no client secret needed for a desktop app).
3. **Wire `authProvider` into `createStreamableHTTPTransportAsync`** in `transports.ts`, derived from `config.auth` (bearer → trivial `AuthProvider`; oauth → `FileOAuthClientProvider`).
4. **`MCPClient.connectInternal()`** needs one new branch: catch `UnauthorizedError` from the first `client.connect()` attempt, await the OAuth provider's pending-redirect promise (resolves once the local callback server receives `?code=`), call `transport.finishAuth(code)`, then retry `client.connect()` once. This matches the SDK's documented pattern exactly ("after `UnauthorizedError`, redirect the user, then call `finishAuth` before reconnecting") — the host app owns capturing the redirect, the SDK owns everything else.
5. **UI**: surface a "Sign in" state on the server card when `auth.type === "oauth"` and not yet authorized, and an error/retry affordance if the browser flow is abandoned. Not scoped in detail here — small addition once 1–4 work.

## Testing without real Google credentials

Gmail doesn't have a single official public remote MCP server to point at, and setting up a real Google Cloud OAuth app just to validate the *transport* code is overkill. The transport-layer work is generic — it works against any spec-compliant OAuth-protected MCP server — so the plan is to validate it against a **minimal local test authorization server + protected MCP resource**, built with pieces already in the repo's dependency tree:

- `@modelcontextprotocol/server`'s `createMcpHandler(factory)` gives a Web-standard `fetch(request) => Promise<Response>` handler for the actual MCP protocol (tools/list, tools/call, etc.) — explicitly does **no** token verification itself, so the auth check wraps around it.
- A small hand-rolled OAuth 2.1 authorization server (Node `http` only, no framework needed) implementing just what the SDK's client-side `auth()` needs to discover and complete a flow:
  - `GET /.well-known/oauth-protected-resource` (RFC 9728)
  - `GET /.well-known/oauth-authorization-server` (RFC 8414)
  - `POST /register` (RFC 7591 dynamic client registration)
  - `GET /authorize` — auto-approves (it's a test harness, no real login screen) and redirects with a code
  - `POST /token` — validates the PKCE `code_verifier`, issues an opaque bearer token
  - The MCP resource endpoint checks `Authorization: Bearer <token>`, returns 401 + `WWW-Authenticate` with the protected-resource metadata URL when missing/invalid.
- A test script drives the whole loop end-to-end without a real browser: it fetches the `/authorize` URL directly (standing in for the user's browser, since our test server auto-approves) and follows the redirect itself to capture the code, instead of a human clicking through.

This proves the client-side wiring is spec-correct against something that behaves like a real OAuth-protected MCP server, without depending on external services or real credentials. Swapping in a real Gmail-backed remote MCP server later is then just a config change, not a code change.

## Suggested order of work (if/when picked up)

1. Schema (`MCPServerAuth`, zod + TS interface) — small, no behavior change yet.
2. `FileOAuthClientProvider` + bearer `AuthProvider` helper in `mcp-core`.
3. Wire into `transports.ts` (`authProvider` option) and `client.ts` (401 → wait-for-redirect → `finishAuth` → retry).
4. Local test OAuth+MCP harness (as above) + a vitest covering the full loop.
5. UI affordance for "needs sign-in" / triggering the browser flow.

Steps 1–4 are pure `mcp-core`/`shared` work with no UI dependency, so they can be built and tested in isolation before touching any app code.
