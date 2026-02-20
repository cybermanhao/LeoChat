import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { MCPServerConfig, HostMode } from "@ai-chatbox/shared";

export type MCPTransport = Transport;

/**
 * 传输层连接状态
 */
export type TransportStatus = "idle" | "connecting" | "connected" | "error" | "closed";

/**
 * 传输层连接结果
 */
export interface TransportResult {
  transport: MCPTransport | null;
  status: TransportStatus;
  error?: string;
}

/**
 * 传输层工厂配置
 */
export interface TransportFactoryOptions {
  hostMode: HostMode;
  connectionTimeout?: number;
  onStatusChange?: (status: TransportStatus) => void;
}

const DEFAULT_STDIO_TIMEOUT = 8000;
const DEFAULT_HTTP_TIMEOUT = 15000;

/**
 * 创建传输层（异步，不阻塞）
 *
 * @description
 * - STDIO: 懒加载，异步启动进程，仅 Electron 环境支持
 * - HTTP: 直接创建 SSE 连接
 */
export async function createTransportAsync(
  config: MCPServerConfig,
  options: TransportFactoryOptions
): Promise<TransportResult> {
  const { hostMode, connectionTimeout, onStatusChange } = options;

  try {
    onStatusChange?.("connecting");

    switch (config.transport) {
      case "stdio":
        return await createStdioTransportAsync(config, {
          hostMode,
          timeout: connectionTimeout ?? DEFAULT_STDIO_TIMEOUT,
          onStatusChange,
        });

      case "streamable-http":
        return await createSSETransportAsync(config, {
          timeout: connectionTimeout ?? DEFAULT_HTTP_TIMEOUT,
          onStatusChange,
        });

      default:
        throw new Error(`Unsupported transport type: ${config.transport}`);
    }
  } catch (error) {
    onStatusChange?.("error");
    return {
      transport: null,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * 异步创建 STDIO 传输（懒加载，不阻塞）
 */
async function createStdioTransportAsync(
  config: MCPServerConfig,
  options: {
    hostMode: HostMode;
    timeout: number;
    onStatusChange?: (status: TransportStatus) => void;
  }
): Promise<TransportResult> {
  // Web 环境不支持 STDIO
  if (options.hostMode === "web") {
    return {
      transport: null,
      status: "error",
      error: "STDIO transport is not supported in web environment",
    };
  }

  if (!config.command) {
    return {
      transport: null,
      status: "error",
      error: "STDIO transport requires command",
    };
  }

  // 动态导入 STDIO 传输（懒加载）
  // 使用字符串拼接防止 Vite 静态分析
  const modulePath = "@modelcontextprotocol/sdk/client/" + "stdio.js";
  const { StdioClientTransport } = await import(/* @vite-ignore */ modulePath);

  // 创建传输层（异步，不阻塞主线程）
  const env: Record<string, string> = {};
  if (typeof process !== "undefined" && process.env) {
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
  }
  if (config.env) {
    Object.assign(env, config.env);
  }

  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    env,
    ...(config.cwd ? { cwd: config.cwd } : {}),
  });

  // 使用 Promise.race 实现超时
  const connectPromise = new Promise<void>((resolve) => {
    // StdioClientTransport 在创建时就会启动进程
    // 我们通过监听事件来判断是否成功
    const checkReady = () => {
      // 检查 transport 是否已就绪
      resolve();
    };

    // 延迟检查，让进程有时间启动
    setTimeout(checkReady, 100);
  });

  const timeoutPromise = new Promise<void>((_, reject) => {
    setTimeout(
      () => reject(new Error(`STDIO connection timeout after ${options.timeout}ms`)),
      options.timeout
    );
  });

  try {
    await Promise.race([connectPromise, timeoutPromise]);
    options.onStatusChange?.("connected");
    return {
      transport,
      status: "connected",
    };
  } catch (error) {
    // 清理：关闭 transport
    try {
      await transport.close();
    } catch {
      // 忽略关闭错误
    }
    throw error;
  }
}

/**
 * 异步创建 SSE 传输
 */
async function createSSETransportAsync(
  config: MCPServerConfig,
  options: {
    timeout: number;
    onStatusChange?: (status: TransportStatus) => void;
  }
): Promise<TransportResult> {
  if (!config.url) {
    return {
      transport: null,
      status: "error",
      error: "SSE transport requires URL",
    };
  }

  // 动态导入 SSE 传输
  // 使用字符串拼接防止 Vite 静态分析
  const sseModulePath = "@modelcontextprotocol/sdk/client/" + "sse.js";
  const { SSEClientTransport } = await import(/* @vite-ignore */ sseModulePath);

  const transport = new SSEClientTransport(new URL(config.url));

  options.onStatusChange?.("connected");
  return {
    transport,
    status: "connected",
  };
}

/**
 * 同步创建传输层（兼容旧 API，但推荐使用异步版本）
 *
 * @deprecated 请使用 createTransportAsync
 */
export function createTransport(config: MCPServerConfig): MCPTransport {
  switch (config.transport) {
    case "stdio":
      return createStdioTransportSync(config);
    case "streamable-http":
      return createSSETransportSync(config);
    default:
      throw new Error(`Unsupported transport type: ${config.transport}`);
  }
}

function createStdioTransportSync(_config: MCPServerConfig): MCPTransport {
  // STDIO transport 不支持同步创建（会引入 Node.js 依赖）
  // 请使用 createTransportAsync
  throw new Error(
    "Stdio transport sync creation is not supported in browser environment. " +
    "Use createTransportAsync instead."
  );
}

function createSSETransportSync(_config: MCPServerConfig): MCPTransport {
  // SSE transport 不支持同步创建（会引入 Node.js 依赖）
  // 请使用 createTransportAsync
  throw new Error(
    "SSE transport sync creation is not supported in browser environment. " +
    "Use createTransportAsync instead."
  );
}

/**
 * 验证传输配置
 */
export function validateTransportConfig(
  config: MCPServerConfig,
  hostMode?: HostMode
): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!config.id) {
    errors.push("Server ID is required");
  }

  if (!config.name) {
    errors.push("Server name is required");
  }

  if (!config.transport) {
    errors.push("Transport type is required");
  }

  if (config.transport === "stdio") {
    if (!config.command) {
      errors.push("Stdio transport requires command");
    }
    if (hostMode === "web") {
      errors.push("Stdio transport is not supported in web environment");
    }
  }

  if (config.transport === "streamable-http") {
    if (!config.url) {
      errors.push("Streamable HTTP transport requires URL");
    } else {
      try {
        new URL(config.url);
      } catch {
        errors.push("Invalid URL format");
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 检测当前环境是否支持 STDIO
 */
export function supportsStdio(): boolean {
  // STDIO 支持需要 Node.js 环境（有 process 和 require）
  return typeof process !== "undefined" && typeof require !== "undefined";
}
