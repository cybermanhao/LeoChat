import { describe, expect, it } from "vitest";
import type { ViewMessage, ViewPart } from "@leochat/core/view";
import { groupTurns, reuseTurns, splitTurn, summarize, summaryText } from "../turn/group";

const user = (id: string, text: string): ViewMessage => ({ id, role: "user", parts: [{ type: "text", text, streaming: false }] });
const asst = (id: string, parts: ViewPart[]): ViewMessage => ({ id, role: "assistant", parts });
const text = (t: string): ViewPart => ({ type: "text", text: t, streaming: false });
const think = (t: string): ViewPart => ({ type: "reasoning", text: t, streaming: false });
const bash = (id: string, command: string, ms = 200): ViewPart => ({
  type: "tool",
  callId: id,
  name: "bash",
  state: "output-available",
  input: { command },
  ms,
});

describe("groupTurns", () => {
  it("starts a turn at each user message and collects the assistant steps after it", () => {
    const turns = groupTurns([
      user("u1", "hi"),
      asst("a1", [text("hello")]),
      user("u2", "run it"),
      asst("a2", [bash("c1", "ls")]),
      asst("a3", [text("done")]),
    ]);
    expect(turns.map((t) => [t.user?.id, t.assistant.map((m) => m.id)])).toEqual([
      ["u1", ["a1"]],
      ["u2", ["a2", "a3"]],
    ]);
  });

  it("keeps a leading assistant message as its own turn", () => {
    const turns = groupTurns([asst("a0", [text("welcome")]), user("u1", "hi")]);
    expect(turns[0]?.key).toBe("a0");
    expect(turns[0]?.user).toBeUndefined();
    expect(turns).toHaveLength(2);
  });
});

describe("splitTurn", () => {
  it("puts thinking, tools and in-between text in the process and keeps the final text as the answer", () => {
    const split = splitTurn([
      asst("a1", [think("plan"), text("let me check"), bash("c1", "echo ok")]),
      asst("a2", [think("got it"), text("The output is ok.")]),
    ]);
    expect(split.process.map((p) => p.type)).toEqual(["reasoning", "note", "tool", "reasoning"]);
    expect(split.answer).toEqual([text("The output is ok.")]);
  });

  it("a plain reply has no process", () => {
    const split = splitTurn([asst("a1", [text("hello")])]);
    expect(split.process).toEqual([]);
    expect(split.answer).toEqual([text("hello")]);
  });
});

describe("summary", () => {
  it("counts steps by kind and adds tool time", () => {
    const split = splitTurn([
      asst("a1", [
        think("x"),
        bash("c1", "a", 1200),
        bash("c2", "b", 300),
        { type: "server_tool", callId: "s1", name: "web_search", input: { action: "search", queries: ["q"] }, results: [] },
        { type: "tool", callId: "c3", name: "update_theme", state: "denied", input: { theme: "dark" } },
      ]),
    ]);
    expect(summaryText(summarize(split.process))).toBe("思考 · 2 条命令 · 搜索 1 次 · 1 个工具 · 1 步失败 · 1.5 秒");
  });
});

describe("reuseTurns", () => {
  it("keeps unchanged turns by reference and replaces the changed one", () => {
    const u1 = user("u1", "a");
    const a1 = asst("a1", [text("b")]);
    const u2 = user("u2", "c");
    const prev = groupTurns([u1, a1, u2]);
    const next = reuseTurns(prev, groupTurns([u1, a1, u2, asst("a2", [text("d")])]));
    expect(next[0]).toBe(prev[0]);
    expect(next[1]).not.toBe(prev[1]);
  });
});
