import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { ServerContext } from "../server.js";
import { LLMService, type LLMProvider } from "../services/llm.js";
import { ImageProxyService } from "../services/image-proxy.js";
import type { ChatMessage, MCPServerConfig } from "@ai-chatbox/shared";

export function createRoutes(context: ServerContext) {
  const app = new Hono();
  const llmService = new LLMService();
  const imageProxy = new ImageProxyService();

  // Chat endpoint with streaming
  app.post("/chat", async (c) => {
    const body = await c.req.json<{
      messages: ChatMessage[];
      model?: string;
      provider?: LLMProvider;
      stream?: boolean;
    }>();

    const { messages, model, provider, stream = true } = body;

    // Get available tools from MCP
    const tools = context.sessionManager.getToolsForLLM();

    if (!stream) {
      // Non-streaming response
      const response = await llmService.chat({
        messages,
        model,
        provider,
        tools: tools.length > 0 ? tools : undefined,
      });
      return c.json(response);
    }

    // Streaming response using SSE
    return streamSSE(c, async (stream) => {
      try {
        await llmService.streamChat(
          {
            messages,
            model,
            provider,
            tools: tools.length > 0 ? tools : undefined,
          },
          {
            onChunk: async (chunk) => {
              await stream.writeSSE({
                event: "chunk",
                data: JSON.stringify(chunk),
              });
            },
            onToolCall: async (toolCall) => {
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
              } catch (error) {
                await stream.writeSSE({
                  event: "tool_error",
                  data: JSON.stringify({
                    id: toolCall.id,
                    error: error instanceof Error ? error.message : String(error),
                  }),
                });
              }
            },
            onComplete: async (message) => {
              await stream.writeSSE({
                event: "complete",
                data: JSON.stringify(message),
              });
            },
            onError: async (error) => {
              await stream.writeSSE({
                event: "error",
                data: JSON.stringify({ error: error.message }),
              });
            },
          }
        );
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

  // Tool execution
  app.post("/mcp/tools/:name/call", async (c) => {
    const toolName = c.req.param("name");
    const args = await c.req.json<Record<string, unknown>>();

    const result = await context.sessionManager.callTool(toolName, args);
    return c.json({ result });
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
