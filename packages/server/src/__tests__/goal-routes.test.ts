/**
 * /goal 接口：创建、自动推进、暂停、连上正在运行的驱动、无人值守拒绝审批。
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
let pending: Map<string, (ok: boolean) => void>;
let callTool: ReturnType<typeof vi.fn>;

function appWith(rounds: Round[]) {
  let i = 0;
  const llm = {
    streamChat: vi.fn(async (_req: unknown, cbs: StreamCallbacks) => {
      const r = rounds[i++];
      if (!r) throw new Error("no more scripted rounds");
      await r(cbs);
    }),
    chat: vi.fn(),
  };
  callTool = vi.fn(async () => "ran");
  const context = {
    sessionManager: {
      getToolsForLLM: () => [{ type: "function", function: { name: "bash", description: "", parameters: { type: "object" } } }],
      callTool,
    },
    startTime: Date.now(),
    pendingApprovals: pending,
    conversations: conversationLog(join(dir, "conversations")),
  } as unknown as ServerContext;
  const app = new Hono();
  app.route("/api", createRoutes(context, llm as never));
  return app;
}
const req = (app: Hono, method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
async function events(res: Response): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for (const line of (await res.text()).split("\n")) if (line.startsWith("data: ")) out.push(JSON.parse(line.slice(6)) as AgentEvent);
  return out;
}
const text = (s: string): Round => async (cbs) => {
  await cbs.onChunk({ content: s, index: 0 });
  await cbs.onComplete({ id: "a", role: "assistant", content: s, timestamp: 1 });
};
const tool = (id: string, name: string, args: Record<string, unknown>): Round => async (cbs) => {
  await cbs.onToolCall({ id, name, arguments: args, status: "pending" });
  await cbs.onComplete({ id: "a", role: "assistant", content: "", timestamp: 1 });
};
const newConv = async (app: Hono) => ((await (await req(app, "POST", "/conversations", {})).json()) as { id: string }).id;
const getGoal = async (app: Hono, id: string) =>
  (await (await req(app, "GET", `/conversations/${id}/goal`)).json()) as { goal: { revision: number; phase: string } | null; running: boolean };

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leochat-goal-test-"));
  pending = new Map();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("/goal API", () => {
  it("creates a goal, runs rounds until the model completes it, and persists everything", async () => {
    const app = appWith([text("Working on it."), tool("g1", "update_goal", { action: "complete" }), text("All done.")]);
    const id = await newConv(app);
    const created = await req(app, "POST", `/conversations/${id}/goal`, { objective: "Write the summary", maxRounds: 5 });
    expect(((await created.json()) as { goal: { phase: string } }).goal.phase).toBe("active");

    const evs = await events(await req(app, "POST", `/conversations/${id}/goal/run`, {}));
    expect(evs.filter((e) => e.type === "custom" && e.name === "goal_round")).toHaveLength(2);
    const lastGoal = evs.filter((e) => e.type === "custom" && e.name === "goal").at(-1) as { data: { phase: string } };
    expect(lastGoal.data.phase).toBe("complete");

    const conv = (await (await req(app, "GET", `/conversations/${id}`)).json()) as {
      meta: { title: string };
      goal: { phase: string; roundsStarted: number };
      goalRunning: boolean;
      transcript: Array<{ role: string }>;
    };
    expect(conv.goal).toMatchObject({ phase: "complete", roundsStarted: 2 });
    expect(conv.goalRunning).toBe(false);
    expect(conv.meta.title).toBe("目标：Write the summary");
    expect(conv.transcript.filter((m) => m.role === "user")).toHaveLength(2); // 两条 goal_round 提示
  });

  it("denies bash in goal rounds without asking (unattended)", async () => {
    const app = appWith([tool("b1", "bash", { command: "del /s *" }), text("Could not run it."), tool("g", "update_goal", { action: "complete" }), text("ok")]);
    const id = await newConv(app);
    await req(app, "POST", `/conversations/${id}/goal`, { objective: "Clean the disk" });
    const evs = await events(await req(app, "POST", `/conversations/${id}/goal/run`, {}));
    expect(callTool).not.toHaveBeenCalled();
    expect(pending.size).toBe(0);
    expect(evs.some((e) => e.type === "approval_request")).toBe(false);
    expect(evs.find((e) => e.type === "tool_end")).toMatchObject({ callId: "b1", ok: false });
  });

  it("pause stops the running round, a second client attaches to the running driver, and other runs are refused", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const app = appWith([
      async (cbs) => {
        await cbs.onChunk({ content: "thinking", index: 0 });
        await gate;
        await cbs.onComplete({ id: "a", role: "assistant", content: "thinking", timestamp: 1 });
      },
    ]);
    const id = await newConv(app);
    const g = ((await (await req(app, "POST", `/conversations/${id}/goal`, { objective: "Long task" })).json()) as { goal: { revision: number } }).goal;
    const first = req(app, "POST", `/conversations/${id}/goal/run`, {});
    await vi.waitFor(async () => expect((await getGoal(app, id)).running).toBe(true));
    const attached = req(app, "POST", `/conversations/${id}/goal/run`, {}); // 连上，不是 409
    expect((await req(app, "POST", `/conversations/${id}/runs`, { text: "hi" })).status).toBe(409);

    const current = (await getGoal(app, id)).goal!;
    expect(current.revision).toBeGreaterThan(g.revision); // 已开始第 1 轮
    expect((await req(app, "PATCH", `/conversations/${id}/goal`, { action: "pause", revision: g.revision })).status).toBe(409); // 旧 revision
    const paused = await req(app, "PATCH", `/conversations/${id}/goal`, { action: "pause", revision: current.revision });
    expect((await paused.json()) as object).toMatchObject({ goal: { phase: "paused" }, running: false });
    release();
    const [a, b] = await Promise.all([events(await first), events(await attached)]);
    expect(a.some((e) => e.type === "run_end")).toBe(true);
    expect(b[0]).toMatchObject({ type: "custom", name: "goal" }); // 连上时先收到当前目标
    // 暂停后可以恢复
    const latest = (await getGoal(app, id)).goal!;
    const resumed = await req(app, "PATCH", `/conversations/${id}/goal`, { action: "resume", revision: latest.revision });
    expect(((await resumed.json()) as { goal: { phase: string } }).goal.phase).toBe("active");
  });

  it("validates input and state", async () => {
    const app = appWith([]);
    const id = await newConv(app);
    expect((await req(app, "POST", `/conversations/${id}/goal`, { objective: "  " })).status).toBe(400);
    expect((await req(app, "POST", `/conversations/${id}/goal/run`, {})).status).toBe(409); // 没有目标
    await req(app, "POST", `/conversations/${id}/goal`, { objective: "A" });
    expect((await req(app, "POST", `/conversations/${id}/goal`, { objective: "B" })).status).toBe(409);
    expect((await req(app, "PATCH", `/conversations/${id}/goal`, { action: "nope", revision: 1 })).status).toBe(400);
    expect((await req(app, "GET", "/conversations/conv_missing/goal")).status).toBe(404);
    const cleared = await req(app, "PATCH", `/conversations/${id}/goal`, { action: "clear", revision: 1 });
    expect(((await cleared.json()) as { goal: unknown }).goal).toBeNull();
  });
});
