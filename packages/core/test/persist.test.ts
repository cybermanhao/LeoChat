import { describe, expect, it } from "vitest";
import { z } from "zod";
import { applyTranscriptOps, createCompactor, defineTool, run, userMessage, type TranscriptOp } from "../src/index";
import { DEFAULT_TEST_CAPABILITIES, scriptedProvider, textTurn, toolTurn } from "../src/testing/index";

describe("persist hook (dsh-style checkpoints)", () => {
  it("persists the tool call before the tool runs, and results before the next request; ops replay to the final transcript", async () => {
    const log: string[] = [];
    const ops: TranscriptOp[] = [];
    const tool = defineTool({
      name: "side_effect",
      description: "",
      input: z.object({}),
      execute: () => (log.push("execute"), { content: "done" }),
    });
    const base = scriptedProvider([toolTurn([{ id: "c1", name: "side_effect", args: {} }], "Doing it."), textTurn("All done.")]);
    const provider = { ...base, stream: (req: Parameters<typeof base.stream>[0], s?: AbortSignal) => (log.push(`request:${req.messages.length}`), base.stream(req, s)) };
    const initial = [userMessage("go")];
    const r = await run({
      provider,
      model: "m",
      messages: initial,
      tools: [tool],
      persist: async (op) => {
        ops.push(op);
        log.push(op.kind === "append" ? `persist:${op.message.role}` : "persist:reset");
      },
    }).result;
    expect(r.reason).toBe("completed");
    expect(log).toEqual(["request:1", "persist:assistant", "execute", "persist:tool", "request:3", "persist:assistant"]);
    expect(applyTranscriptOps(initial, ops)).toEqual(r.transcript);
  });

  it("a failed write stops the run before any side effect (fail closed)", async () => {
    let executed = false;
    const tool = defineTool({ name: "t", description: "", input: z.object({}), execute: () => ((executed = true), { content: "x" }) });
    const r = await run({
      provider: scriptedProvider([toolTurn([{ id: "c1", name: "t", args: {} }]), textTurn("x")]),
      model: "m",
      messages: [userMessage("go")],
      tools: [tool],
      persist: async () => {
        throw new Error("disk full");
      },
    }).result;
    expect(r.reason).toBe("error");
    expect(r.error).toEqual({ kind: "persist", message: "disk full" });
    expect(executed).toBe(false);
  });

  it("compaction is persisted as a reset op", async () => {
    const ops: TranscriptOp[] = [];
    const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
    const history = Array.from({ length: 10 }, (_, i) => (i % 2 ? { id: `a${i}`, role: "assistant" as const, content: [{ type: "text" as const, text: words(150) }] } : userMessage(words(150), `u${i}`)));
    const provider = scriptedProvider([textTurn("summary"), textTurn("answer")], { capabilities: { ...DEFAULT_TEST_CAPABILITIES, contextWindow: 2000, maxOutput: 200 } });
    const initial = [...history, userMessage("continue")];
    const r = await run({
      provider,
      model: "m",
      messages: initial,
      compactor: createCompactor({ headroomTokens: 0, retainRatio: 0.2 }),
      persist: async (op) => void ops.push(op),
    }).result;
    expect(ops.map((o) => o.kind)).toEqual(["reset", "append"]);
    expect(applyTranscriptOps(initial, ops)).toEqual(r.transcript);
  });
});
