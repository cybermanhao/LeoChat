import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { exec } from "child_process";
import { promisify } from "util";
import type { ServerContext } from "../server.js";
import { LLMService, type LLMProvider } from "../services/llm.js";
import { ImageProxyService } from "../services/image-proxy.js";
import type { ChatMessage, MCPServerConfig, ToolCall } from "@ai-chatbox/shared";

const execAsync = promisify(exec);

const MAX_TOOL_RESULT = 3000;

/**
 * Validate image proxy URL to prevent SSRF attacks.
 * Only allows http/https protocols and blocks private/reserved IP ranges.
 */
function isValidProxyUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return false;
    }
    const hostname = url.hostname;
    // Block localhost and loopback
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
      return false;
    }
    // Block private IPv4 ranges
    if (/^(10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|169\.254\.|127\.)/.test(hostname)) {
      return false;
    }
    // Block IPv6 loopback and link-local
    if (/^\[?(::1|fe80:)/i.test(hostname)) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
function truncateResult(s: string): string {
  if (s.length <= MAX_TOOL_RESULT) return s;
  return s.slice(0, Math.floor(MAX_TOOL_RESULT * 0.85)) + `\n\n[内容已截断 - 原长度: ${s.length}]`;
}

async function getToolVersion(commands: string[]): Promise<string | null> {
  for (const cmd of commands) {
    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: 5000 });
      const output = (stdout || stderr).trim();
      if (output) return output;
    } catch {
      // try next command
    }
  }
  return null;
}

