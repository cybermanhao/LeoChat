import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serve } from "@hono/node-server";
import { createSessionManager } from "@ai-chatbox/mcp-core";
import type { ServerStatus } from "@ai-chatbox/shared";
import { createRoutes } from "./routes/index.js";

export interface ServerContext {
  sessionManager: ReturnType<typeof createSessionManager>;
  startTime: number;
}

export function createServer(externalSessionManager?: ReturnType<typeof createSessionManager>) {
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

  const context: ServerContext = {
    sessionManager,
    startTime: Date.now(),
  };

  // Middleware
  app.use("*", logger());
  app.use(
    "*",
    cors({
      origin: ["http://localhost:5173", "http://localhost:5174", "http://localhost:3000"],
      allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      exposeHeaders: ["Content-Length"],
      maxAge: 86400,
      credentials: true,
    })
  );

  // Health check
  app.get("/health", (c) => {
    const status: ServerStatus = {
      isRunning: true,
      mode: "web",
      mcpSessions: sessionManager.getSessions(),
      uptime: Date.now() - context.startTime,
    };
    return c.json(status);
  });

  // Mount routes
  const routes = createRoutes(context);
  app.route("/api", routes);

  return app;
}

export function startServer(app: Hono, port: number = 3001) {
  console.log(`Starting server on port ${port}...`);

  serve(
    {
      fetch: app.fetch,
      port,
    },
    (info) => {
      console.log(`Server running at http://localhost:${info.port}`);
    }
  );
}

export type AppType = ReturnType<typeof createServer>;
