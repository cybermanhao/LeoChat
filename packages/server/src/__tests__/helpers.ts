/** 路由测试共用：假的 LLM（按脚本逐轮回答）、请求、读会话事件流 */
import { vi } from "vitest";
import { attachmentStore } from "../attachments.js";
import { join } from "node:path";
import { Hono } from "hono";
import { conversationLog } from "@leochat/node";
import type { AgentEvent } from "@leochat/core";
import { createRoutes } from "../routes/index.js";
import type { ServerContext } from "../server.js";
import type { StreamCallbacks } from "../services/llm.js";

export type Round = (cbs: StreamCallbacks) => Promise<void>;
export type LegacyMessage = { role: string; content: string };

export interface TestApp {
  app: Hono;
  requests: Array<{ model?: string; messages: Array<{ role: string; content: string }>; tools?: Array<{ function: { name: string } }> }>;
  callTool: ReturnType<typeof vi.fn>;
  pending: Map<string, (ok: boolean) => void>;
}

export function makeApp(
  dir: string,
  rounds: Round[],
  opts: {
    tools?: string[];
    schedules?: boolean;
    callTool?: (name: string, args: unknown) => Promise<unknown>;
    /** AGENTS.md 文本；传函数时每轮准备时调用（可以用来卡住一轮的准备阶段） */
    instructions?: string | (() => Promise<string>);
    /** 开启附件存储（<dir>/attachments） */
    attachments?: boolean;
  } = {},
): TestApp {
  let i = 0;
  const requests: TestApp["requests"] = [];
  const llm = {
    streamChat: vi.fn(async (req: TestApp["requests"][number], cbs: StreamCallbacks) => {
      requests.push(structuredClone(req));
      const r = rounds[i++];
      if (!r) throw new Error("no more scripted rounds");
      await r(cbs);
    }),
    chat: vi.fn(),
  };
  const callTool = vi.fn(opts.callTool ?? (async () => "ran"));
  const pending = new Map<string, (ok: boolean) => void>();
  const context = {
    sessionManager: {
      getToolsForLLM: () => (opts.tools ?? ["bash"]).map((name) => ({ type: "function", function: { name, description: "", parameters: { type: "object" } } })),
      callTool,
    },
    startTime: Date.now(),
    pendingApprovals: pending,
    conversations: conversationLog(join(dir, "conversations")),
    ...(opts.schedules ? { schedulesFile: join(dir, "schedules.json") } : {}),
    ...(opts.attachments ? { attachments: attachmentStore(join(dir, "attachments")) } : {}),
    ...(opts.instructions !== undefined
      ? {
          instructions: async () => {
            const text = typeof opts.instructions === "function" ? await opts.instructions() : opts.instructions!;
            return { text, files: [{ path: "AGENTS.md", scope: "global", content: text }], omitted: [] };
          },
        }
      : {}),
  } as unknown as ServerContext;
  const app = new Hono();
  app.route("/api", createRoutes(context, llm as never));
  return { app, requests, callTool, pending };
}

export const req = (app: Hono, method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });

export const text = (s: string): Round => async (cbs) => {
  await cbs.onChunk({ content: s, index: 0 });
  await cbs.onComplete({ id: "a", role: "assistant", content: s, timestamp: 1 });
};

export const tool = (id: string, name: string, args: Record<string, unknown>): Round => async (cbs) => {
  await cbs.onToolCall({ id, name, arguments: args, status: "pending" });
  await cbs.onComplete({ id: "a", role: "assistant", content: "", timestamp: 1 });
};

/** 卡住直到 release() 的一轮（先输出一点文字） */
export function gated(s = "working"): { round: Round; release: () => void } {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => (release = r));
  return {
    release: () => release(),
    round: async (cbs) => {
      await cbs.onChunk({ content: s, index: 0 });
      await gate;
      await cbs.onComplete({ id: "a", role: "assistant", content: s, timestamp: 1 });
    },
  };
}

