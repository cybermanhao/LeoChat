import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  GoalError,
  ProviderError,
  UNATTENDED_APPROVAL_MESSAGE,
  defineTool,
  goalController,
  memoryGoalStore,
  parseGoalRoundMessage,
  replayGoal,
  runGoal,
  userMessage,
  type AgentEvent,
  type ToolResultBlock,
  type TranscriptOp,
} from "../src/index";
import { scriptedProvider, textTurn, toolTurn } from "../src/testing/index";

const ref = (g: { id: string; revision: number }) => ({ id: g.id, revision: g.revision });

describe("goal controller", () => {
  it("runs the lifecycle, rejects stale refs and replays to the same state", async () => {
    const store = memoryGoalStore();
    const goals = await goalController(store);
    const g1 = await goals.create({ objective: "  migrate the docs  " });
    expect(g1).toMatchObject({ objective: "migrate the docs", phase: "active", revision: 1, roundsStarted: 0, maxRounds: 256 });
    await expect(goals.create({ objective: "another" })).rejects.toMatchObject({ code: "goal_exists" });

    const g2 = await goals.admitRound(ref(g1));
    expect(g2.roundsStarted).toBe(1);
    await expect(goals.pause(ref(g1))).rejects.toMatchObject({ code: "stale" });
    const g3 = await goals.pause(ref(g2));
    const g4 = await goals.edit(ref(g3), { maxRounds: 1 });
    await expect(goals.resume(ref(g4))).rejects.toMatchObject({ code: "invalid_transition" }); // 没有剩余轮数
    const g5 = await goals.edit(ref(g4), { maxRounds: 5, objective: "migrate all docs" });
    const g6 = await goals.resume(ref(g5));
    const g7 = await goals.block(ref(g6), { code: "model-reported", reason: "no access" });
    expect(g7.blocker).toEqual({ code: "model-reported", reason: "no access" });
    const g8 = await goals.resume(ref(g7));
    expect(g8.blocker).toBeUndefined(); // 恢复时清除障碍
    const g9 = await goals.complete(ref(g8));
    expect(g9.phase).toBe("complete");

    expect(replayGoal(store.records)).toEqual(goals.get());
    const reopened = await goalController(store);
    expect(reopened.get()).toEqual(g9);
    const next = await reopened.create({ objective: "next goal", maxRounds: 3 }); // 完成后可以换新目标
    await reopened.clear(ref(next));
    expect(reopened.get()).toBeNull();
    expect(replayGoal(store.records)).toBeNull();
  });

  it("validates input and refuses tampered logs", async () => {
    const goals = await goalController(memoryGoalStore());
    await expect(goals.create({ objective: " " })).rejects.toBeInstanceOf(GoalError);
    await expect(goals.create({ objective: "x", maxRounds: 0 })).rejects.toMatchObject({ code: "invalid_input" });

    const store = memoryGoalStore();
    const c = await goalController(store);
    const g = await c.create({ objective: "x" });
    await c.admitRound(ref(g));
    const tampered = structuredClone(store.records);
    tampered[1]!.goal!.roundsStarted = 5;
    expect(() => replayGoal(tampered)).toThrow(/rounds out of sequence/);
    const skipped = [store.records[0]!, { ...store.records[1]!, goal: { ...store.records[1]!.goal!, revision: 3 } }];
    expect(() => replayGoal(skipped)).toThrow(/discontinuous/);
  });
});

async function drain(h: AsyncIterable<AgentEvent>) {
  const out: AgentEvent[] = [];
  for await (const e of h) out.push(e);
  return out;
}

