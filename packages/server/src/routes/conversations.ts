/**
 * 会话、运行与目标（/goal）接口，直接以 SSE 发送 core 事件（toPublicEvent 之后）。
 * 会话数据是每个会话一份 JSONL 日志（@leochat/node 的 conversationLog，参考 dsh），
 * 运行中的每次 transcript 变化都通过 run({ persist }) 先写盘再继续；目标变更也写进同一份日志。
 */
import { Hono, type Context } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import {
  GoalError,
  createCompactor,
  goalController,
  run,
  runGoal,
  stepCount,
  toPublicEvent,
  userMessage,
  type AgentEvent,
  type AnyTool,
  type GoalController,
  type GoalRunHandle,
  type Message,
  type RunHandle,
} from "@leochat/core";
import {
  ScheduleError,
  createScheduler,
  renderReminder,
  scheduleTools,
  type ConversationLog,
  type Schedule,
  type ScheduleRule,
  type Scheduler,
} from "@leochat/node";
import type { LLMProvider } from "@ai-chatbox/shared";
import type { ServerContext } from "../server.js";
import { mcpCoreTools, pendingApprovalAnswerer } from "../core-bridge.js";
import { selectProvider, type ProviderSource, type RunProvider } from "../providers.js";
import { UI_TOOL_NAMES, uiTools } from "../ui-tools.js";

const MAX_TEXT = 100_000;
const MAX_SYSTEM = 50_000;
/** 前端"不限轮数"对应的上限 */
const MAX_STEPS = 1000;
const MAX_TOOLS = 500;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

async function readJson<T>(c: { req: { json<U>(): Promise<U> } }): Promise<T | null> {
  try {
    return await c.req.json<T>();
  } catch {
    return null;
  }
}

/** 运行设置（普通运行和目标运行共用）；字段都来自不可信的请求体 */
interface RunSettingsBody {
  system?: string;
  model?: string;
  provider?: LLMProvider;
  maxSteps?: number;
  temperature?: number;
  tools?: unknown;
  webSearch?: boolean;
  host?: string;
  uiTools?: boolean;
}

interface RunSettings {
  provider: RunProvider;
  model: string;
  system?: string;
  temperature?: number;
  serverTools?: Array<"web_search">;
  tools: AnyTool[];
  maxSteps: number;
}

/** 目标驱动：事件分发给所有连着的客户端；客户端断开不影响驱动（无人值守） */
interface GoalSession {
  handle: GoalRunHandle;
  provider: RunProvider;
  subscribers: Set<(e: AgentEvent | null) => void>;
  /** 驱动结束且会话已登记为空闲后 resolve */
  done: Promise<void>;
}

