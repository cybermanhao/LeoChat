/**
 * GUI 迁移第二步：会话与运行接口，直接以 SSE 发送 core 事件（toPublicEvent 之后）。
 * 会话数据是每个会话一份 JSONL 日志（@leochat/node 的 conversationLog，参考 dsh），
 * 运行中的每次 transcript 变化都通过 run({ persist }) 先写盘再继续。
 */
import { Hono, type Context } from "hono";
import { streamSSE } from "hono/streaming";
import { createCompactor, run, stepCount, toPublicEvent, userMessage, type RunHandle } from "@leochat/core";
import type { ConversationLog } from "@leochat/node";
import type { LLMProvider } from "@ai-chatbox/shared";
import type { ServerContext } from "../server.js";
import { legacyProvider, mcpCoreTools, pendingApprovalAnswerer, type LegacyLLM } from "../core-bridge.js";

const MAX_TEXT = 100_000;
const MAX_SYSTEM = 50_000;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

async function readJson<T>(c: { req: { json<U>(): Promise<U> } }): Promise<T | null> {
  try {
    return await c.req.json<T>();
  } catch {
    return null;
  }
}

export function createConversationRoutes(
  context: ServerContext,
  llm: LegacyLLM,
  truncate: (s: string) => string,
  sanitize: (e: unknown) => string,
) {
  const app = new Hono();
  /** 进行中的运行：插话、排队、中止用 */
  const runs = new Map<string, RunHandle>();
  const log = (): Promise<ConversationLog> => context.conversations;

  app.get("/conversations", async (c) => c.json({ conversations: await (await log()).list() }));

  app.post("/conversations", async (c) => {
    const body = (await readJson<{ title?: string }>(c)) ?? {};
    const title = typeof body.title === "string" ? body.title.slice(0, 200) : "";
    return c.json(await (await log()).create(title));
  });

  app.get("/conversations/:id", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    const conv = await (await log()).load(id);
    return conv ? c.json(conv) : c.json({ error: "Not found" }, 404);
  });

  app.patch("/conversations/:id", async (c) => {
    const id = c.req.param("id");
    const body = await readJson<{ title?: string }>(c);
    if (!SAFE_ID.test(id) || !body || typeof body.title !== "string") return c.json({ error: "Invalid request" }, 400);
    await (await log()).setTitle(id, body.title.slice(0, 200));
    return c.json({ success: true });
  });

  app.delete("/conversations/:id", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    await (await log()).delete(id);
    return c.json({ success: true });
  });

  /** 在会话里发一条用户消息并运行；响应是 core 事件的 SSE 流 */
  app.post("/conversations/:id/runs", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    const body = await readJson<{ text?: string; system?: string; model?: string; provider?: LLMProvider; maxSteps?: number }>(c);
    if (!body || typeof body.text !== "string" || !body.text.trim()) return c.json({ error: "text is required" }, 400);
    if (body.text.length > MAX_TEXT) return c.json({ error: "text too long" }, 400);
    if (body.system !== undefined && (typeof body.system !== "string" || body.system.length > MAX_SYSTEM)) {
      return c.json({ error: "invalid system prompt" }, 400);
    }
    const conversations = await log();
    const conv = await conversations.load(id);
    if (!conv) return c.json({ error: "Not found" }, 404);

    const message = userMessage(body.text);
    // 用户消息先写盘（core 只负责持久化运行过程中新增的消息）
    await conversations.append(id, { kind: "append", message });
    if (!conv.meta.title) await conversations.setTitle(id, body.text.trim().replace(/\s+/g, " ").slice(0, 40));

    const maxSteps = Math.min(Math.max(body.maxSteps ?? 10, 1), 50);
    const provider = legacyProvider(llm, body.provider);
    const handle = run({
      provider,
      model: body.model ?? "",
      ...(body.system ? { system: body.system } : {}),
      messages: [...conv.transcript, message],
      tools: mcpCoreTools(context.sessionManager, truncate),
      approval: { answerers: [pendingApprovalAnswerer(context.pendingApprovals)] },
      compactor: createCompactor(),
      stopWhen: stepCount(maxSteps),
      persist: conversations.persistFor(id),
    });
    runs.set(handle.runId, handle);

    return streamSSE(c, async (stream) => {
      stream.onAbort(() => handle.abort("client disconnected"));
      try {
        for await (const e of handle) {
          const pub = toPublicEvent(e);
          if (pub.type === "error") {
            // 不向客户端暴露上游错误细节（CLAUDE.md 后端规范）
            pub.error = { ...pub.error, message: sanitize(provider.lastError ?? new Error(pub.error.message)) };
          }
          if (pub.type === "run_end" && pub.result.error) {
            pub.result = { ...pub.result, error: { kind: pub.result.error.kind, message: sanitize(provider.lastError ?? new Error(pub.result.error.message)) } };
          }
          if (pub.type === "tool_end" && e.type === "tool_end" && e.internal) console.error("[Tool Error]", e.internal.error);
          await stream.writeSSE({ event: pub.type, data: JSON.stringify(pub) }).catch(() => handle.abort("write failed"));
        }
      } finally {
        runs.delete(handle.runId);
      }
    });
  });

  const withRun = (handler: (h: RunHandle, text: string) => Promise<unknown> | unknown, needsText: boolean) =>
    async (c: Context) => {
      const h = runs.get(c.req.param("runId") ?? "");
      if (!h) return c.json({ error: "Run not found" }, 404);
      const body = needsText ? await readJson<{ text?: string }>(c) : {};
      const text = (body as { text?: string } | null)?.text;
      if (needsText && (typeof text !== "string" || !text.trim() || text.length > MAX_TEXT)) return c.json({ error: "text is required" }, 400);
      return c.json({ result: (await handler(h, text ?? "")) ?? null });
    };

  // 插话：在下一个 step 边界插入；返回是否送达
  app.post("/runs/:runId/steer", withRun((h, text) => h.steer(userMessage(text)), true));
  // 排队：本轮结束后接着跑
  app.post("/runs/:runId/follow-up", withRun((h, text) => h.followUp(userMessage(text)), true));
  app.post("/runs/:runId/abort", withRun((h) => h.abort("user"), false));

  return app;
}
