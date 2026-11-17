/**
 * /loop：定时提醒到期送进会话（空闲时开一次运行，运行中时排进去），watch 长连接收到 server 发起的运行。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { conversationLog } from "@leochat/node";
import type { AgentEvent } from "@leochat/core";
import { createRoutes } from "../routes/index.js";
import type { ServerContext } from "../server.js";
import type { StreamCallbacks } from "../services/llm.js";

type Round = (cbs: StreamCallbacks) => Promise<void>;
let dir: string;
let requests: Array<{ model?: string; messages: Array<{ role: string; content: string }> }>;

function appWith(rounds: Round[]) {
  let i = 0;
  requests = [];
  const llm = {
    streamChat: vi.fn(async (req: { model?: string; messages: Array<{ role: string; content: string }> }, cbs: StreamCallbacks) => {
      requests.push(structuredClone(req));
      const r = rounds[i++];
      if (!r) throw new Error("no more scripted rounds");
      await r(cbs);
    }),
    chat: vi.fn(),
  };
  const context = {
    sessionManager: { getToolsForLLM: () => [], callTool: vi.fn() },
    startTime: Date.now(),
    pendingApprovals: new Map(),
    conversations: conversationLog(join(dir, "conversations")),
    schedulesFile: join(dir, "schedules.json"),
  } as unknown as ServerContext;
  const app = new Hono();
  app.route("/api", createRoutes(context, llm as never));
  return app;
}
const req = (app: Hono, method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const text = (s: string): Round => async (cbs) => {
  await cbs.onChunk({ content: s, index: 0 });
  await cbs.onComplete({ id: "a", role: "assistant", content: s, timestamp: 1 });
};
const newConv = async (app: Hono) => ((await (await req(app, "POST", "/conversations", {})).json()) as { id: string }).id;
const transcriptOf = async (app: Hono, id: string) =>
  ((await (await req(app, "GET", `/conversations/${id}`)).json()) as { transcript: Array<{ role: string; content: Array<{ type: string; text?: string }> }> }).transcript;
const textOf = (m: { content: Array<{ type: string; text?: string }> }) => m.content.map((b) => b.text ?? "").join("");

/** 读 watch 流直到出现 run_end（或超时），然后断开 */
async function watchUntilRunEnd(res: Response, timeoutMs = 5000): Promise<AgentEvent[]> {
  const reader = res.body!.getReader();
  const dec = new TextDecoder();
  const events: AgentEvent[] = [];
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (line) events.push(JSON.parse(line.slice(6)) as AgentEvent);
    }
    if (events.some((e) => e.type === "run_end")) break;
  }
  await reader.cancel();
  return events;
}

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leochat-schedule-routes-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("/loop schedules", () => {
  it("a due reminder starts a run in an idle conversation, with the saved settings, and watchers see it live", async () => {
    const app = appWith([text("Good morning! Here is your summary.")]);
    const id = await newConv(app);
    const watch = await req(app, "GET", `/conversations/${id}/watch`);
    const created = await req(app, "POST", `/conversations/${id}/schedules`, {
      prompt: "Summarize my day",
      rule: { kind: "once", at: Date.now() + 300 },
      settings: { model: "deepseek-chat", maxSteps: 3 },
    });
    expect(created.status).toBe(200);
    const events = await watchUntilRunEnd(watch);
    const um = events.find((e) => e.type === "user_message") as { message: { content: Array<{ text: string }> } };
    expect(um.message.content[0]!.text).toMatch(/^\[定时提醒\][\s\S]*Summarize my day/);
    expect(events.some((e) => e.type === "block_delta")).toBe(true);
    expect(requests[0]!.model).toBe("deepseek-chat"); // 用保存的设置运行
    await vi.waitFor(async () => {
      const t = await transcriptOf(app, id);
      expect(t.map((m) => m.role)).toEqual(["user", "assistant"]);
    });
    // 一次性提醒投递后结束
    expect(((await (await req(app, "GET", `/schedules?conversationId=${id}`)).json()) as { schedules: unknown[] }).schedules).toHaveLength(0);
  });

  it("a reminder that fires during a run is queued into that run", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const app = appWith([
      async (cbs) => {
        await cbs.onChunk({ content: "long answer", index: 0 });
        await gate;
        await cbs.onComplete({ id: "a", role: "assistant", content: "long answer", timestamp: 1 });
      },
      text("Reminder handled."),
    ]);
    const id = await newConv(app);
    const running = req(app, "POST", `/conversations/${id}/runs`, { text: "start" });
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    await req(app, "POST", `/conversations/${id}/schedules`, { prompt: "drink water", rule: { kind: "once", at: Date.now() + 200 } });
    await new Promise((r) => setTimeout(r, 500));
    release();
    const body = await (await running).text();
    expect(body).toContain("drink water"); // queued + user_message 事件进了这次运行的流
    const t = await transcriptOf(app, id);
    expect(t.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(textOf(t[2]!)).toContain("[定时提醒]");
  });

  it("the model can create a reminder with schedule_create; the run's settings are saved with it", async () => {
    const app = appWith([
      async (cbs) => {
        await cbs.onToolCall({ id: "s1", name: "schedule_create", arguments: { prompt: "Check the news", kind: "daily", time: "08:30" }, status: "pending" });
        await cbs.onComplete({ id: "a", role: "assistant", content: "", timestamp: 1 });
      },
      text("Done, I will remind you every day at 08:30."),
    ]);
    const id = await newConv(app);
    await (await req(app, "POST", `/conversations/${id}/runs`, { text: "remind me daily at 8:30 to check the news", model: "deepseek-reasoner" })).text();
    const list = ((await (await req(app, "GET", `/schedules?conversationId=${id}`)).json()) as {
      schedules: Array<{ id: string; rule: unknown; settings: { model?: string } }>;
    }).schedules;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ rule: { kind: "daily", time: "08:30" }, settings: { model: "deepseek-reasoner" } });

    // 删除会话时一并删除它的提醒
    await req(app, "DELETE", `/conversations/${id}`);
    expect(((await (await req(app, "GET", "/schedules")).json()) as { schedules: unknown[] }).schedules).toHaveLength(0);
  });

  it("validates input", async () => {
    const app = appWith([]);
    const id = await newConv(app);
    expect((await req(app, "POST", `/conversations/${id}/schedules`, { prompt: "x" })).status).toBe(400);
    expect((await req(app, "POST", `/conversations/${id}/schedules`, { prompt: "x", rule: { kind: "interval", everySeconds: 5 } })).status).toBe(400);
    expect((await req(app, "POST", "/conversations/conv_missing/schedules", { prompt: "x", rule: { kind: "daily", time: "09:00" } })).status).toBe(404);
    expect((await req(app, "DELETE", "/schedules/sched_missing")).status).toBe(404);
    const ok = await req(app, "POST", `/conversations/${id}/schedules`, { prompt: "x", rule: { kind: "daily", time: "09:00" } });
    const s = ((await ok.json()) as { schedule: { id: string } }).schedule;
    expect((await req(app, "DELETE", `/schedules/${s.id}`)).status).toBe(200);
  });
});
