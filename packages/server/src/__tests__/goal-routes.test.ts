/**
 * /goal 走会话收件箱：处理者空闲时补一条目标轮次提示（dsh goal-round-driver），用户消息优先。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentEvent } from "@leochat/core";
import { agentIdle, gated, isCustom, listen, makeApp, newConv, req, say, text, textOf, tool, transcript } from "./helpers.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leochat-goal-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

type GoalData = { phase: string; revision: number; roundsStarted: number; armed: boolean } | null;
const lastGoal = (events: AgentEvent[]) => (events.filter((e) => isCustom(e, "goal")).at(-1) as { data: GoalData } | undefined)?.data;
const goalSettled = (events: AgentEvent[]) => {
  const g = lastGoal(events);
  return !!g && !g.armed && events.some((e) => e.type === "run_end") && agentIdle(events.at(-1)!);
};
const getGoal = async (app: Parameters<typeof req>[0], id: string) =>
  (await (await req(app, "GET", `/conversations/${id}/goal`)).json()) as { goal: { revision: number; phase: string; roundsStarted: number } | null; armed: boolean };

describe("/goal on the inbox", () => {
  it("creating a goal starts rounds that run until the model completes it", async () => {
    const { app } = makeApp(dir, [text("Working on it."), tool("g1", "update_goal", { action: "complete" }), text("All done.")]);
    const id = await newConv(app);
    const l = await listen(app, id);
    const created = await req(app, "POST", `/conversations/${id}/goal`, { objective: "Write the summary", maxRounds: 5 });
    expect((await created.json()) as object).toMatchObject({ goal: { phase: "active" }, armed: true });
    const events = await l.until(goalSettled);
    expect(events.filter((e) => isCustom(e, "goal_round"))).toHaveLength(2);
    expect(lastGoal(events)).toMatchObject({ phase: "complete", roundsStarted: 2, armed: false });
    const t = await transcript(app, id);
    expect(t.meta.title).toBe("目标：Write the summary");
    expect(t.transcript.filter((m) => m.role === "user").map(textOf).every((x) => x.startsWith("<goal_round>"))).toBe(true);
  });

  it("goal rounds deny bash without asking, unless the goal runs with full access", async () => {
    const ask = makeApp(dir, [tool("b1", "bash", { command: "del x" }), text("could not"), tool("g", "update_goal", { action: "complete" }), text("ok")]);
    const id = await newConv(ask.app);
    const l = await listen(ask.app, id);
    await req(ask.app, "POST", `/conversations/${id}/goal`, { objective: "Clean up" });
    const events = await l.until(goalSettled);
    expect(ask.callTool).not.toHaveBeenCalled();
    expect(ask.pending.size).toBe(0);
    expect(events.some((e) => e.type === "approval_request")).toBe(false);
    expect(events.find((e) => e.type === "tool_end")).toMatchObject({ callId: "b1", ok: false });

    const dir2 = await mkdtemp(join(tmpdir(), "leochat-goal-full-"));
    const full = makeApp(dir2, [tool("b1", "bash", { command: "echo ok" }), tool("g", "update_goal", { action: "complete" }), text("ok")]);
    const id2 = await newConv(full.app);
    const l2 = await listen(full.app, id2);
    await req(full.app, "POST", `/conversations/${id2}/goal`, { objective: "Echo", settings: { permission: "full" } });
    await l2.until(goalSettled);
    expect(full.callTool).toHaveBeenCalledWith("bash", { command: "echo ok" });
    await rm(dir2, { recursive: true, force: true });
  });

  it("a user message sent during a goal round runs before the next goal round", async () => {
    const g = gated("round one");
    const { app, requests } = makeApp(dir, [g.round, text("answer to the user"), tool("c", "update_goal", { action: "complete" }), text("done")]);
    const id = await newConv(app);
    const l = await listen(app, id);
    await req(app, "POST", `/conversations/${id}/goal`, { objective: "Long task" });
    await l.until((ev) => ev.some((e) => e.type === "run_start"));
    await say(app, id, "quick question");
    g.release();
    await l.until(goalSettled);
    const lastUser = (r: (typeof requests)[number]) => r.messages.filter((m) => m.role === "user").at(-1)!.content;
    expect(lastUser(requests[1]!)).toBe("quick question");
    expect(lastUser(requests[2]!)).toMatch(/^<goal_round>[\s\S]*Round: 2\//);
  });

  it("pause aborts the running round and pauses the goal; resume continues it", async () => {
    const g = gated();
    const { app } = makeApp(dir, [g.round, tool("c", "update_goal", { action: "complete" }), text("done")]);
    const id = await newConv(app);
    const l = await listen(app, id);
    const created = (await (await req(app, "POST", `/conversations/${id}/goal`, { objective: "Task" })).json()) as { goal: { revision: number } };
    await l.until((ev) => ev.some((e) => e.type === "run_start"));
    expect((await req(app, "PATCH", `/conversations/${id}/goal`, { action: "pause", revision: created.goal.revision })).status).toBe(409); // 已开始一轮，revision 变了
    const current = await getGoal(app, id);
    const paused = await req(app, "PATCH", `/conversations/${id}/goal`, { action: "pause", revision: current.goal!.revision });
    expect((await paused.json()) as object).toMatchObject({ goal: { phase: "paused" }, armed: false });
    await l.until((ev) => ev.some((e) => e.type === "run_end") && agentIdle(ev.at(-1)!));
    g.release();

    const latest = await getGoal(app, id);
    const resumed = await req(app, "PATCH", `/conversations/${id}/goal`, { action: "resume", revision: latest.goal!.revision });
    expect((await resumed.json()) as object).toMatchObject({ goal: { phase: "active" }, armed: true });
    await vi.waitFor(async () => expect((await getGoal(app, id)).goal!.phase).toBe("complete"), { timeout: 5000 });
  });

  it("stop during a goal round pauses the goal", async () => {
    const g = gated();
    const { app } = makeApp(dir, [g.round]);
    const id = await newConv(app);
    const l = await listen(app, id);
    await req(app, "POST", `/conversations/${id}/goal`, { objective: "Task" });
    await l.until((ev) => ev.some((e) => e.type === "run_start"));
    await req(app, "POST", `/conversations/${id}/stop`);
    await vi.waitFor(async () => expect(await getGoal(app, id)).toMatchObject({ goal: { phase: "paused" }, armed: false }));
    g.release();
  });

  it("validates input and state", async () => {
    const { app } = makeApp(dir, []);
    const id = await newConv(app);
    expect((await req(app, "POST", `/conversations/${id}/goal`, { objective: "  " })).status).toBe(400);
    expect((await req(app, "POST", `/conversations/${id}/goal`, { objective: "x", settings: { permission: "root" } })).status).toBe(400);
    const a = (await (await req(app, "POST", `/conversations/${id}/goal`, { objective: "A", maxRounds: 1 })).json()) as { goal: { revision: number } };
    expect((await req(app, "POST", `/conversations/${id}/goal`, { objective: "B" })).status).toBe(409);
    expect((await req(app, "PATCH", `/conversations/${id}/goal`, { action: "nope", revision: 1 })).status).toBe(400);
    expect((await req(app, "GET", "/conversations/conv_missing/goal")).status).toBe(404);
    expect(a.goal.revision).toBe(1);
    // 没有脚本回答：这一轮出错，目标记为卡住
    await vi.waitFor(async () => expect((await getGoal(app, id)).goal).toMatchObject({ phase: "blocked" }));
    const latest = await getGoal(app, id);
    const cleared = await req(app, "PATCH", `/conversations/${id}/goal`, { action: "clear", revision: latest.goal!.revision });
    expect(((await cleared.json()) as { goal: unknown }).goal).toBeNull();
  });
});
