import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool, run, userMessage, type AgentEvent, type Message, type ToolResultBlock } from "../src/index";
import { scriptedProvider, textTurn, toolTurn } from "../src/testing/index";

const search = defineTool({ name: "search", description: "", input: z.object({ q: z.string(), n: z.number().optional() }), execute: () => ({ content: "no results" }) });
const resultsText = (transcript: Message[]) =>
  transcript.filter((m) => m.role === "tool").map((m) => (m.content[0] as ToolResultBlock).content.map((c) => (c.type === "text" ? c.text : "")).join(""));

describe("repeat tool reminder (dsh-style)", () => {
  it("reminds gently at the 3rd identical call and in detail at the 5th; key order does not matter", async () => {
    const same = (i: number) => toolTurn([{ id: `c${i}`, name: "search", args: i % 2 ? '{"q":"x","n":1}' : '{"n":1,"q":"x"}' }]);
    const provider = scriptedProvider([same(1), same(2), same(3), same(4), same(5), textTurn("giving up")]);
    const events: AgentEvent[] = [];
    const h = run({ provider, model: "m", messages: [userMessage("find x")], tools: [search] });
    for await (const e of h) events.push(e);
    const texts = resultsText((await h.result).transcript);
    expect(texts[0]).toBe("no results");
    expect(texts[1]).toBe("no results");
    expect(texts[2]).toContain("You are repeating the exact same tool call");
    expect(texts[3]).toBe("no results");
    expect(texts[4]).toContain("Repeated tool call detected");
    expect(texts[4]).toContain("consecutive_calls: 5");
    expect(events.filter((e) => e.type === "custom" && e.name === "leochat.repeat_tool_reminder")).toHaveLength(2);
  });

  it("a different call breaks the chain", async () => {
    const provider = scriptedProvider([
      toolTurn([{ id: "c1", name: "search", args: { q: "x" } }]),
      toolTurn([{ id: "c2", name: "search", args: { q: "x" } }]),
      toolTurn([{ id: "c3", name: "search", args: { q: "y" } }]),
      toolTurn([{ id: "c4", name: "search", args: { q: "y" } }]),
      textTurn("ok"),
    ]);
    const r = await run({ provider, model: "m", messages: [userMessage("x")], tools: [search] }).result;
    expect(resultsText(r.transcript).every((t) => t === "no results")).toBe(true);
  });

  it("can be disabled or excluded per tool", async () => {
    const turns = () => [1, 2, 3].map((i) => toolTurn([{ id: `c${i}`, name: "search", args: { q: "x" } }])).concat([textTurn("ok")]);
    const off = await run({ provider: scriptedProvider(turns()), model: "m", messages: [userMessage("x")], tools: [search], repeatToolReminder: false }).result;
    expect(resultsText(off.transcript)[2]).toBe("no results");
    const excluded = await run({
      provider: scriptedProvider(turns()),
      model: "m",
      messages: [userMessage("x")],
      tools: [search],
      repeatToolReminder: { exclude: ["sea*"] },
    }).result;
    expect(resultsText(excluded.transcript)[2]).toBe("no results");
    const bad = await run({ provider: scriptedProvider([]), model: "m", messages: [], repeatToolReminder: { thresholds: [1] } }).result;
    expect(bad.reason).toBe("error");
    expect(bad.error?.kind).toBe("config");
  });
});
