import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { exec } from "child_process";
import { promisify } from "util";
import type { ServerContext } from "../server.js";
import { LLMService, type LLMProvider } from "../services/llm.js";
import { ImageProxyService } from "../services/image-proxy.js";
import type { ChatMessage, MCPServerConfig, ToolCall } from "@ai-chatbox/shared";

const execAsync = promisify(exec);

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
    const body = await c.req.json<{
      messages: ChatMessage[];
      model?: string;
      provider?: LLMProvider;
      stream?: boolean;
      maxToolRounds?: number;
    }>();

    const { messages: inputMessages, model, provider, stream = true, maxToolRounds } = body;

    // Get available tools from MCP
    const tools = context.sessionManager.getToolsForLLM();

    if (!stream) {
      // Non-streaming response
      const response = await llmService.chat({
        messages: inputMessages,
        model,
        provider,
        tools: tools.length > 0 ? tools : undefined,
      });
      return c.json(response);
    }

    // Streaming response with full tool loop
    const MAX_TOOL_ROUNDS = Math.min(Math.max(maxToolRounds ?? 10, 1), 50);

    return streamSSE(c, async (stream) => {
      // Internal message history for tool loop
      let internalMessages = [...inputMessages];
      let toolRound = 0;

      try {
        while (toolRound < MAX_TOOL_ROUNDS) {
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
                await stream.writeSSE({
                  event: "chunk",
                  data: JSON.stringify({
                    ...chunk,
                    index: Date.now(),
                  }),
                });
              },
              onToolCall: async (toolCall) => {
                hasToolCalls = true;
                currentToolCalls.push(toolCall);

                await stream.writeSSE({
                  event: "tool_call",
                  data: JSON.stringify(toolCall),
                });

                // Execute tool
                try {
                  const result = await context.sessionManager.callTool(
                    toolCall.name,
                    toolCall.arguments as Record<string, unknown>
                  );
                  await stream.writeSSE({
                    event: "tool_result",
                    data: JSON.stringify({
                      id: toolCall.id,
                      result,
                    }),
                  });

                  // Update tool call with result for message history
                  toolCall.status = "completed";
                  toolCall.result = result;
                } catch (error) {
                  const errorMsg = error instanceof Error ? error.message : String(error);
                  await stream.writeSSE({
                    event: "tool_error",
                    data: JSON.stringify({
                      id: toolCall.id,
                      error: errorMsg,
                    }),
                  });

                  // Update tool call with error
                  toolCall.status = "error";
                  toolCall.result = { error: errorMsg };
                }
              },
              onComplete: async (message) => {
                completedMessage = message;
                // Don't send complete event here if we have tool calls
                // We'll send it after the loop finishes
                if (!hasToolCalls) {
                  await stream.writeSSE({
                    event: "complete",
                    data: JSON.stringify(message),
                  });
                }
              },
              onError: async (error) => {
                await stream.writeSSE({
                  event: "error",
                  data: JSON.stringify({ error: error.message }),
                });
              },
            }
          );

          // If no tool calls, we're done
          if (!hasToolCalls) {
            break;
          }

          // Add assistant message with tool calls to history
          // Capture content from the completed message (text before tool calls)
          const assistantMessage: ChatMessage = {
            id: `assistant-${Date.now()}-${toolRound}`,
            role: "assistant",
            content: completedMessage?.content || "",
            tool_calls: currentToolCalls,
            timestamp: Date.now(),
          };
          internalMessages.push(assistantMessage);

          // Add tool result messages to history
          for (const toolCall of currentToolCalls) {
            const toolResultMessage: ChatMessage = {
              id: `tool-${toolCall.id}`,
              role: "tool",
              content: typeof toolCall.result === "string"
                ? toolCall.result
                : JSON.stringify(toolCall.result),
              tool_call_id: toolCall.id,
              timestamp: Date.now(),
            };
            internalMessages.push(toolResultMessage);
          }

          toolRound++;
        }

        // Send final event with complete message history (only when tool calls happened)
        if (toolRound > 0) {
          await stream.writeSSE({
            event: "final",
            data: JSON.stringify({
              toolRounds: toolRound,
              internalMessages,
            }),
          });
        }
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            error: error instanceof Error ? error.message : String(error),
          }),
        });
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
    const { provider, apiKey } = await c.req.json<{ provider: LLMProvider; apiKey: string }>();
    if (!provider || !apiKey) {
      return c.json({ error: "provider and apiKey are required" }, 400);
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
    const config = await c.req.json<MCPServerConfig>();
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
    const { uri } = await c.req.json<{ uri: string }>();
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
    const { name, args } = await c.req.json<{
      name: string;
      args?: Record<string, string>;
    }>();
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
    const toolName = c.req.param("name");
    const args = await c.req.json<Record<string, unknown>>();

    const result = await context.sessionManager.callTool(toolName, args);
    return c.json({ result });
  });

  // Environment check
  app.get("/env/check", async (c) => {
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

    const metadata = await imageProxy.getMetadata(url);
    return c.json(metadata);
  });

  app.get("/proxy/image/fetch", async (c) => {
    const url = c.req.query("url");
    if (!url) {
      return c.json({ error: "URL is required" }, 400);
    }

    const imageData = await imageProxy.fetchImage(url);
    return new Response(new Uint8Array(imageData.data), {
      headers: {
        "Content-Type": imageData.contentType,
        "Content-Length": String(imageData.size),
        "Cache-Control": "public, max-age=86400",
      },
    });
  });

  return app;
}