describe("runGoal", () => {
  it("runs rounds until the model marks the goal complete, persisting each round prompt", async () => {
    const goals = await goalController(memoryGoalStore());
    await goals.create({ objective: "write a haiku" });
    const ops: TranscriptOp[] = [];
    const provider = scriptedProvider([
      textTurn("Drafting a first version."),
      toolTurn([{ id: "c1", name: "update_goal", args: { action: "complete" } }]),
      textTurn("Done: the haiku is written."),
    ]);
    const h = runGoal({ provider, model: "m", messages: [userMessage("hi", "u0")], goals, persist: async (op) => void ops.push(op) });
    const events = await drain(h);
    const r = await h.result;
    expect(r).toMatchObject({ reason: "complete", rounds: 2 });
    expect(r.goal).toMatchObject({ phase: "complete", roundsStarted: 2 });
    const roundMsgs = r.transcript.filter((m) => parseGoalRoundMessage(m));
    expect(roundMsgs.map((m) => parseGoalRoundMessage(m))).toEqual([
      { round: 1, maxRounds: 256, objective: "write a haiku" },
      { round: 2, maxRounds: 256, objective: "write a haiku" },
    ]);
    expect(events.filter((e) => e.type === "custom" && e.name === "goal_round")).toHaveLength(2);
    expect(events.filter((e) => e.type === "run_start")).toHaveLength(2);
    expect(events.some((e) => e.type === "custom" && e.name === "goal" && (e.data as { phase: string }).phase === "complete")).toBe(true);
    // 每轮的提示词在 run() 之前已写盘
    expect(ops.filter((o) => o.kind === "append" && parseGoalRoundMessage(o.message))).toHaveLength(2);
  });

  it("only accepts blocked after the same obstacle persists for 3 consecutive rounds", async () => {
    const goals = await goalController(memoryGoalStore());
    await goals.create({ objective: "deploy", maxRounds: 10 });
    const blockedRound = () => [toolTurn([{ id: "b", name: "update_goal", args: { action: "blocked", reason: "no credentials" } }]), textTurn("stuck")];
    const provider = scriptedProvider([...blockedRound(), ...blockedRound(), ...blockedRound()]);
    const h = runGoal({ provider, model: "m", messages: [], goals });
    await drain(h);
    const r = await h.result;
    expect(r).toMatchObject({ reason: "blocked", rounds: 3 });
    expect(r.goal!.blocker).toEqual({ code: "model-reported", reason: "no credentials" });
    const results = r.transcript.flatMap((m) => m.content).filter((b): b is ToolResultBlock => b.type === "tool_result");
    expect(results.map((b) => b.isError ?? false)).toEqual([true, true, false]);
  });

  it("blocks with round-limit when the rounds run out", async () => {
    const goals = await goalController(memoryGoalStore());
    await goals.create({ objective: "endless", maxRounds: 2 });
    const h = runGoal({ provider: scriptedProvider([textTurn("a"), textTurn("b")]), model: "m", messages: [], goals });
    await drain(h);
    const r = await h.result;
    expect(r).toMatchObject({ reason: "blocked", rounds: 2 });
    expect(r.goal!.blocker!.code).toBe("round-limit");
  });

  it("denies tools that need approval: goal rounds are unattended", async () => {
    const goals = await goalController(memoryGoalStore());
    await goals.create({ objective: "clean up", maxRounds: 1 });
    let ran = false;
    const bash = defineTool({ name: "bash", description: "", input: z.object({}), needsApproval: true, execute: () => ((ran = true), { content: "x" }) });
    const h = runGoal({ provider: scriptedProvider([toolTurn([{ id: "b1", name: "bash", args: {} }]), textTurn("ok")]), model: "m", messages: [], goals, tools: [bash] });
    await drain(h);
    const r = await h.result;
    expect(ran).toBe(false);
    const result = r.transcript.flatMap((m) => m.content).find((b): b is ToolResultBlock => b.type === "tool_result")!;
    expect(JSON.stringify(result.content)).toContain(UNATTENDED_APPROVAL_MESSAGE.slice(0, 40));
  });

  it("stop('pause') aborts the current round and pauses the goal", async () => {
    const goals = await goalController(memoryGoalStore());
    await goals.create({ objective: "long task" });
    const h = runGoal({ provider: scriptedProvider([textTurn("a very long answer that streams slowly", { chunkSize: 2, delayMs: 20 })]), model: "m", messages: [], goals });
    const events: AgentEvent[] = [];
    for await (const e of h) {
      events.push(e);
      if (e.type === "block_delta") h.stop("pause");
    }
    const r = await h.result;
    expect(r.reason).toBe("paused");
    expect(goals.get()!.phase).toBe("paused");
  });

  it("an aborted round (user cancel) pauses the goal instead of starting another round", async () => {
    const goals = await goalController(memoryGoalStore());
    await goals.create({ objective: "task" });
    const h = runGoal({
      provider: scriptedProvider([textTurn("streaming for a while", { chunkSize: 2, delayMs: 20 })]),
      model: "m",
      messages: [],
      goals,
      onRound: (round) => setTimeout(() => round.abort("user"), 30),
    });
    await drain(h);
    expect((await h.result).reason).toBe("paused");
    expect(goals.get()!.phase).toBe("paused");
  });

  it("a failed round blocks the goal with code error", async () => {
    const goals = await goalController(memoryGoalStore());
    await goals.create({ objective: "task" });
    const h = runGoal({ provider: scriptedProvider([{ error: new ProviderError("auth", "bad key") }]), model: "m", messages: [], goals });
    await drain(h);
    const r = await h.result;
    expect(r.reason).toBe("error");
    expect(r.goal!.blocker).toMatchObject({ code: "error" });
  });

  it("does nothing for a goal that is not active", async () => {
    const goals = await goalController(memoryGoalStore());
    const g = await goals.create({ objective: "task" });
    await goals.pause(ref(g));
    const provider = scriptedProvider([]);
    const h = runGoal({ provider, model: "m", messages: [], goals });
    await drain(h);
    expect((await h.result).reason).toBe("paused");
    expect(provider.requests).toHaveLength(0);
  });
});

describe("approval policy allow", () => {
  it("runs tools that need approval without emitting an approval request", async () => {
    const { run } = await import("../src/index");
    let ran = false;
    const bash = defineTool({ name: "bash", description: "", input: z.object({}), needsApproval: true, execute: () => ((ran = true), { content: "x" }) });
    const h = run({ provider: scriptedProvider([toolTurn([{ id: "b1", name: "bash", args: {} }]), textTurn("ok")]), model: "m", messages: [userMessage("go")], tools: [bash], approval: { policy: "allow" } });
    const events = await drain(h);
    expect(ran).toBe(true);
    expect(events.some((e) => e.type === "approval_request")).toBe(false);
    expect(events.find((e) => e.type === "approval_resolved")).toMatchObject({ outcome: "allowed-once", automatic: true });
  });
});
