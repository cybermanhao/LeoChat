/**
 * 本地 stdio MCP server → core 的 ToolSource（Node 专属，所以不放在 mcp-kit 里）。
 * 每次 run 启动一个子进程，run 结束时（ToolSource.release）关闭。
 */
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import { mcpToolsFromTransport } from "@leochat/mcp-kit";
import type { ToolSource } from "@leochat/core";

export interface StdioMcpOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  /** 给工具名加前缀，避免多个 server 重名 */
  prefix?: string;
  /** 子进程的 stderr：默认 "inherit"（打印到当前进程）；"ignore" 静默 */
  stderr?: "inherit" | "ignore" | "pipe";
}

export function stdioMcpTools<Ctx = unknown>(opts: StdioMcpOptions): ToolSource<Ctx> {
  return mcpToolsFromTransport<Ctx>({
    ...(opts.prefix !== undefined ? { prefix: opts.prefix } : {}),
    createTransport: () =>
      new StdioClientTransport({
        command: opts.command,
        ...(opts.args ? { args: opts.args } : {}),
        ...(opts.env ? { env: opts.env } : {}),
        ...(opts.cwd ? { cwd: opts.cwd } : {}),
        stderr: opts.stderr ?? "inherit",
      }),
  });
}
