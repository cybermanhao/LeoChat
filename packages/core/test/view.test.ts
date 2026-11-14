import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  defineTool,
  deferAnswerer,
  memoryStore,
  run,
  userMessage,
  type AgentEvent,
  type Message,
  type RunOptions,
} from "../src/index";
import { scriptedProvider, textTurn, toolTurn } from "../src/testing/index";
import { appendUserMessage, initialViewState, reduce, type RunViewState, type ViewPart } from "../src/view/index";

async function runAndReduce(opts: RunOptions<unknown>) {
  let state = appendUserMessage(initialViewState(), opts.messages.at(-1)!);
  const statuses: string[] = [];
  const h = run(opts);
  for await (const e of h) {
    state = reduce(state, e);
    if (statuses.at(-1) !== state.status) statuses.push(state.status);
  }
  return { state, statuses, result: await h.result };
}

/** 去掉只在流式过程中才有的字段，用于比较"事件重放"与"从 transcript 重建"的结果 */
function normalize(s: RunViewState) {
  return s.messages.map((m) => ({
    role: m.role,
    parts: m.parts.map((p) => {
      const { blockIndex: _b, ...rest } = p as ViewPart & { blockIndex?: number };
      if (rest.type === "tool") {
        const { ms: _ms, progress: _pr, approvalId: _a, approvalReason: _ar, output, ...tool } = rest;
        return { ...tool, isError: output?.isError ?? false };
      }
      return rest;
    }),
  }));
}

const weather = defineTool({
  name: "get_weather",
  description: "w",
  input: z.object({ city: z.string() }),
  execute: ({ city }) => ({ data: { city }, ui: { type: "cards", cards: [{ title: city }] } }),
});

describe("reduce()", () => {
  it("projects a tool round trip into parts and derives statuses", async () => {
    const provider = scriptedProvider([
      { blocks: [{ type: "thinking", text: "need weather" }, { type: "text", text: "Checking. " }, { type: "tool_use", id: "c1", name: "get_weather", arguments: '{"city":"A"}', input: { city: "A" } }] },
      textTurn("18C in A."),
    ]);
    const { state, statuses } = await runAndReduce({ provider, model: "m", messages: [userMessage("weather?")], tools: [weather] });

    expect(state.status).toBe("done");
    expect(state.messages.map((m) => m.role)).toEqual(["user", "assistant", "assistant"]);
    const first = state.messages[1]!.parts;
    expect(first.map((p) => p.type)).toEqual(["reasoning", "text", "tool"]);
    expect(first[2]).toMatchObject({ type: "tool", state: "output-available", input: { city: "A" }, ui: { type: "cards" } });
    expect(first.every((p) => !("streaming" in p) || p.streaming === false)).toBe(true);
    // 状态推导：连接 → 推理 → 生成 → 工具执行 → … → 完成
    expect(statuses).toEqual(expect.arrayContaining(["connecting", "reasoning", "generating", "tool_running", "done"]));
    expect(statuses.indexOf("reasoning")).toBeLessThan(statuses.indexOf("generating"));
    expect(state.usage.inputTokens).toBe(20);
  });

  it("replaying events equals rebuilding from the final transcript", async () => {
    const provider = scriptedProvider([
      toolTurn([{ id: "c1", name: "get_weather", args: { city: "A" } }, { id: "c2", name: "nope", args: {} }], "Hmm. "),
      textTurn("Done."),
    ]);
    const opts = { provider, model: "m", messages: [userMessage("x")], tools: [weather] };
    const { state, result } = await runAndReduce(opts);
    expect(normalize(state)).toEqual(normalize(initialViewState(result.transcript)));
    expect(state.messages[1]!.parts.find((p) => p.type === "tool" && p.callId === "c2")).toMatchObject({ state: "output-error" });
  });

  it("shows approval waiting, then denial", async () => {
    const send = defineTool({
      name: "send",
      description: "",
      input: z.object({}),
      needsApproval: () => "Sends an email",
      execute: () => ({ content: "sent" }),
    });
    let deny: (o: "rejected") => void = () => {};
    const answer = new Promise<"rejected">((r) => (deny = r));
    const provider = scriptedProvider([toolTurn([{ id: "c1", name: "send", args: {} }]), textTurn("ok")]);
    let state = initialViewState([userMessage("x")]);
    let sawAwaiting = false;
    const h = run({ provider, model: "m", messages: [userMessage("x")], tools: [send], approval: { answerers: [() => answer] } });
    for await (const e of h) {
      state = reduce(state, e);
      if (e.type === "approval_request") {
        expect(state.status).toBe("awaiting_approval");
        expect(state.messages.at(-1)!.parts[0]).toMatchObject({ state: "awaiting-approval", approvalReason: "Sends an email" });
        sawAwaiting = true;
        deny("rejected");
      }
    }
    expect(sawAwaiting).toBe(true);
    expect(state.messages[1]!.parts[0]).toMatchObject({ type: "tool", state: "denied" });
  });

  it("paused runs end in awaiting_approval with pending ids for the UI", async () => {
    const send = defineTool({ name: "send", description: "", input: z.object({}), needsApproval: true, execute: () => ({ content: "x" }) });
    const { state } = await runAndReduce({
      provider: scriptedProvider([toolTurn([{ id: "c1", name: "send", args: {} }])]),
      model: "m",
      messages: [userMessage("x")],
      tools: [send],
      approval: { answerers: [deferAnswerer] },
      store: memoryStore(),
    });
    expect(state.status).toBe("awaiting_approval");
    expect(state.pending).toHaveLength(1);
    expect(state.messages[1]!.parts[0]).toMatchObject({ state: "awaiting-approval", approvalId: state.pending![0]!.approvalId });
  });

  it("tracks queued messages and moves them into the conversation when delivered", async () => {
    const provider = scriptedProvider([textTurn("first", { delayMs: 2 }), textTurn("second")]);
    let state = initialViewState([userMessage("x")]);
    const h = run({ provider, model: "m", messages: [userMessage("x")] });
    const follow: Message = userMessage("then?");
    h.followUp(follow);
    const seen: AgentEvent["type"][] = [];
    for await (const e of h) {
      state = reduce(state, e);
      seen.push(e.type);
      if (e.type === "queued") expect(state.queued.followUp).toHaveLength(1);
    }
    expect(state.queued.followUp).toHaveLength(0);
    expect(state.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
  });

  it("errors and aborts end with the matching status and stop streaming", async () => {
    const provider = scriptedProvider([textTurn("streaming slowly", { delayMs: 5, chunkSize: 2 })]);
    let state = initialViewState();
    const h = run({ provider, model: "m", messages: [userMessage("x")] });
    for await (const e of h) {
      state = reduce(state, e);
      if (e.type === "block_delta") h.abort();
    }
    expect(state.status).toBe("aborted");
    expect(state.messages.flatMap((m) => m.parts).some((p) => p.type === "text" && p.streaming)).toBe(false);
  });

  it("keeps structural sharing for untouched messages", async () => {
    const before = initialViewState([userMessage("a"), userMessage("b")]);
    const after = reduce(before, { type: "message_start", stepId: "s", messageId: "m1", role: "assistant" });
    expect(after.messages[0]).toBe(before.messages[0]);
    expect(after.messages).toHaveLength(3);
  });
});
