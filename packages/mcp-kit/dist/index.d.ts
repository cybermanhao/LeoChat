import { Transport } from '@modelcontextprotocol/client';
import { McpServer } from '@modelcontextprotocol/server';
import { AnyTool, ToolSource } from '@leochat/core';

/**
 * @leochat/mcp-kit（设计文档 §10）
 * - toMcpServer / toMcpHandler：把 core 的工具暴露成 MCP server（无状态、Web 标准 Request/Response，Workers 可直接用）
 * - mcpTools：把一个 MCP server 当作 core 的 ToolSource
 *
 * 卡片放在工具结果的 _meta["leochat/ui"]，结构化数据放在 _meta["leochat/data"]（D10）；
 * 工具的 visibility 映射到 MCP Apps 的 _meta.ui.visibility。
 */

declare const DATA_META_KEY = "leochat/data";
interface ToMcpServerOptions<Ctx> {
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
/**
 * 把工具注册到一个新的 McpServer。
 * 带 needsApproval 的工具默认不注册（见 exposeApprovalTools）。需要服务端确认的写操作，
 * 请沿用"签名确认令牌"一类的应用层设计（见设计文档 §4.1），再显式暴露。
 */
declare function toMcpServer<Ctx>(opts: ToMcpServerOptions<Ctx>): Promise<McpServer>;
interface ToMcpHandlerOptions<Ctx> extends Omit<ToMcpServerOptions<Ctx>, "app"> {
    /** 认证并解析出按请求的上下文；返回 null 时响应 401。身份只能由服务端确定，不接受调用方自报 */
    resolveApp(req: Request): Promise<Ctx | null> | Ctx | null;
}
/** 无状态的 Streamable HTTP MCP 端点：每个请求按身份构建一个 server 实例 */
declare function toMcpHandler<Ctx>(opts: ToMcpHandlerOptions<Ctx>): (req: Request) => Promise<Response>;
interface McpToolsOptions<Ctx> {
    url: string;
    /** 注入 fetch，例如会展 demo 的进程内垫片：fetch: (u, i) => handler(new Request(u, i)) */
    fetch?: typeof fetch;
    /** 按请求注入 headers（例如 Bearer 令牌） */
    headers?: (app: Ctx) => Record<string, string> | Promise<Record<string, string>>;
    /** 给工具名加前缀，避免多个 server 重名 */
    prefix?: string;
    clientName?: string;
}
interface McpTransportToolsOptions<Ctx> {
    /** 每次 run 建立一个新的传输（HTTP、stdio……）。Node 专属的 stdio 传输由 @leochat/node 提供 */
    createTransport(app: Ctx): Transport | Promise<Transport>;
    /** 给工具名加前缀，避免多个 server 重名 */
    prefix?: string;
    clientName?: string;
}
/** 任意传输的 MCP server → ToolSource。每次 run 建立一个客户端，run 结束时释放 */
declare function mcpToolsFromTransport<Ctx = unknown>(opts: McpTransportToolsOptions<Ctx>): ToolSource<Ctx>;
/** 把一个 Streamable HTTP MCP server 当作 ToolSource。每次 run 建立一个客户端，run 结束时释放 */
declare function mcpTools<Ctx = unknown>(opts: McpToolsOptions<Ctx>): ToolSource<Ctx>;

export { DATA_META_KEY, type McpToolsOptions, type McpTransportToolsOptions, type ToMcpHandlerOptions, type ToMcpServerOptions, mcpTools, mcpToolsFromTransport, toMcpHandler, toMcpServer };