export function createRoutes(context: ServerContext) {
  const app = new Hono();
  const llmService = new LLMService();
  const imageProxy = new ImageProxyService();

  // Chat endpoint with streaming - supports full tool loop
  app.post("/chat", async (c) => {
    let body: {
      messages: ChatMessage[];
      model?: string;
      provider?: LLMProvider;
      stream?: boolean;
      maxToolRounds?: number;
    };
    try {
      body = await c.req.json<typeof body>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { messages: inputMessages, model, provider, stream = true, maxToolRounds } = body;

    // Validate messages array
    if (!Array.isArray(inputMessages) || inputMessages.length === 0) {
      return c.json({ error: "messages must be a non-empty array" }, 400);
    }
    if (inputMessages.length > 500) {
      return c.json({ error: "messages array too large (max 500)" }, 400);
    }

    // Get available tools from MCP
    const tools = context.sessionManager.getToolsForLLM();

    if (!stream) {
      // Non-streaming response
      try {
        const response = await llmService.chat({
          messages: inputMessages,
          model,
          provider,
          tools: tools.length > 0 ? tools : undefined,
        });
        return c.json(response);
      } catch (error) {
        console.error("[LLM Error]", error);
        return c.json({ error: "LLM request failed" }, 502);
      }
    }

    // Streaming response with full tool loop
    const MAX_TOOL_ROUNDS = Math.min(Math.max(maxToolRounds ?? 10, 1), 50);

    return streamSSE(c, async (stream) => {
      // Abort detection: when the client disconnects, stop writing and cancel LLM stream
      const abortController = new AbortController();
      let aborted = false;
      stream.onAbort(() => {
        aborted = true;
        abortController.abort();
      });

      // Safe write helper: swallows errors after abort so we don't double-throw
      async function safeWrite(event: string, data: string): Promise<void> {
        if (aborted) return;
        try {
          await stream.writeSSE({ event, data });
        } catch {
          aborted = true;
        }
      }

      // Internal message history for tool loop
      let internalMessages = [...inputMessages];
      let toolRound = 0;

      try {
        while (toolRound < MAX_TOOL_ROUNDS && !aborted) {
          let currentToolCalls: ToolCall[] = [];
          let hasToolCalls = false;
          let completedMessage: ChatMessage | null = null;

          await llmService.streamChat(
            {
              messages: internalMessages,
              model,
              provider,
              tools: tools.length > 0 ? tools : undefined,
            },
            {
              onChunk: async (chunk) => {
                await safeWrite("chunk", JSON.stringify({ ...chunk, index: Date.now() }));
              },
              onToolCall: async (toolCall) => {
                if (aborted) return;
                hasToolCalls = true;
                currentToolCalls.push(toolCall);

                await safeWrite("tool_call", JSON.stringify(toolCall));

                // Execute tool
                try {
                  const rawResult = await context.sessionManager.callTool(
                    toolCall.name,
                    toolCall.arguments as Record<string, unknown>
                  );
                  // Truncate at source — prevents large SSE payloads and oversized final event
                  const rawStr = typeof rawResult === "string"
                    ? rawResult
                    : JSON.stringify(rawResult);
                  const truncated = truncateResult(rawStr);

                  await safeWrite("tool_result", JSON.stringify({ id: toolCall.id, result: truncated }));

                  toolCall.status = "completed";
                  toolCall.result = truncated;
                } catch (error) {
                  console.error("[Tool Error]", error);
                  await safeWrite("tool_error", JSON.stringify({ id: toolCall.id, error: "Tool execution failed" }));
                  toolCall.status = "error";
                  toolCall.result = { error: "Tool execution failed" };
                }
              },
              onComplete: async (message) => {
                completedMessage = message;
                if (!hasToolCalls) {
                  await safeWrite("complete", JSON.stringify(message));
                }
              },
              onError: async (error) => {
                await safeWrite("error", JSON.stringify({ error: error.message }));
              },
            },
            { signal: abortController.signal }
          );

          // If no tool calls, we're done
          if (!hasToolCalls || aborted) {
            break;
          }

          // Build assistant message for history.
          // Strip result/status from tool_calls — they don't belong in the assistant
          // message per OpenAI spec, and keeping them was the main source of the
          // oversized final SSE event.
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}-${toolRound}`,
            role: "assistant",
            content: (completedMessage as ChatMessage | null)?.content || "",
            tool_calls: currentToolCalls.map(({ id, name, arguments: args }) => ({
              id,
              name,
              arguments: args,
              status: "completed" as const,
            })),
            timestamp: Date.now(),
          };
          internalMessages.push(assistantMessage);

          // Add tool result messages to history (already truncated above)
          for (const toolCall of currentToolCalls) {
            const rawContent = typeof toolCall.result === "string"
              ? toolCall.result
              : JSON.stringify(toolCall.result);
            const toolResultMessage: ChatMessage = {
              id: `tool-${toolCall.id}`,
              role: "tool",
              content: truncateResult(rawContent),
              tool_call_id: toolCall.id,
              timestamp: Date.now(),
            };
            internalMessages.push(toolResultMessage);
          }

          toolRound++;
        }

        // Send final event with complete message history (only when tool calls happened)
        if (!aborted && toolRound > 0) {
          await safeWrite("final", JSON.stringify({ toolRounds: toolRound, internalMessages }));
        }
      } catch (error) {
        await safeWrite("error", JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
        }));
      }
    });
  });

  // Get available LLM providers
  app.get("/llm/providers", (c) => {
    return c.json({
      providers: llmService.getAvailableProviders(),
    });
  });

  // Get LLM config (which providers are configured via env vars)
  app.get("/llm/config", (c) => {
    const availableProviders = llmService.getAvailableProviders();
    const defaultProvider = llmService.getDefaultProvider();
    return c.json({
      availableProviders,
      defaultProvider,
      // 告诉前端后端已经配置了 API keys，前端可以使用后端代理模式
      backendConfigured: availableProviders.length > 0,
    });
  });

  // Set LLM API key from frontend UI
  app.post("/llm/config", async (c) => {
    let body: { provider: LLMProvider; apiKey: string };
    try {
      body = await c.req.json<typeof body>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const { provider, apiKey } = body;
    const validProviders: LLMProvider[] = ["deepseek", "openrouter", "openai", "moonshot"];
    if (!provider || !validProviders.includes(provider)) {
      return c.json({ error: "provider must be one of: " + validProviders.join(", ") }, 400);
    }
    if (!apiKey || typeof apiKey !== "string") {
      return c.json({ error: "apiKey is required" }, 400);
    }
    if (apiKey.length > 2048) {
      return c.json({ error: "apiKey too long (max 2048 chars)" }, 400);
    }
    llmService.setApiKey(provider, apiKey);
    return c.json({
      success: true,
      availableProviders: llmService.getAvailableProviders(),
      defaultProvider: llmService.getDefaultProvider(),
    });
  });

  // MCP server management
  app.post("/mcp/servers", async (c) => {
    let config: MCPServerConfig;
    try {
      config = await c.req.json<MCPServerConfig>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    context.sessionManager.addServer(config);
    return c.json({ success: true, serverId: config.id });
  });

  app.delete("/mcp/servers/:id", async (c) => {
    const serverId = c.req.param("id");
    await context.sessionManager.removeServer(serverId);
    return c.json({ success: true });
  });

  app.post("/mcp/servers/:id/connect", async (c) => {
    const serverId = c.req.param("id");
    const session = await context.sessionManager.connect(serverId);
    return c.json(session);
  });

  app.post("/mcp/servers/:id/disconnect", async (c) => {
    const serverId = c.req.param("id");
    await context.sessionManager.disconnect(serverId);
    return c.json({ success: true });
  });

  app.get("/mcp/sessions", (c) => {
    return c.json(context.sessionManager.getSessions());
  });

  app.get("/mcp/tools", (c) => {
    return c.json(context.sessionManager.getAllTools());
  });

  // Get all server configs
  app.get("/mcp/servers", (c) => {
    return c.json(context.sessionManager.getConfigs());
  });

  // Get server details (session + resources + prompts)
  app.get("/mcp/servers/:id/details", async (c) => {
    const serverId = c.req.param("id");
    const session = context.sessionManager.getSession(serverId);
    const config = context.sessionManager.getConfig(serverId);
    const client = context.sessionManager.getClient(serverId);

    if (!config) {
      return c.json({ error: "Server not found" }, 404);
    }

    let resources: unknown[] = [];
    let prompts: unknown[] = [];

    if (client && session?.status === "connected") {
      try {
        [resources, prompts] = await Promise.all([
          client.listResources(),
          client.listPrompts(),
        ]);
      } catch (error) {
        console.error("Error fetching server details:", error);
      }
    }

    return c.json({
      config,
      session,
      resources,
      prompts,
    });
  });

  // Read a resource
  app.post("/mcp/servers/:id/resources/read", async (c) => {
    const serverId = c.req.param("id");
    let body: { uri: string };
    try {
      body = await c.req.json<typeof body>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const { uri } = body;
    const client = context.sessionManager.getClient(serverId);

    if (!client) {
      return c.json({ error: "Server not connected" }, 400);
    }

    try {
      const content = await client.readResource(uri);
      return c.json(content);
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  });

  // Get a prompt
  app.post("/mcp/servers/:id/prompts/get", async (c) => {
    const serverId = c.req.param("id");
    let body: { name: string; args?: Record<string, string> };
    try {
      body = await c.req.json<typeof body>();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const { name, args } = body;
    const client = context.sessionManager.getClient(serverId);

    if (!client) {
      return c.json({ error: "Server not connected" }, 400);
    }

    try {
      const prompt = await client.getPrompt(name, args);
      return c.json(prompt);
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  });

  // Tool execution
  app.post("/mcp/tools/:name/call", async (c) => {
    try {
      const toolName = c.req.param("name");
      let args: Record<string, unknown>;
      try {
        args = await c.req.json<typeof args>();
      } catch {
        return c.json({ error: "Invalid JSON body" }, 400);
      }

      const result = await context.sessionManager.callTool(toolName, args);
      return c.json({ result });
    } catch (error) {
      console.error("[Tool Error]", error);
      return c.json({ error: "Tool execution failed" }, 500);
    }
  });

  // Environment check (internal diagnostics only)
  app.get("/env/check", async (c) => {
    // Restrict to localhost to prevent information leakage
    const remoteAddr = c.req.header("x-forwarded-for") || "127.0.0.1";
    if (remoteAddr !== "127.0.0.1" && !remoteAddr.startsWith("::ffff:127.0.0.1")) {
      return c.json({ error: "Forbidden" }, 403);
    }

    const tools = [
      { id: "npx",    name: "npx",      commands: ["npx --version"] },
      { id: "node",   name: "Node.js",  commands: ["node --version"] },
      { id: "uvx",    name: "uvx",      commands: ["uvx --version"] },
      { id: "uv",     name: "uv",       commands: ["uv --version"] },
      { id: "python", name: "Python",   commands: ["python --version", "python3 --version"] },
      { id: "bun",    name: "Bun",      commands: ["bun --version"] },
      { id: "mcp",    name: "MCP CLI",  commands: ["mcp version"] },
    ];

    const results = await Promise.all(
      tools.map(async (tool) => {
        const version = await getToolVersion(tool.commands);
        return { id: tool.id, name: tool.name, installed: version !== null, version: version ?? null };
      })
    );
    return c.json(results);
  });

  // Image proxy
  app.get("/proxy/image", async (c) => {
    const url = c.req.query("url");
    if (!url) {
      return c.json({ error: "URL is required" }, 400);
    }
    if (!isValidProxyUrl(url)) {
      return c.json({ error: "Invalid or forbidden URL" }, 400);
    }

    try {
      const metadata = await imageProxy.getMetadata(url);
      return c.json(metadata);
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  });

  app.get("/proxy/image/fetch", async (c) => {
    const url = c.req.query("url");
    if (!url) {
      return c.json({ error: "URL is required" }, 400);
    }
    if (!isValidProxyUrl(url)) {
      return c.json({ error: "Invalid or forbidden URL" }, 400);
    }

    try {
      const imageData = await imageProxy.fetchImage(url);
      return new Response(new Uint8Array(imageData.data), {
        headers: {
          "Content-Type": imageData.contentType,
          "Content-Length": String(imageData.size),
          "Cache-Control": "public, max-age=86400",
        },
      });
    } catch (error) {
      return c.json({
        error: error instanceof Error ? error.message : String(error),
      }, 500);
    }
  });

  return app;
}
