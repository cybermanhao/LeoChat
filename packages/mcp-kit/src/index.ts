/**
 * @leochat/mcp-kit（设计文档 §10）
 * - toMcpServer / toMcpHandler：把 core 的工具暴露成 MCP server（无状态、Web 标准 Request/Response，Workers 可直接用）
 * - mcpTools：把一个 MCP server 当作 core 的 ToolSource
 *
 * 卡片放在工具结果的 _meta["leochat/ui"]，结构化数据放在 _meta["leochat/data"]（D10）；
 * 工具的 visibility 映射到 MCP Apps 的 _meta.ui.visibility。
 */
import { Client, StreamableHTTPClientTransport, type Transport } from "@modelcontextprotocol/client";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import {
  ToolError,
  UI_META_KEY,
  defineTool,
  isToolSource,
  normalizeToolContent,
  type AnyTool,
  type ImageBlock,
  type JsonSchema,
  type TextBlock,
  type ToolContext,
  type ToolOutput,
  type ToolSource,
  type ToolVisibility,
  type UiHint,
} from "@leochat/core";
import { z } from "zod";

export const DATA_META_KEY = "leochat/data";

type McpContent =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string };

function toMcpContent(blocks: Array<TextBlock | ImageBlock>): McpContent[] {
  return blocks.flatMap((b): McpContent[] => {
    if (b.type === "text") return [{ type: "text", text: b.text }];
    if (b.source.kind === "base64") return [{ type: "image", data: b.source.value, mimeType: b.source.mediaType ?? "image/png" }];
    return [{ type: "text", text: `[image: ${b.source.value}]` }];
  });
}

async function resolveTools<Ctx>(tools: AnyTool<Ctx>[] | ToolSource<Ctx>, app: Ctx, signal: AbortSignal): Promise<AnyTool<Ctx>[]> {
  if (Array.isArray(tools)) return tools;
  if (isToolSource(tools)) return tools.list({ app, signal });
  return [];
}

export interface ToMcpServerOptions<Ctx> {
  name: string;
  version: string;
  instructions?: string;
  tools: AnyTool<Ctx>[] | ToolSource<Ctx>;
  /** 按请求的上下文（身份、租户、bindings…） */
  app: Ctx;
  /** 按身份过滤：只注册返回 true 的工具，tools/list 因身份而异 */
  filter?: (tool: AnyTool<Ctx>, app: Ctx) => boolean;
  /**
   * 是否暴露设置了 needsApproval 的工具（Q12）。默认**不暴露**：
   * 通过 MCP 交给外部宿主后，是否询问用户由宿主决定，服务端无法强制审批。
   * 传 true 表示全部暴露；传数组表示只暴露列出的工具名（例如自带签名确认令牌的写操作）。
   */
  exposeApprovalTools?: boolean | string[];
}

function exposable<Ctx>(tool: AnyTool<Ctx>, expose: boolean | string[] | undefined): boolean {
  if (!tool.needsApproval) return true;
  if (expose === true) return true;
  return Array.isArray(expose) && expose.includes(tool.name);
}

/**
 * 把工具注册到一个新的 McpServer。
 * 带 needsApproval 的工具默认不注册（见 exposeApprovalTools）。需要服务端确认的写操作，
 * 请沿用"签名确认令牌"一类的应用层设计（见设计文档 §4.1），再显式暴露。
 */
export async function toMcpServer<Ctx>(opts: ToMcpServerOptions<Ctx>): Promise<McpServer> {
  const server = new McpServer(
    { name: opts.name, version: opts.version },
    {
      ...(opts.instructions ? { instructions: opts.instructions } : {}),
      capabilities: { tools: { listChanged: false } },
    },
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
        ...(tool.visibility ? { _meta: { ui: { visibility: tool.visibility } } } : {}),
      },
      async (args: unknown, mcpCtx: { mcpReq: { id: string | number; signal: AbortSignal } }) => {
        const ctx: ToolContext<Ctx> = {
          runId: "mcp",
          callId: String(mcpCtx.mcpReq.id),
          signal: mcpCtx.mcpReq.signal,
          app: opts.app,
          emit: () => {},
          update: () => {},
        };
        let out: ToolOutput;
        try {
          out = await tool.execute(args as never, ctx);
        } catch (e) {
          const message = e instanceof ToolError ? e.message : "Tool execution failed";
          if (!(e instanceof ToolError)) console.error(`[mcp-kit] tool ${tool.name} failed`, e);
          return { isError: true, content: [{ type: "text" as const, text: message }] };
        }
        const meta: Record<string, unknown> = {};
        if (out.ui !== undefined) meta[UI_META_KEY] = out.ui;
        if (out.data !== undefined) meta[DATA_META_KEY] = out.data;
        return {
          content: toMcpContent(normalizeToolContent(out)),
          ...(out.isError ? { isError: true } : {}),
          ...(Object.keys(meta).length ? { _meta: meta } : {}),
        };
      },
    );
  }
  return server;
}

