/**
 * 会话接口（harness 第三期：会话收件箱，设计 docs/superpowers/specs/2026-11-17-conversation-inbox-design.md）。
 *
 * - 所有输入（用户消息、插话、定时提醒、目标的下一轮）都写进会话的收件箱，由每个会话一个的处理者按顺序跑
 *   （conversation-agent.ts，参考 dsh agent-loop）
 * - 每个会话一条事件流 GET /conversations/:id/events：推送这个会话所有运行的事件（不论由谁发起），
 *   连上时先补发状态、收件箱、目标和当前这一轮已发生的事件
 * - 会话数据是每个会话一份 JSONL（@leochat/node conversationLog）；运行中每次 transcript 变化先写盘再继续
 */
import { Hono, type Context } from "hono";
import { streamSSE, type SSEStreamingApi } from "hono/streaming";
import {
  GoalError,
  createCompactor,
  goalController,
  stepCount,
  toPublicEvent,
  userMessage,
  type AgentEvent,
  type AnyTool,
  type GoalController,
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
  withInstructions,
} from "@leochat/node";
import type { LLMProvider } from "@ai-chatbox/shared";
import { deepseekFetch, deepseekSearch } from "@leochat/deepseek";
import type { ServerContext } from "../server.js";
import { mcpCoreTools, pendingApprovalAnswerer } from "../core-bridge.js";
import { selectProvider, type ProviderSource, type RunProvider } from "../providers.js";
import { UI_TOOL_NAMES, uiTools } from "../ui-tools.js";
import { ConversationAgent, unattendedApproval, type TurnSetup } from "../conversation-agent.js";

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

/** 运行设置（来自不可信的请求体，存进收件箱 / 定时任务，到期时用同样的设置运行） */
export interface RunSettingsBody {
  system?: string;
  model?: string;
  provider?: LLMProvider;
  maxSteps?: number;
  temperature?: number;
  tools?: unknown;
  webSearch?: boolean;
  host?: string;
  uiTools?: boolean;
  /** 权限预设（dsh 的 permission-presets，暂无沙箱）：ask 询问（默认），full 完全信任、不再询问 */
  permission?: "ask" | "full";
}

interface RunSettings {
  provider: RunProvider;
  model: string;
  system?: string;
  temperature?: number;
  serverTools?: Array<"web_search">;
  tools: AnyTool[];
  maxSteps: number;
  fullAccess: boolean;
}

const SETTINGS_KEYS = ["system", "model", "provider", "maxSteps", "temperature", "tools", "webSearch", "host", "uiTools", "permission"] as const;
/** 只保留运行设置字段 */
const settingsBodyOf = (b: RunSettingsBody): RunSettingsBody =>
  Object.fromEntries(SETTINGS_KEYS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]])) as RunSettingsBody;

