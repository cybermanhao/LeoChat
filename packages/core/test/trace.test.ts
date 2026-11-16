import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ProviderError, defineTool, run, userMessage, type RunOptions } from "../src/index";
import { scriptedProvider, textTurn, toolTurn } from "../src/testing/index";
import { createTraceCollector, GENAI } from "../src/trace/index";

async function traced(opts: RunOptions<unknown>) {
  const t = createTraceCollector({ system: "scripted", model: "m", agentName: "test" });
  for await (const e of run(opts)) t.push(e);
  return t.finish();
}

const weather = defineTool({ name: "get_weather", description: "", input: z.object({ city: z.string() }), execute: ({ city }) => ({ content: city }) });

describe("createTraceCollector", () => {
  it("builds agent → chat → tool spans with usage and first-token time", async () => {
    const trace = await traced({
      provider: scriptedProvider([toolTurn([{ id: "c1", name: "get_weather", args: { city: "A" } }], "Checking. "), textTurn("Done.")]),
      model: "m",
      messages: [userMessage("x")],
      tools: [weather],
    });
    const kinds = trace.spans.map((s) => s.kind);
    expect(kinds.filter((k) => k === "agent")).toHaveLength(1);
    expect(kinds.filter((k) => k === "chat")).toHaveLength(2);
    expect(kinds.filter((k) => k === "tool")).toHaveLength(1);
    const agent = trace.spans.find((s) => s.kind === "agent")!;
    const chat = trace.spans.find((s) => s.kind === "chat")!;
    const tool = trace.spans.find((s) => s.kind === "tool")!;
    expect(chat.parentId).toBe(agent.id);
    expect(tool.parentId).toBe(chat.id);
    expect(tool.attributes[GENAI.TOOL]).toBe("get_weather");
    expect(chat.attributes[GENAI.IN]).toBe(10);
    expect(trace.ttftMs).not.toBeNull();
    expect(trace.spans.every((s) => s.endMs !== null)).toBe(true);
    expect(trace.usage.inputTokens).toBe(20);
  });

  it("marks failed tools and failed chat steps as errors", async () => {
    const t1 = await traced({
      provider: scriptedProvider([toolTurn([{ id: "c1", name: "missing", args: {} }]), textTurn("ok")]),
      model: "m",
      messages: [userMessage("x")],
    });
    expect(t1.spans.find((s) => s.kind === "tool")).toMatchObject({ status: "error", attributes: { [GENAI.TOOL]: "missing" } });

    const t2 = await traced({ provider: scriptedProvider([{ error: new ProviderError("auth", "bad key") }]), model: "m", messages: [userMessage("x")] });
    expect(t2.spans.find((s) => s.kind === "chat")!.status).toBe("error");
    expect(t2.spans.find((s) => s.kind === "agent")!.status).toBe("ok");
  });
});
