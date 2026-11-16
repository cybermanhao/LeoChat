import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { ToolError, normalizeToolContent, defineTool, UI_META_KEY, isToolSource } from '@leochat/core';
import { z } from 'zod';

// src/index.ts
var DATA_META_KEY = "leochat/data";
function toMcpContent(blocks) {
  return blocks.flatMap((b) => {
    if (b.type === "text") return [{ type: "text", text: b.text }];
    if (b.source.kind === "base64") return [{ type: "image", data: b.source.value, mimeType: b.source.mediaType ?? "image/png" }];
    return [{ type: "text", text: `[image: ${b.source.value}]` }];
  });
}
async function resolveTools(tools, app, signal) {
  if (Array.isArray(tools)) return tools;
  if (isToolSource(tools)) return tools.list({ app, signal });
  return [];
}
function exposable(tool, expose) {
  if (!tool.needsApproval) return true;
  if (expose === true) return true;
  return Array.isArray(expose) && expose.includes(tool.name);
}
async function toMcpServer(opts) {
  const server = new McpServer(
    { name: opts.name, version: opts.version },
    {
      ...opts.instructions ? { instructions: opts.instructions } : {},
      capabilities: { tools: { listChanged: false } }
    }
  );
  const tools = await resolveTools(opts.tools, opts.app, new AbortController().signal);
  for (const tool of tools) {
    if (opts.filter && !opts.filter(tool, opts.app)) continue;
    if (!exposable(tool, opts.exposeApprovalTools)) continue;
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.input,
        ...tool.visibility ? { _meta: { ui: { visibility: tool.visibility } } } : {}
      },
      async (args, mcpCtx) => {
        const ctx = {
          runId: "mcp",
          callId: String(mcpCtx.mcpReq.id),
          signal: mcpCtx.mcpReq.signal,
          app: opts.app,
          emit: () => {
          },
          update: () => {
          }
        };
        let out;
        try {
          out = await tool.execute(args, ctx);
        } catch (e) {
          const message = e instanceof ToolError ? e.message : "Tool execution failed";
          if (!(e instanceof ToolError)) console.error(`[mcp-kit] tool ${tool.name} failed`, e);
          return { isError: true, content: [{ type: "text", text: message }] };
        }
        const meta = {};
        if (out.ui !== void 0) meta[UI_META_KEY] = out.ui;
        if (out.data !== void 0) meta[DATA_META_KEY] = out.data;
        return {
          content: toMcpContent(normalizeToolContent(out)),
          ...out.isError ? { isError: true } : {},
          ...Object.keys(meta).length ? { _meta: meta } : {}
        };
      }
    );
  }
  return server;
}
function toMcpHandler(opts) {
  return async (req) => {
    const app = await opts.resolveApp(req);
    if (app === null) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { resolveApp: _r, ...rest } = opts;
    const handler = createMcpHandler(() => toMcpServer({ ...rest, app }), { legacy: "stateless" });
    return handler.fetch(req);
  };
}
function fromMcpResult(r) {
  const content = (r.content ?? []).flatMap((c) => {
    if (c.type === "text") return [{ type: "text", text: c.text ?? "" }];
    if (c.type === "image" && c.data) return [{ type: "image", source: { kind: "base64", value: c.data, ...c.mimeType ? { mediaType: c.mimeType } : {} } }];
    return [{ type: "text", text: `[${c.type} content omitted]` }];
  });
  const ui = r._meta?.[UI_META_KEY];
  const data = r._meta?.[DATA_META_KEY] ?? r.structuredContent;
  return {
    content,
    ...r.isError ? { isError: true } : {},
    ...ui !== void 0 ? { ui } : {},
    ...data !== void 0 ? { data } : {}
  };
}
function mcpToolsFromTransport(opts) {
  const clients = [];
  return {
    async list({ app }) {
      const client = new Client({ name: opts.clientName ?? "leochat-core", version: "0.0.1" });
      await client.connect(await opts.createTransport(app));
      clients.push(client);
      const { tools } = await client.listTools();
      return tools.map((t) => {
        const visibility = t._meta?.ui?.visibility;
        return defineTool({
          name: (opts.prefix ?? "") + t.name,
          description: t.description ?? "",
          // 远程工具：校验交给远端 server，这里只要求参数是对象
          input: z.record(z.string(), z.unknown()),
          jsonSchemaOverride: t.inputSchema,
          ...visibility ? { visibility } : {},
          async execute(input, ctx) {
            const r = await client.callTool({ name: t.name, arguments: input }, { signal: ctx.signal });
            return fromMcpResult(r);
          }
        });
      });
    },
    async release() {
      for (const c of clients.splice(0)) await c.close().catch(() => {
      });
    }
  };
}
function mcpTools(opts) {
  return mcpToolsFromTransport({
    ...opts.prefix !== void 0 ? { prefix: opts.prefix } : {},
    ...opts.clientName !== void 0 ? { clientName: opts.clientName } : {},
    async createTransport(app) {
      const headers = opts.headers ? await opts.headers(app) : {};
      return new StreamableHTTPClientTransport(new URL(opts.url), {
        ...opts.fetch ? { fetch: opts.fetch } : {},
        requestInit: { headers }
      });
    }
  });
}

export { DATA_META_KEY, mcpTools, mcpToolsFromTransport, toMcpHandler, toMcpServer };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map