export function createConversationRoutes(
  context: ServerContext,
  llm: ProviderSource,
  truncate: (s: string) => string,
  sanitize: (e: unknown) => string,
) {
  const app = new Hono();
  const log = (): Promise<ConversationLog> => context.conversations;
  /** 每个会话的目标控制器（本进程是唯一写入方，缓存起来保证串行） */
  const controllers = new Map<string, Promise<GoalController>>();
  const goalsFor = (id: string): Promise<GoalController> => {
    let p = controllers.get(id);
    if (!p) {
      p = log().then((l) => goalController(l.goalStore(id)));
      p.catch(() => controllers.delete(id));
      controllers.set(id, p);
    }
    return p;
  };

  /** 校验运行设置；不合法时返回错误文字 */
  function parseSettings(body: RunSettingsBody): RunSettings | string {
    if (body.system !== undefined && (typeof body.system !== "string" || body.system.length > MAX_SYSTEM)) return "invalid system prompt";
    if (body.permission !== undefined && body.permission !== "ask" && body.permission !== "full") return "invalid permission";
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
    // 联网搜索（按 dsh：和模型无关）：原生 DeepSeek 用服务端 web_search（带引用）；
    // 其它提供商挂 DeepSeek 的独立 Search / Fetch API 作为普通工具，需要配置了 DeepSeek key
    const deepseekKey = body.webSearch === true && !provider.native ? llm.getApiKey?.("deepseek") : undefined;
    return {
      provider,
      model,
      ...(body.system ? { system: body.system } : {}),
      ...(temperature !== undefined ? { temperature } : {}),
      ...(body.webSearch === true && provider.native ? { serverTools: ["web_search" as const] } : {}),
      // 界面操作工具在进程内（默认提供）；同名的 MCP 工具（旧版 leochat-mcp）跳过，避免重名
      tools: [
        ...(deepseekKey ? [deepseekSearch({ apiKey: deepseekKey }), deepseekFetch({ apiKey: deepseekKey })] : []),
        ...(body.uiTools === false ? [] : uiTools({ electron: body.host === "electron" })),
        ...mcpCoreTools(context.sessionManager, truncate, allow).filter((t) => !UI_TOOL_NAMES.has(t.name)),
      ],
      maxSteps: Math.min(Math.max(Math.floor(Number(body.maxSteps) || 10), 1), MAX_STEPS),
      fullAccess: body.permission === "full",
    };
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

  // ── 定时提醒（/loop）：到期时放进收件箱 ──
  let schedulerP: Promise<Scheduler<RunSettingsBody>> | undefined;

  // ── 每个会话一个处理者 ──
  const agents = new Map<string, ConversationAgent<RunSettingsBody>>();
  const ready = log();
  /** 会话的处理者（按需创建，进程内每个会话只有一个） */
  const agentReady = async (id: string): Promise<ConversationAgent<RunSettingsBody>> => {
    const l = await ready;
    let a = agents.get(id);
    if (!a) {
      a = new ConversationAgent<RunSettingsBody>({
        id,
        log: l,
        goals: () => goalsFor(id),
        setup: async (body, source, extraTools): Promise<TurnSetup> => {
          const b = body ?? {};
          const s = parseSettings(b);
          if (typeof s === "string") throw new Error(`invalid saved settings: ${s}`);
          const schedule = schedulerP ? scheduleTools(await schedulerP, id, { settings: settingsBodyOf(b) }) : [];
          return {
            options: {
              provider: s.provider,
              model: s.model,
              ...(s.serverTools ? { serverTools: s.serverTools } : {}),
              ...(await (async () => {
                const system = context.instructions ? withInstructions(s.system, await context.instructions().catch(() => ({ text: "", files: [], omitted: [] }))) : s.system;
                return system ? { system } : {};
              })()),
              ...(s.temperature !== undefined ? { temperature: s.temperature } : {}),
              tools: [...s.tools, ...schedule, ...extraTools],
              compactor: createCompactor(),
              stopWhen: stepCount(s.maxSteps),
            },
            // 目标轮次无人值守：询问模式下拒绝需要审批的工具（第二期决定 2A），完全信任时直接执行
            approval:
              source === "goal"
                ? unattendedApproval(s.fullAccess)
                : s.fullAccess
                  ? { policy: "allow" }
                  : { answerers: [pendingApprovalAnswerer(context.pendingApprovals)] },
            publicEvent: (e) => publicEvent(e, s.provider),
          };
        },
        onTurnError: (e) => console.error("[agent] turn could not start:", e),
      });
      agents.set(id, a);
    }
    return a;
  };

  if (context.schedulesFile) {
    schedulerP = createScheduler<RunSettingsBody>({
      file: context.schedulesFile,
      // 到期：放进收件箱（先写盘），由处理者在空闲时跑；不会因为会话忙而失败
      deliver: async (schedule: Schedule<RunSettingsBody>, occurrenceAt: number) => {
        const id = schedule.conversationId;
        if (!(await (await log()).load(id))) {
          void schedulerP?.then((s) => s.delete(schedule.id)); // 会话已删除
          return;
        }
        const message = userMessage(renderReminder(schedule, occurrenceAt, schedule.timeZone));
        await (await agentReady(id)).insert("next-turn", message, "reminder", schedule.settings ?? {});
      },
      onError: (e, sch) => console.warn(`[schedule] ${sch.id} delivery deferred:`, e instanceof Error ? e.message : e),
    });
    void schedulerP.then(
      (sch) => sch.start(),
      (e) => console.error("[schedule] failed to start", e),
    );
  }

  // 进程启动：收件箱里还有待处理输入的会话继续处理（目标不会自己恢复）
  void (async () => {
    try {
      const l = await ready;
      for (const c of await l.list()) {
        const conv = await l.load(c.id);
        if (conv && (conv.inbox["next-turn"].length || conv.inbox["next-step"].length)) (await agentReady(c.id)).kick();
      }
    } catch (e) {
      console.error("[agent] startup scan failed", e);
    }
  })();

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
    const a = agents.get(id);
    return c.json({ ...conv, running: a?.isRunning ?? false, goalArmed: a?.isArmed ?? false });
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
    agents.get(id)?.dispose();
    agents.delete(id);
    await (await log()).delete(id);
    controllers.delete(id);
    if (schedulerP) await (await schedulerP).deleteForConversation(id);
    return c.json({ success: true });
  });

  // ── 输入 ──────────────────────────────────────────────────────────────

  /**
   * 发一条消息：写进收件箱后立刻返回。target：next-turn 排队（空闲时就是"发送"），
   * next-step 插话（送进正在运行的这一轮；空闲时等同下一轮）。settings 是跑这条消息用的设置
   */
  app.post("/conversations/:id/messages", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    const body = await readJson<{ text?: unknown; target?: unknown; settings?: RunSettingsBody }>(c);
    if (!body || typeof body.text !== "string" || !body.text.trim()) return c.json({ error: "text is required" }, 400);
    if (body.text.length > MAX_TEXT) return c.json({ error: "text too long" }, 400);
    const target = body.target === "next-step" ? "next-step" : body.target === undefined || body.target === "next-turn" ? "next-turn" : null;
    if (!target) return c.json({ error: "invalid target" }, 400);
    const settings = body.settings && typeof body.settings === "object" ? settingsBodyOf(body.settings) : {};
    const parsed = parseSettings(settings);
    if (typeof parsed === "string") return c.json({ error: parsed }, 400);
    const conversations = await log();
    const conv = await conversations.load(id);
    if (!conv) return c.json({ error: "Not found" }, 404);
    if (!conv.meta.title) await conversations.setTitle(id, body.text.trim().replace(/\s+/g, " ").slice(0, 40));
    const item = await (await agentReady(id)).insert(target, userMessage(body.text), "user", settings);
    return c.json({ item: { id: item.id, target } }, 202);
  });

  /** 撤回一条还没处理的输入 */
  app.delete("/conversations/:id/inbox/:itemId", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    const ok = await (await agentReady(id)).discard(c.req.param("itemId"));
    return ok ? c.json({ success: true }) : c.json({ error: "Not pending" }, 404);
  });

  /** 停止：中止当前运行并清空收件箱；停止的是目标轮次则暂停目标 */
  app.post("/conversations/:id/stop", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    if (!(await (await log()).load(id))) return c.json({ error: "Not found" }, 404);
    await (await agentReady(id)).stop();
    return c.json({ success: true });
  });

  /**
   * 会话事件流（长连接）：这个会话所有运行的事件。连上时先补发状态、收件箱、目标和当前这一轮已发生的事件。
   * 自定义事件：agent（运行状态）、inbox（待处理输入）、goal（目标 + armed）、goal_round、ui_command、ping
   */
  app.get("/conversations/:id/events", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    if (!(await (await log()).load(id))) return c.json({ error: "Not found" }, 404);
    const agent = await agentReady(id);
    return streamSSE(c, async (stream) => {
      const queue: AgentEvent[] = [];
      let wake: (() => void) | null = null;
      const push = (e: AgentEvent) => {
        queue.push(e);
        wake?.();
      };
      // 先订阅再取快照：两者之间发生的事件不会漏（会有少量重复，客户端的 reducer 对快照之后的事件按顺序处理）
      const unsubscribe = agent.subscribe(push);
      const snapshot = await agent.snapshot();
      queue.unshift(...snapshot.filter((e) => !queue.includes(e)));
      const heartbeat = setInterval(() => push({ type: "custom", name: "ping", data: null }), 25_000);
      stream.onAbort(() => wake?.());
      try {
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
        unsubscribe();
      }
    });
  });

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
    if (!(await (await log()).load(id))) return c.json({ error: "Not found" }, 404);
    try {
      return c.json({ goal: (await goalsFor(id)).get(), armed: agents.get(id)?.isArmed ?? false });
    } catch (e) {
      return goalErrorResponse(c, e);
    }
  });

  /** 创建目标（只有用户能创建）并开始自动推进；settings 是目标轮次用的设置 */
  app.post("/conversations/:id/goal", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    const body = await readJson<{ objective?: unknown; maxRounds?: unknown; settings?: RunSettingsBody }>(c);
    if (!body) return c.json({ error: "Invalid JSON body" }, 400);
    const settings = body.settings && typeof body.settings === "object" ? settingsBodyOf(body.settings) : {};
    if (typeof parseSettings(settings) === "string") return c.json({ error: "invalid settings" }, 400);
    const conversations = await log();
    const conv = await conversations.load(id);
    if (!conv) return c.json({ error: "Not found" }, 404);
    try {
      const goal = await (await goalsFor(id)).create({
        objective: body.objective as string,
        ...(body.maxRounds !== undefined ? { maxRounds: body.maxRounds as number } : {}),
      });
      if (!conv.meta.title) await conversations.setTitle(id, `目标：${goal.objective.replace(/\s+/g, " ").slice(0, 36)}`);
      (await agentReady(id)).arm(settings);
      return c.json({ goal, armed: true });
    } catch (e) {
      return goalErrorResponse(c, e);
    }
  });

  /**
   * 用户修改目标，都要带当前 revision：
   * pause（暂停并中止正在跑的目标轮次）/ resume（恢复并继续推进，可带 settings）/ edit / complete / clear
   */
  app.patch("/conversations/:id/goal", async (c) => {
    const id = c.req.param("id");
    if (!SAFE_ID.test(id)) return c.json({ error: "Invalid id" }, 400);
    const body = await readJson<{ action?: string; revision?: unknown; objective?: unknown; maxRounds?: unknown; settings?: RunSettingsBody }>(c);
    if (!body || typeof body.revision !== "number") return c.json({ error: "action and revision are required" }, 400);
    try {
      const goals = await goalsFor(id);
      const current = goals.get();
      if (!current) return c.json({ error: "No goal", code: "no_goal" }, 404);
      const ref = { id: current.id, revision: body.revision };
      const agent = await agentReady(id);
      switch (body.action) {
        case "pause":
          // 宿主发起的暂停：中止正在跑的目标轮次（dsh）；没在跑时直接暂停
          if (current.revision !== body.revision) throw new GoalError("stale", "goal changed; read it again");
          agent.disarm(true);
          if (goals.get()?.phase === "active") await goals.pause({ id: current.id, revision: goals.get()!.revision }).catch(() => {});
          break;
        case "resume": {
          const settings = body.settings && typeof body.settings === "object" ? settingsBodyOf(body.settings) : {};
          if (typeof parseSettings(settings) === "string") return c.json({ error: "invalid settings" }, 400);
          if (current.phase !== "active") await goals.resume(ref);
          else if (current.revision !== body.revision) throw new GoalError("stale", "goal changed; read it again");
          agent.arm(settings);
          break;
        }
        case "complete":
          await goals.complete(ref);
          agent.disarm(true);
          break;
        case "edit":
          await goals.edit(ref, {
            ...(body.objective !== undefined ? { objective: body.objective as string } : {}),
            ...(body.maxRounds !== undefined ? { maxRounds: body.maxRounds as number } : {}),
          });
          break;
        case "clear":
          if (current.revision !== body.revision) throw new GoalError("stale", "goal changed; read it again");
          agent.disarm(true);
          await goals.clear({ id: current.id, revision: goals.get()?.revision ?? body.revision });
          break;
        default:
          return c.json({ error: "unknown action" }, 400);
      }
      await agent.emitGoal();
      return c.json({ goal: goals.get(), armed: agent.isArmed });
    } catch (e) {
      return goalErrorResponse(c, e);
    }
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

  return app;
}
