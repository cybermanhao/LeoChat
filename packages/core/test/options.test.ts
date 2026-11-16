import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ProviderError, defineTool, run, stepCount, textOf, userMessage, type AgentEvent, type RunHandle } from "../src/index";
import { scriptedProvider, textTurn, toolTurn } from "../src/testing/index";
import { initialViewState, reduce } from "../src/view/index";

async function drain(h: RunHandle): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for await (const e of h) out.push(e);
  return out;
}

const weather = defineTool({ name: "get_weather", description: "", input: z.object({ city: z.string() }), execute: ({ city }) => ({ content: city }) });

describe("Q1: steeringMode / followUpMode", () => {
  it("one-at-a-time delivers follow-ups one per turn", async () => {
    const provider = scriptedProvider([textTurn("a", { delayMs: 2 }), textTurn("b"), textTurn("c")]);
    const h = run({ provider, model: "m", messages: [userMessage("x")], followUpMode: "one-at-a-time" });
    h.followUp(userMessage("f1"));
    h.followUp(userMessage("f2"));
    const r = await h.result;
    expect(provider.requests).toHaveLength(3);
    expect(r.transcript.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant"]);
  });

  it("all (default) delivers every queued follow-up in one turn", async () => {
    const provider = scriptedProvider([textTurn("a", { delayMs: 2 }), textTurn("b")]);
    const h = run({ provider, model: "m", messages: [userMessage("x")] });
    h.followUp(userMessage("f1"));
    h.followUp(userMessage("f2"));
    const r = await h.result;
    expect(provider.requests).toHaveLength(2);
    expect(r.transcript.map((m) => m.role)).toEqual(["user", "assistant", "user", "user", "assistant"]);
  });

  it("one-at-a-time steering leaves the rest queued for the next boundary", async () => {
    const gate = { open: () => {} };
    const waiting = new Promise<void>((r) => (gate.open = r));
    const slow = defineTool({ name: "slow", description: "", input: z.object({}), execute: async () => (await waiting, { content: "ok" }) });
    const provider = scriptedProvider([
      toolTurn([{ id: "c1", name: "slow", args: {} }]),
      toolTurn([{ id: "c2", name: "get_weather", args: { city: "A" } }]),
      textTurn("done"),
    ]);
    const h = run({ provider, model: "m", messages: [userMessage("x")], tools: [slow, weather], steeringMode: "one-at-a-time" });
    for await (const e of h) {
      if (e.type === "tool_start" && e.callId === "c1") {
        void h.steer(userMessage("s1"));
        void h.steer(userMessage("s2"));
        gate.open();
      }
    }
    // s1 进入第 2 次请求，s2 进入第 3 次请求
    expect(textOf(provider.requests[1]!.messages.at(-1)!)).toBe("s1");
    expect(textOf(provider.requests[2]!.messages.at(-1)!)).toBe("s2");
  });
});

describe("Q4: finalStepOnStop", () => {
  it("runs one more step without tools after stopping on tool results", async () => {
    const provider = scriptedProvider([toolTurn([{ id: "c1", name: "get_weather", args: { city: "A" } }]), textTurn("Summary: A is fine.")]);
    const r = await run({
      provider,
      model: "m",
      messages: [userMessage("x")],
      tools: [weather],
      stopWhen: stepCount(1),
      finalStepOnStop: true,
    }).result;
    expect(r.reason).toBe("max_steps");
    expect(provider.requests).toHaveLength(2);
    expect(provider.requests[1]!.tools).toBeUndefined(); // 收尾 step 不提供工具
    expect(textOf(r.transcript.at(-1)!)).toBe("Summary: A is fine.");
  });

  it("without the option the run stops right after the tool results", async () => {
    const provider = scriptedProvider([toolTurn([{ id: "c1", name: "get_weather", args: { city: "A" } }]), textTurn("unused")]);
    const r = await run({ provider, model: "m", messages: [userMessage("x")], tools: [weather], stopWhen: stepCount(1) }).result;
    expect(provider.requests).toHaveLength(1);
    expect(r.transcript.at(-1)!.role).toBe("tool");
  });
});

describe("Q2: retryAfterPartialOutput", () => {
  const flaky = () =>
    scriptedProvider([
      { blocks: [{ type: "text", text: "partial answer that breaks" }], chunkSize: 4, failAfterDeltas: 2, failWith: new ProviderError("overloaded", "busy") },
      textTurn("clean answer"),
    ]);
  const retry = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 };

  it("by default does not retry once text has streamed", async () => {
    const r = await run({ provider: flaky(), model: "m", messages: [userMessage("x")], retry }).result;
    expect(r.reason).toBe("error");
  });

  it("when enabled, emits step_reset and the reducer discards the partial text", async () => {
    const h = run({ provider: flaky(), model: "m", messages: [userMessage("x")], retry, retryAfterPartialOutput: true });
    let state = initialViewState([userMessage("x")]);
    const events = await drain(h);
    for (const e of events) state = reduce(state, e);
    const r = await h.result;
    expect(r.reason).toBe("completed");
    expect(events.some((e) => e.type === "step_reset")).toBe(true);
    expect(textOf(r.transcript.at(-1)!)).toBe("clean answer");
    const shown = state.messages.at(-1)!.parts.filter((p) => p.type === "text").map((p) => (p as { text: string }).text);
    expect(shown).toEqual(["clean answer"]);
  });
});