export function createConversationRoutes(
  context: ServerContext,
  llm: ProviderSource,
  truncate: (s: string) => string,
  sanitize: (e: unknown) => string,
) {
  const app = new Hono();
  /** 进行中的运行（包括目标的每一轮）：插话、排队、中止用 */
  const runs = new Map<string, RunHandle>();
  /** 正在运行的会话（同一会话同时只能有一次运行或一个目标驱动） */
  const busy = new Set<string>();
  const goalSessions = new Map<string, GoalSession>();
  /** 每个会话正在进行的普通运行（定时提醒到期时排进去） */
  const activeRuns = new Map<string, RunHandle>();
  /** 正在看某个会话的客户端：收到 server 自己发起的运行（定时提醒）的事件 */
  const watchers = new Map<string, Set<(e: AgentEvent) => void>>();
  const broadcast = (id: string, e: AgentEvent) => watchers.get(id)?.forEach((f) => f(e));
  /** 每个会话的目标控制器（本进程是唯一写入方，缓存起来保证串行） */
  const controllers = new Map<string, Promise<GoalController>>();
  const log = (): Promise<ConversationLog> => context.conversations;
  const goalsFor = (id: string): Promise<GoalController> => {
    let p = controllers.get(id);
    if (!p) {
      p = log().then((l) => goalController(l.goalStore(id)));
      p.catch(() => controllers.delete(id));
      controllers.set(id, p);
    }
    return p;
  };

  /** 校验请求体里的运行设置；不合法时返回错误文字 */
  function parseSettings(body: RunSettingsBody): RunSettings | string {
    if (body.system !== undefined && (typeof body.system !== "string" || body.system.length > MAX_SYSTEM)) return "invalid system prompt";
    // 可用工具白名单（GUI 发送用户启用的工具名）；不传表示全部
    let allow: Set<string> | undefined;
    if (body.tools !== undefined) {
      if (!Array.isArray(body.tools) || body.tools.length > MAX_TOOLS || !body.tools.every((t) => typeof t === "string" && t.length <= 256)) {
        return "invalid tools";
      }
      allow = new Set(body.tools as string[]);
    }
    const { provider, model } = selectProvider(llm, body.provider, body.model);
    const temperature = typeof body.temperature === "number" && body.temperature >= 0 && body.temperature <= 2 ? body.temperature : undefined;
    return {
      provider,
      model,
      ...(body.system ? { system: body.system } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      // 联网搜索是 DeepSeek 的服务端工具，只有原生 provider 支持
      ...(body.webSearch === true && provider.native ? { serverTools: ["web_search" as const] } : {}),
      // 界面操作工具在进程内（默认提供）；同名的 MCP 工具（旧版 leochat-mcp）跳过，避免重名
      tools: [
        ...(body.uiTools === false ? [] : uiTools({ electron: body.host === "electron" })),
        ...mcpCoreTools(context.sessionManager, truncate, allow).filter((t) => !UI_TOOL_NAMES.has(t.name)),
      ],
      maxSteps: Math.min(Math.max(Math.floor(Number(body.maxSteps) || 10), 1), MAX_STEPS),
    };
  }

  const runOptionsOf = (s: RunSettings) => ({
    provider: s.provider,
    model: s.model,
    ...(s.serverTools ? { serverTools: s.serverTools } : {}),
    ...(s.system ? { system: s.system } : {}),
    ...(s.temperature !== undefined ? { temperature: s.temperature } : {}),
    tools: s.tools,
    compactor: createCompactor(),
    stopWhen: stepCount(s.maxSteps),
  });

  /** 只保留运行设置字段（存进定时任务，到期时用同样的设置运行） */
  const settingsBodyOf = (b: RunSettingsBody): RunSettingsBody => {
    const keys = ["system", "model", "provider", "maxSteps", "temperature", "tools", "webSearch", "host", "uiTools"] as const;
    return Object.fromEntries(keys.filter((k) => b[k] !== undefined).map((k) => [k, b[k]])) as RunSettingsBody;
  };

  // ── 定时提醒（/loop） ──
  let schedulerP: Promise<Scheduler<RunSettingsBody>> | undefined;
  const scheduleToolsFor = async (id: string, body: RunSettingsBody): Promise<AnyTool[]> =>
    schedulerP ? scheduleTools(await schedulerP, id, { settings: settingsBodyOf(body) }) : [];

  /** 普通运行：追加用户消息、开始 run()。调用方已经检查过会话空闲；运行结束后自动解除 busy */
  async function startRun(id: string, transcript: Message[], message: Message, settings: RunSettings, body: RunSettingsBody) {
    const conversations = await log();
    busy.add(id);
    try {
      // 用户消息先写盘（core 只负责持久化运行过程中新增的消息）
      await conversations.append(id, { kind: "append", message });
      const handle = run({
        ...runOptionsOf(settings),
        tools: [...settings.tools, ...(await scheduleToolsFor(id, body))],
        messages: [...transcript, message],
        approval: { answerers: [pendingApprovalAnswerer(context.pendingApprovals)] },
        persist: conversations.persistFor(id),
      });
      runs.set(handle.runId, handle);
      activeRuns.set(id, handle);
      void handle.result.finally(() => {
        runs.delete(handle.runId);
        if (activeRuns.get(id) === handle) activeRuns.delete(id);
        busy.delete(id);
      });
      return handle;
    } catch (e) {
      busy.delete(id);
      throw e;
    }
  }

  /** 定时提醒到期：会话空闲就开一次运行，正在运行就排进去（followUp）；抛错表示稍后再试 */
  async function deliver(schedule: Schedule<RunSettingsBody>, occurrenceAt: number): Promise<void> {
    const id = schedule.conversationId;
    const conv = await (await log()).load(id);
    if (!conv) {
      // 会话已删除：任务一并删除（不能在投递里 await，调度器正在串行处理）
      void schedulerP?.then((s) => s.delete(schedule.id));
      return;
    }
    const message = userMessage(renderReminder(schedule, occurrenceAt, schedule.timeZone));
    const goal = goalSessions.get(id);
    if (goal) {
      const round = goal.handle.current();
      if (!round) throw new Error("goal is between rounds");
      round.followUp(message);
      return;
    }
    const active = activeRuns.get(id);
    if (active) {
      active.followUp(message);
      return;
    }
    if (busy.has(id)) throw new Error("conversation is busy");
    const body = schedule.settings ?? {};
    const settings = parseSettings(body);
    if (typeof settings === "string") throw new Error(`invalid saved settings: ${settings}`);
    const handle = await startRun(id, conv.transcript, message, settings, body);
    // 正在看这个会话的客户端：先收到提醒消息，再收到运行事件
    broadcast(id, { type: "user_message", message, via: "followUp" });
    void (async () => {
      for await (const e of handle) broadcast(id, publicEvent(e, settings.provider));
    })();
  }

  if (context.schedulesFile) {
    schedulerP = createScheduler<RunSettingsBody>({
      file: context.schedulesFile,
      deliver,
      onError: (e, sch) => console.warn(`[schedule] ${sch.id} delivery deferred:`, e instanceof Error ? e.message : e),
    });
    void schedulerP.then(
      (sch) => sch.start(),
      (e) => console.error("[schedule] failed to start", e),
    );
  }

  /** 转成发给浏览器的事件：去掉内部字段，上游错误换成安全的说明（CLAUDE.md 后端规范） */
  function publicEvent(e: AgentEvent, provider: RunProvider): AgentEvent {
    const pub = toPublicEvent(e);
    if (pub.type === "error") pub.error = { ...pub.error, message: sanitize(provider.lastError ?? new Error(pub.error.message)) };
    if (pub.type === "run_end" && pub.result.error) {
      pub.result = { ...pub.result, error: { kind: pub.result.error.kind, message: sanitize(provider.lastError ?? new Error(pub.result.error.message)) } };
    }
    if (pub.type === "tool_end" && e.type === "tool_end" && e.internal) console.error("[Tool Error]", e.internal.error);
    return pub;
  }
  const writeEvent = (stream: SSEStreamingApi, pub: AgentEvent) => stream.writeSSE({ event: pub.type, data: JSON.stringify(pub) });

  // ── 会话 ──────────────────────────────────────────────────────────────

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
    if (!conv) return c.json({ error: "Not found" }, 404);
    return c.json({ ...conv, goalRunning: goalSessions.has(id) });
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
    goalSessions.get(id)?.handle.stop("abort");
    await (await log()).delete(id);
    controllers.delete(id);
    if (schedulerP) await (await schedulerP).deleteForConversation(id);
    return c.json({ success: true });
  });

  // ── 普通运行 ──────────────────────────────────────────────────────────

  /** 在会话里发一条用户消息并运行；响应是 core 事件的 SSE 流 */
  app.post("/conversations/:id/runs", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    const body = await readJson<RunSettingsBody & { text?: string }>(c);
    if (!body || typeof body.text !== "string" || !body.text.trim()) return c.json({ error: "text is required" }, 400);
    if (body.text.length > MAX_TEXT) return c.json({ error: "text too long" }, 400);
    const settings = parseSettings(body);
    if (typeof settings === "string") return c.json({ error: settings }, 400);
    const conversations = await log();
    const conv = await conversations.load(id);
    if (!conv) return c.json({ error: "Not found" }, 404);
    // 运行中请用插话 / 排队接口，不能在同一会话再起一次运行
    if (busy.has(id)) return c.json({ error: "Conversation is busy" }, 409);
    const handle = await startRun(id, conv.transcript, userMessage(body.text), settings, body);
    if (!conv.meta.title) await conversations.setTitle(id, body.text.trim().replace(/\s+/g, " ").slice(0, 40));
    return streamSSE(c, async (stream) => {
      stream.onAbort(() => handle.abort("client disconnected"));
      for await (const e of handle) {
        await writeEvent(stream, publicEvent(e, settings.provider)).catch(() => handle.abort("write failed"));
      }
    });
  });

  /**
   * 观察一个会话（长连接）：收到 server 自己发起的运行（定时提醒）的事件。
   * 客户端自己发起的运行仍然走各自的响应流，不会重复推送。
   */
  app.get("/conversations/:id/watch", (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    return streamSSE(c, async (stream) => {
      const queue: AgentEvent[] = [];
      let wake: (() => void) | null = null;
      const sub = (e: AgentEvent) => {
        queue.push(e);
        wake?.();
      };
      let set = watchers.get(id);
      if (!set) watchers.set(id, (set = new Set()));
      set.add(sub);
      // 心跳，防止中间层关掉空闲连接
      const heartbeat = setInterval(() => sub({ type: "custom", name: "ping", data: null }), 25_000);
      stream.onAbort(() => wake?.());
      try {
        await writeEvent(stream, { type: "custom", name: "ping", data: null });
        while (!stream.aborted) {
          const e = queue.shift();
          if (!e) {
            await new Promise<void>((r) => (wake = r));
            wake = null;
            continue;
          }
          await writeEvent(stream, e);
        }
      } finally {
        clearInterval(heartbeat);
        set.delete(sub);
        if (!set.size) watchers.delete(id);
      }
    });
  });

  // ── 定时提醒接口 ──

  app.get("/schedules", async (c) => {
    if (!schedulerP) return c.json({ schedules: [] });
    const conversationId = c.req.query("conversationId");
    return c.json({ schedules: (await schedulerP).list(conversationId ? { conversationId } : {}) });
  });

  /** 用户创建定时提醒（/loop）；settings 是到期时运行用的设置 */
  app.post("/conversations/:id/schedules", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    if (!schedulerP) return c.json({ error: "Schedules are not enabled" }, 503);
    const body = await readJson<{ prompt?: unknown; title?: unknown; rule?: unknown; timeZone?: unknown; settings?: RunSettingsBody }>(c);
    if (!body || typeof body.prompt !== "string" || typeof body.rule !== "object" || body.rule === null) {
      return c.json({ error: "prompt and rule are required" }, 400);
    }
    if (!(await (await log()).load(id))) return c.json({ error: "Not found" }, 404);
    const settings = body.settings && typeof body.settings === "object" ? settingsBodyOf(body.settings) : {};
    if (typeof parseSettings(settings) === "string") return c.json({ error: "invalid settings" }, 400);
    try {
      const schedule = await (await schedulerP).create({
        conversationId: id,
        prompt: body.prompt,
        ...(typeof body.title === "string" ? { title: body.title } : {}),
        rule: body.rule as ScheduleRule,
        ...(typeof body.timeZone === "string" ? { timeZone: body.timeZone } : {}),
        settings,
      });
      return c.json({ schedule });
    } catch (e) {
      if (e instanceof ScheduleError) return c.json({ error: e.message, code: e.code }, 400);
      throw e;
    }
  });

  app.delete("/schedules/:sid", async (c) => {
    if (!schedulerP) return c.json({ error: "Not found" }, 404);
    const deleted = await (await schedulerP).delete(c.req.param("sid"));
    return deleted ? c.json({ success: true }) : c.json({ error: "Not found" }, 404);
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
  // 中止；目标的某一轮被中止时，目标会暂停
  app.post("/runs/:runId/abort", withRun((h) => h.abort("user"), false));

  // ── 目标（/goal） ─────────────────────────────────────────────────────

  const goalErrorResponse = (c: Context, e: unknown) => {
    if (e instanceof GoalError) {
      const status = e.code === "stale" || e.code === "goal_exists" ? 409 : e.code === "no_goal" ? 404 : 400;
      return c.json({ error: e.message, code: e.code }, status);
    }
    throw e;
  };

  app.get("/conversations/:id/goal", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    const conv = await (await log()).load(id);
    if (!conv) return c.json({ error: "Not found" }, 404);
    try {
      return c.json({ goal: (await goalsFor(id)).get(), running: goalSessions.has(id) });
    } catch (e) {
      return goalErrorResponse(c, e);
    }
  });

  /** 创建目标（只有用户能创建）；创建后用 POST /goal/run 开始自动推进 */
  app.post("/conversations/:id/goal", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    const body = await readJson<{ objective?: unknown; maxRounds?: unknown }>(c);
    if (!body) return c.json({ error: "Invalid JSON body" }, 400);
    const conversations = await log();
    const conv = await conversations.load(id);
    if (!conv) return c.json({ error: "Not found" }, 404);
    try {
      const goal = await (await goalsFor(id)).create({
        objective: body.objective as string,
        ...(body.maxRounds !== undefined ? { maxRounds: body.maxRounds as number } : {}),
      });
      if (!conv.meta.title) await conversations.setTitle(id, `目标：${goal.objective.replace(/\s+/g, " ").slice(0, 36)}`);
      return c.json({ goal });
    } catch (e) {
      return goalErrorResponse(c, e);
    }
  });

  /** 用户修改目标：edit / pause / resume / complete / clear，都要带当前 revision */
  app.patch("/conversations/:id/goal", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    const body = await readJson<{ action?: string; revision?: unknown; objective?: unknown; maxRounds?: unknown }>(c);
    if (!body || typeof body.revision !== "number") return c.json({ error: "action and revision are required" }, 400);
    try {
      const goals = await goalsFor(id);
      const current = goals.get();
      if (!current) return c.json({ error: "No goal", code: "no_goal" }, 404);
      const ref = { id: current.id, revision: body.revision };
      const session = goalSessions.get(id);
      switch (body.action) {
        case "pause":
          // 驱动在跑：中止当前轮，由驱动暂停目标（dsh：宿主发起的暂停会中止正在运行的轮次）
          if (current.revision !== body.revision) throw new GoalError("stale", "goal changed; read it again");
          if (session) {
            session.handle.stop("pause");
            await session.done;
          } else await goals.pause(ref);
          break;
        case "resume":
          await goals.resume(ref);
          break;
        case "complete":
          await goals.complete(ref);
          break;
        case "edit":
          await goals.edit(ref, {
            ...(body.objective !== undefined ? { objective: body.objective as string } : {}),
            ...(body.maxRounds !== undefined ? { maxRounds: body.maxRounds as number } : {}),
          });
          break;
        case "clear":
          if (current.revision !== body.revision) throw new GoalError("stale", "goal changed; read it again");
          if (session) {
            session.handle.stop("abort");
            await session.done;
          }
          await goals.clear({ id: current.id, revision: goals.get()?.revision ?? body.revision });
          break;
        default:
          return c.json({ error: "unknown action" }, 400);
      }
      return c.json({ goal: goals.get(), running: goalSessions.has(id) });
    } catch (e) {
      return goalErrorResponse(c, e);
    }
  });

  /**
   * 开始自动推进目标（或连上正在推进的驱动），响应是事件 SSE。
   * 客户端断开不会停止驱动：目标在后台继续（无人值守），重新打开会话后再连上即可。
   * 进程重启后驱动不会自己继续（dsh 的规则），要用户再调用这个接口。
   */
  app.post("/conversations/:id/goal/run", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    let session = goalSessions.get(id);
    if (!session) {
      const body = (await readJson<RunSettingsBody>(c)) ?? {};
      const settings = parseSettings(body);
      if (typeof settings === "string") return c.json({ error: settings }, 400);
      const conversations = await log();
      const conv = await conversations.load(id);
      if (!conv) return c.json({ error: "Not found" }, 404);
      let goals: GoalController;
      try {
        goals = await goalsFor(id);
      } catch (e) {
        return goalErrorResponse(c, e);
      }
      const goal = goals.get();
      if (!goal || goal.phase !== "active") return c.json({ error: "Goal is not active", code: "invalid_transition", goal }, 409);
      if (busy.has(id)) return c.json({ error: "Conversation is busy" }, 409);
      busy.add(id);
      const handle = runGoal({
        ...runOptionsOf(settings),
        messages: conv.transcript,
        goals,
        persist: conversations.persistFor(id),
        onRound: (round) => {
          runs.set(round.runId, round);
          void round.result.finally(() => runs.delete(round.runId));
        },
      });
      const s: GoalSession = { handle, provider: settings.provider, subscribers: new Set(), done: Promise.resolve() };
      session = s;
      goalSessions.set(id, s);
      s.done = (async () => {
        try {
          for await (const e of handle) for (const sub of s.subscribers) sub(e);
          await handle.result;
        } finally {
          goalSessions.delete(id);
          busy.delete(id);
          for (const sub of s.subscribers) sub(null);
        }
      })();
    }

    const s = session;
    return streamSSE(c, async (stream) => {
      let wake: (() => void) | null = null;
      const queue: Array<AgentEvent | null> = [];
      const sub = (e: AgentEvent | null) => {
        queue.push(e);
        wake?.();
      };
      s.subscribers.add(sub);
      // 连接时先告诉客户端当前目标状态
      await writeEvent(stream, { type: "custom", name: "goal", data: (await goalsFor(id)).get() });
      stream.onAbort(() => {
        s.subscribers.delete(sub);
        wake?.();
      });
      try {
        for (;;) {
          if (stream.aborted) return;
          const e = queue.shift();
          if (e === undefined) {
            await new Promise<void>((r) => (wake = r));
            wake = null;
            continue;
          }
          if (e === null) return;
          await writeEvent(stream, publicEvent(e, s.provider));
        }
      } finally {
        s.subscribers.delete(sub);
      }
    });
  });

  return app;
}