export interface ToMcpHandlerOptions<Ctx> extends Omit<ToMcpServerOptions<Ctx>, "app"> {
  /** 认证并解析出按请求的上下文；返回 null 时响应 401。身份只能由服务端确定，不接受调用方自报 */
  resolveApp(req: Request): Promise<Ctx | null> | Ctx | null;
}

/** 无状态的 Streamable HTTP MCP 端点：每个请求按身份构建一个 server 实例 */
export function toMcpHandler<Ctx>(opts: ToMcpHandlerOptions<Ctx>): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const app = await opts.resolveApp(req);
    if (app === null) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const { resolveApp: _r, ...rest } = opts;
    const handler = createMcpHandler(() => toMcpServer({ ...rest, app }), { legacy: "stateless" });
    return handler.fetch(req);
  };
}

// ── MCP server → ToolSource ──────────────────────────────────────────────

export interface McpToolsOptions<Ctx> {
  url: string;
  /** 注入 fetch，例如会展 demo 的进程内垫片：fetch: (u, i) => handler(new Request(u, i)) */
  fetch?: typeof fetch;
  /** 按请求注入 headers（例如 Bearer 令牌） */
  headers?: (app: Ctx) => Record<string, string> | Promise<Record<string, string>>;
  /** 给工具名加前缀，避免多个 server 重名 */
  prefix?: string;
  clientName?: string;
}

interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  _meta?: Record<string, unknown>;
}

interface McpCallResult {
  content?: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
  structuredContent?: unknown;
  _meta?: Record<string, unknown>;
}

function fromMcpResult(r: McpCallResult): ToolOutput {
  const content: Array<TextBlock | ImageBlock> = (r.content ?? []).flatMap((c): Array<TextBlock | ImageBlock> => {
    if (c.type === "text") return [{ type: "text", text: c.text ?? "" }];
    if (c.type === "image" && c.data) return [{ type: "image", source: { kind: "base64", value: c.data, ...(c.mimeType ? { mediaType: c.mimeType } : {}) } }];
    return [{ type: "text", text: `[${c.type} content omitted]` }];
  });
  const ui = r._meta?.[UI_META_KEY] as UiHint | undefined;
  const data = r._meta?.[DATA_META_KEY] ?? r.structuredContent;
  return {
    content,
    ...(r.isError ? { isError: true } : {}),
    ...(ui !== undefined ? { ui } : {}),
    ...(data !== undefined ? { data } : {}),
  };
}

export interface McpTransportToolsOptions<Ctx> {
  /** 每次 run 建立一个新的传输（HTTP、stdio……）。Node 专属的 stdio 传输由 @leochat/node 提供 */
  createTransport(app: Ctx): Transport | Promise<Transport>;
  /** 给工具名加前缀，避免多个 server 重名 */
  prefix?: string;
  clientName?: string;
}

/** 任意传输的 MCP server → ToolSource。每次 run 建立一个客户端，run 结束时释放 */
export function mcpToolsFromTransport<Ctx = unknown>(opts: McpTransportToolsOptions<Ctx>): ToolSource<Ctx> {
  const clients: Client[] = [];
  return {
    async list({ app }) {
      const client = new Client({ name: opts.clientName ?? "leochat-core", version: "0.0.1" });
      await client.connect(await opts.createTransport(app));
      clients.push(client);
      const { tools } = (await client.listTools()) as { tools: McpToolDef[] };
      return tools.map((t) => {
        const visibility = (t._meta?.ui as { visibility?: ToolVisibility[] } | undefined)?.visibility;
        return defineTool<z.ZodType, Ctx>({
          name: (opts.prefix ?? "") + t.name,
          description: t.description ?? "",
          // 远程工具：校验交给远端 server，这里只要求参数是对象
          input: z.record(z.string(), z.unknown()),
          jsonSchemaOverride: t.inputSchema as JsonSchema,
          ...(visibility ? { visibility } : {}),
          async execute(input, ctx) {
            const r = (await client.callTool({ name: t.name, arguments: input as Record<string, unknown> }, { signal: ctx.signal })) as McpCallResult;
            return fromMcpResult(r);
          },
        });
      });
    },
    async release() {
      for (const c of clients.splice(0)) await c.close().catch(() => {});
    },
  };
}

/** 把一个 Streamable HTTP MCP server 当作 ToolSource。每次 run 建立一个客户端，run 结束时释放 */
export function mcpTools<Ctx = unknown>(opts: McpToolsOptions<Ctx>): ToolSource<Ctx> {
  return mcpToolsFromTransport<Ctx>({
    ...(opts.prefix !== undefined ? { prefix: opts.prefix } : {}),
    ...(opts.clientName !== undefined ? { clientName: opts.clientName } : {}),
    async createTransport(app) {
      const headers = opts.headers ? await opts.headers(app) : {};
      return new StreamableHTTPClientTransport(new URL(opts.url), {
        ...(opts.fetch ? { fetch: opts.fetch } : {}),
        requestInit: { headers },
      });
    },
  });
}
