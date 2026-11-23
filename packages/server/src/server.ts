import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { createSessionManager } from "@ai-chatbox/mcp-core";
import type { ServerStatus } from "@ai-chatbox/shared";
import { createRoutes } from "./routes/index.js";
import { join } from "node:path";
import { attachmentStore, type AttachmentStore } from "./attachments.js";
import { conversationLog, loadAgentInstructions, type ConversationLog, type LoadedInstructions } from "@leochat/node";

export interface ServerContext {
  sessionManager: ReturnType<typeof createSessionManager>;
  startTime: number;
  pendingApprovals: Map<string, (approved: boolean) => void>;
  /** 会话日志（每个会话一份 JSONL，参考 dsh）。异步创建目录，路由里 await */
  conversations: Promise<ConversationLog>;
  /** 定时提醒（/loop）的任务文件；不提供时不启用定时功能（测试） */
  schedulesFile?: string;
  /** 附件存储（<dataDir>/attachments）；不提供时不接受附件 */
  attachments?: AttachmentStore;
  /** 指令文件（dsh 的 agent-instructions；GUI 没有工作目录，只加载全局的 ~/.leochat/AGENTS.md 等）；不提供时不加载（测试） */
  instructions?: () => Promise<LoadedInstructions>;
}

export function createServer(
  externalSessionManager?: ReturnType<typeof createSessionManager>,
  /** 应用数据目录：Electron 传 userData；开发模式默认 ./data。会话日志放在 <dataDir>/conversations */
  dataDir?: string,
) {
  const app = new Hono();

  // Use external session manager if provided (e.g. from Electron), otherwise create one
  const sessionManager = externalSessionManager ?? createSessionManager({
    onSessionChange: (sessions) => {
      console.log("MCP sessions updated:", sessions.length, "connected");
    },
    onError: (serverId, error) => {
      console.error(`MCP error [${serverId}]:`, error.message);
    },
  });

  const root = dataDir ?? process.env.LEOCHAT_DATA_DIR ?? "./data";
  const context: ServerContext = {
    sessionManager,
    startTime: Date.now(),
    pendingApprovals: new Map(),
    conversations: conversationLog(join(root, "conversations")),
    schedulesFile: join(root, "schedules.json"),
    attachments: attachmentStore(join(root, "attachments")),
    // 每一轮读一次：用户改了文件，下一轮就生效
    instructions: () => loadAgentInstructions(),
  };

  // Middleware
  app.use("*", logger());
  app.use(
    "*",
    cors({
      // null covers Electron production (file:// renderer)
      origin: (origin) =>
        !origin ||
        origin === "null" ||
        /^https?:\/\/localhost(:\d+)?$/.test(origin)
          ? origin || "*"
          : null,
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      exposeHeaders: ["Content-Length"],
      maxAge: 86400,
      credentials: true,
    })
  );

  // Global error handler to prevent stack trace leakage
  app.onError((err, c) => {
    console.error("[Server Error]", err);
    return c.json({ error: "Internal Server Error" }, 500);
  });

  // Health check
  app.get("/health", (c) => {
    const sessions = sessionManager.getSessions();
    const status: ServerStatus = {
      isRunning: true,
      mode: "web",
      mcpSessionCount: sessions.length,
      uptime: Date.now() - context.startTime,
    };
    return c.json(status);
  });

  // Mount routes
  const routes = createRoutes(context);
  app.route("/api", routes);

  return app;
}

export function startServer(app: Hono, port: number = 3001): Promise<number> {
  return new Promise((resolve, reject) => {
    console.log(`Starting server on port ${port}...`);
    const httpServer = serve({ fetch: app.fetch, port }, (info) => {
      console.log(`Server running at http://localhost:${info.port}`);
      resolve(info.port);
    });
    httpServer.on("error", reject);
  });
}

export type AppType = ReturnType<typeof createServer>;