export const newConv = async (app: Hono) => ((await (await req(app, "POST", "/conversations", {})).json()) as { id: string }).id;

export const say = (app: Hono, id: string, text: string, extra: Record<string, unknown> = {}) =>
  req(app, "POST", `/conversations/${id}/messages`, { text, ...extra });

export type Custom = Extract<AgentEvent, { type: "custom" }>;
export const isCustom = (e: AgentEvent, name: string): e is Custom => e.type === "custom" && e.name === name;
export const agentRunning = (e: AgentEvent) => isCustom(e, "agent") && (e.data as { running: boolean }).running;
export const agentIdle = (e: AgentEvent) => isCustom(e, "agent") && !(e.data as { running: boolean }).running;

export interface Listener {
  events: AgentEvent[];
  /** 等到 cond(已收到的事件) 为真；超时抛错并列出已收到的事件 */
  until(cond: (events: AgentEvent[]) => boolean, timeoutMs?: number): Promise<AgentEvent[]>;
  close(): Promise<void>;
}

/**
 * 订阅会话事件流：收到连上时的快照后才返回，所以之后触发的事件一定能收到（避免"先触发、后订阅"的竞态）
 */
export async function listen(app: Hono, id: string): Promise<Listener> {
  const res = await req(app, "GET", `/conversations/${id}/events`);
  if (!res.ok || !res.body) throw new Error(`events failed: ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const events: AgentEvent[] = [];
  const waiters = new Set<() => void>();
  let buf = "";
  let closed = false;
  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let k;
        while ((k = buf.indexOf("\n\n")) >= 0) {
          const line = buf
            .slice(0, k)
            .split("\n")
            .find((l) => l.startsWith("data: "));
          buf = buf.slice(k + 2);
          if (line) events.push(JSON.parse(line.slice(6)) as AgentEvent);
        }
        for (const w of waiters) w();
      }
    } catch {
      /* 断开 */
    } finally {
      closed = true;
      for (const w of waiters) w();
    }
  })();
  const self: Listener = {
    events,
    async until(cond, timeoutMs = 5000) {
      const deadline = Date.now() + timeoutMs;
      while (!cond(events)) {
        if (closed) break;
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`timed out; got: ${events.map((e) => (e.type === "custom" ? `custom:${e.name}` : e.type)).join(", ")}`);
        await new Promise<void>((r) => {
          const done = () => {
            waiters.delete(done);
            clearTimeout(t);
            r();
          };
          const t = setTimeout(done, left);
          waiters.add(done);
        });
      }
      return events;
    },
    close: () => reader.cancel().catch(() => {}),
  };
  // 快照的第一条是运行状态
  await self.until((ev) => ev.length > 0);
  return self;
}

/** 订阅后读到 until 为真再断开（只用于触发动作已经发生在订阅之前、且关心的事件还会到来的场合） */
export async function watch(app: Hono, id: string, until: (events: AgentEvent[]) => boolean, timeoutMs = 5000): Promise<AgentEvent[]> {
  const l = await listen(app, id);
  try {
    return await l.until(until, timeoutMs);
  } finally {
    await l.close();
  }
}

/** 至少跑完 n 轮并回到空闲 */
export const turnsDone = (n: number) => (events: AgentEvent[]) => {
  const ends = events.filter((e) => e.type === "run_end").length;
  return ends >= n && agentIdle(events.at(-1)!) ;
};

export async function transcript(app: Hono, id: string) {
  const r = (await (await req(app, "GET", `/conversations/${id}`)).json()) as {
    transcript: Array<{ role: string; content: Array<{ type: string; text?: string }> }>;
    inbox: { "next-turn": unknown[]; "next-step": unknown[] };
    meta: { title: string };
  };
  return r;
}
export const textOf = (m: { content: Array<{ type: string; text?: string }> }) => m.content.map((b) => b.text ?? "").join("");
