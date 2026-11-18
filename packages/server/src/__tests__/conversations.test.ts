/**
 * 会话收件箱（harness 第三期）：消息先写进收件箱，每个会话一个处理者按顺序跑，事件走会话事件流。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initialViewState, reduce } from "@leochat/core/view";
import type { AgentEvent, Message } from "@leochat/core";
import {
  agentIdle,
  gated,
  isCustom,
  listen,
  makeApp,
  newConv,
  req,
  say,
  text,
  textOf,
  tool,
  transcript,
  turnsDone,
  watch,
} from "./helpers.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leochat-conv-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); // 测试结束时后台的运行可能还在写日志
});

/** 客户端的做法：reset 时用其中的 transcript 重建视图，之后的事件依次 reduce */
function rebuild(events: AgentEvent[]) {
  let view = initialViewState();
  for (const e of events) {
    if (isCustom(e, "reset")) view = initialViewState((e.data as { transcript: Message[] }).transcript);
    else view = reduce(view, e);
  }
  return view;
}

const inboxOf = (events: AgentEvent[]) =>
  (events.filter((e) => isCustom(e, "inbox")).at(-1)! as { data: { nextTurn: Array<{ text: string }>; nextStep: unknown[] } }).data;

describe("messages go through the inbox", () => {
  it("a message is accepted at once (202), run by the agent, persisted, titled, and renderable by core's reducer", async () => {
    const { app } = makeApp(dir, [text("Hello there."), text("Second answer.")]);
    const id = await newConv(app);
    const l = await listen(app, id);
    const r = await say(app, id, "Hi, who are you?");
    expect(r.status).toBe(202);
    const events = await l.until(turnsDone(1));
    // 用户消息先出现（由处理者领取后发出），然后是这一轮
    const firstUser = events.findIndex((e) => e.type === "user_message");
    expect(firstUser).toBeLessThan(events.findIndex((e) => e.type === "run_start"));
    let view = initialViewState();
    for (const e of events) view = reduce(view, e);
    expect(view.messages.map((m) => m.role)).toEqual(["user", "assistant"]);

    const t = await transcript(app, id);
    expect(t.transcript.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(t.meta.title).toBe("Hi, who are you?");
    expect(t.inbox["next-turn"]).toEqual([]);

    await say(app, id, "And again?");
    await l.until(turnsDone(2));
    await vi.waitFor(async () => expect((await transcript(app, id)).transcript).toHaveLength(4));
  });

  it("messages sent while a turn runs queue in the inbox and run as the next turns, in order", async () => {
    const g = gated("first");
    const { app } = makeApp(dir, [g.round, text("second answer"), text("third answer")]);
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "one");
    await l.until((ev) => ev.some((e) => e.type === "run_start"));
    await say(app, id, "two");
    await say(app, id, "three");
    const mid = await l.until((ev) => ev.some((e) => isCustom(e, "inbox") && (e.data as { nextTurn: unknown[] }).nextTurn.length === 2));
    expect(inboxOf(mid).nextTurn.map((x) => x.text)).toEqual(["two", "three"]);
    g.release();
    await vi.waitFor(async () => expect((await transcript(app, id)).transcript.map(textOf)).toEqual(["one", "first", "two", "second answer", "three", "third answer"]), { timeout: 5000 });
  });

  it("an interjection (next-step) goes into the running turn and is claimed when delivered", async () => {
    const g = gated("thinking");
    const { app, requests } = makeApp(dir, [tool("t1", "read_file", {}), g.round, text("adjusted")], { tools: ["read_file"] });
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "start");
    await l.until((ev) => ev.some((e) => e.type === "tool_end"));
    await say(app, id, "actually, be brief", { target: "next-step" });
    g.release();
    const events = await l.until(turnsDone(1));
    expect(events.some((e) => e.type === "user_message" && e.via === "steer")).toBe(true);
    expect(events.filter((e) => e.type === "run_start")).toHaveLength(1); // 同一轮
    expect(requests.at(-1)!.messages.some((m) => m.content === "actually, be brief")).toBe(true);
    expect((await transcript(app, id)).inbox["next-step"]).toEqual([]);
  });

  it("a queued message can be withdrawn; stop aborts the turn and clears the inbox", async () => {
    const g = gated();
    const { app, requests } = makeApp(dir, [g.round, text("never")]);
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "one");
    await l.until((ev) => ev.some((e) => e.type === "run_start"));
    const two = (await (await say(app, id, "two")).json()) as { item: { id: string } };
    await say(app, id, "three");
    expect((await req(app, "DELETE", `/conversations/${id}/inbox/${two.item.id}`)).status).toBe(200);
    expect((await req(app, "DELETE", `/conversations/${id}/inbox/${two.item.id}`)).status).toBe(404);
    expect((await req(app, "POST", `/conversations/${id}/stop`)).status).toBe(200);
    const events = await l.until((ev) => ev.some(agentIdle) && ev.some((e) => e.type === "run_end"));
    expect(events.find((e) => e.type === "run_end")).toMatchObject({ result: { reason: "aborted" } });
    g.release();
    await new Promise((r) => setTimeout(r, 100));
    expect(requests).toHaveLength(1); // "three" 被清掉，没有再跑
    expect((await transcript(app, id)).inbox["next-turn"]).toEqual([]);
  });

  it("a client that connects mid-turn first receives everything that already happened in the turn", async () => {
    const g = gated("partial output");
    const { app } = makeApp(dir, [g.round]);
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "go");
    await l.until((ev) => ev.some((e) => e.type === "block_delta"));
    const late = listen(app, id).then((x) => x.until(turnsDone(1)));
    await new Promise((r) => setTimeout(r, 50));
    g.release();
    const events = await late;
    // 客户端的做法：reset 时用其中的 transcript 重建视图，之后的事件依次 reduce
    const view = rebuild(events);
    expect(view.messages.map((m) => m.role)).toEqual(["user", "assistant"]); // 不重复
    expect(JSON.stringify(view.messages[1]!.parts)).toContain("partial output");
  });

  it("pending inbox items are processed after a restart", async () => {
    const g = gated();
    const first = makeApp(dir, [g.round]);
    const id = await newConv(first.app);
    await say(first.app, id, "one");
    await watch(first.app, id, (ev) => ev.some((e) => e.type === "run_start"));
    await say(first.app, id, "queued before the crash");
    // "重启"：同一个数据目录上新建一套路由；第一套留着不管（模拟进程已死）
    const second = makeApp(dir, [text("picked up after restart")]);
    await vi.waitFor(async () => expect((await transcript(second.app, id)).transcript.map(textOf)).toContain("picked up after restart"), { timeout: 5000 });
    g.release();
  });
});

describe("permissions (dsh permission presets, no sandbox)", () => {
  it("ask: bash waits for approval through /tools/approve", async () => {
    const { app, pending, callTool } = makeApp(dir, [tool("b1", "bash", { command: "ls" }), text("listed")]);
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "list files");
    await vi.waitFor(() => expect(pending.has("b1")).toBe(true));
    expect((await req(app, "POST", "/tools/approve/b1", { approved: true })).status).toBe(200);
    const events = await l.until(turnsDone(1));
    expect(events.find((e) => e.type === "approval_request")).toMatchObject({ callId: "b1", toolName: "bash" });
    expect(callTool).toHaveBeenCalledWith("bash", { command: "ls" });
  });

  it("full: bash runs without asking", async () => {
    const { app, pending, callTool } = makeApp(dir, [tool("b1", "bash", { command: "ls" }), text("listed")]);
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "list files", { settings: { permission: "full" } });
    const events = await l.until(turnsDone(1));
    expect(pending.size).toBe(0);
    expect(events.some((e) => e.type === "approval_request")).toBe(false);
    expect(callTool).toHaveBeenCalledWith("bash", { command: "ls" });
  });
});

describe("tools and errors", () => {
  it("only offers the tools the GUI enabled; UI tools are in-process and same-named MCP tools are skipped", async () => {
    const { app, requests } = makeApp(dir, [text("ok"), text("ok")], { tools: ["bash", "read_file", "update_theme"] });
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "x", { settings: { tools: ["read_file"], uiTools: false } });
    await l.until(turnsDone(1));
    expect(requests[0]!.tools!.map((t) => t.function.name)).toEqual(["read_file"]);
    await say(app, id, "y", { settings: { tools: [] } });
    await l.until(turnsDone(2));
    const names = requests[1]!.tools!.map((t) => t.function.name);
    expect(names.filter((n) => n === "update_theme")).toHaveLength(1);
    expect(names).not.toContain("resize_window"); // 仅桌面端
    expect(names).not.toContain("bash");
  });

  it("UI tools emit a ui_command event", async () => {
    const { app } = makeApp(dir, [tool("u1", "update_theme", { theme: "深绿" }), text("done")]);
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "换成深绿主题");
    const events = await l.until(turnsDone(1));
    expect(events.find((e) => isCustom(e, "ui_command"))).toEqual({ type: "custom", name: "ui_command", data: { command: "update_theme", payload: { themeId: "dark-green" } } });
  });

  it("tool failures and upstream errors reach the browser without internal details", async () => {
    const { app } = makeApp(
      dir,
      [tool("t1", "read_file", {}), text("sorry"), async (cbs) => cbs.onError(Object.assign(new Error("secret internal-host:8080 failed"), { status: 401 }))],
      { tools: ["read_file"], callTool: async () => Promise.reject(new Error("ECONNREFUSED 10.0.0.5:5432")) },
    );
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "read it");
    const a = await l.until(turnsDone(1));
    expect(a.find((e) => e.type === "tool_end")).toMatchObject({ callId: "t1", ok: false });
    expect(JSON.stringify(a)).not.toContain("10.0.0.5");
    await say(app, id, "again");
    const all = await l.until(turnsDone(2));
    const b = all.slice(all.findIndex((e) => e.type === "run_end") + 1);
    expect(JSON.stringify(b)).not.toContain("internal-host");
    expect(b.find((e) => e.type === "error")).toMatchObject({ error: { message: "LLM request failed (401)" } });
  });

  it("validates input", async () => {
    const { app } = makeApp(dir, []);
    const id = await newConv(app);
    expect((await say(app, id, "")).status).toBe(400);
    expect((await say(app, id, "x", { target: "somewhere" })).status).toBe(400);
    expect((await say(app, id, "x", { settings: { permission: "root" } })).status).toBe(400);
    expect((await say(app, id, "x", { settings: { tools: "bash" } })).status).toBe(400);
    expect((await req(app, "GET", "/conversations/..%2Fetc")).status).toBe(400);
    expect((await say(app, "conv_missing", "x")).status).toBe(404);
    expect((await req(app, "POST", "/conversations/conv_missing/stop")).status).toBe(404);
    expect((await req(app, "GET", "/conversations/conv_missing/events")).status).toBe(404);
    expect((await req(app, "DELETE", `/conversations/${id}`)).status).toBe(200);
    expect((await req(app, "GET", `/conversations/${id}`)).status).toBe(404);
  });
});

describe("reset event", () => {
  it("an idle stream starts with the whole transcript; a mid-turn connect does not duplicate persisted steps", async () => {
    const g = gated("second step");
    const { app } = makeApp(dir, [text("first answer"), tool("t1", "read_file", {}), g.round], { tools: ["read_file"] });
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "one");
    await l.until(turnsDone(1));
    const idle = await listen(app, id);
    expect(idle.events[0]).toMatchObject({ type: "custom", name: "reset" });
    expect((idle.events[0] as { data: { transcript: unknown[] } }).data.transcript).toHaveLength(2);
    await idle.close();

    await say(app, id, "two");
    await l.until((ev) => ev.some((e) => e.type === "tool_end")); // 第一步（含工具结果）已写盘
    const late = await listen(app, id);
    g.release();
    const view = rebuild(await late.until(turnsDone(1)));
    expect(view.messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "assistant"]);
    expect(view.messages.filter((m) => m.parts.some((p) => p.type === "tool"))).toHaveLength(1);
  });
});

describe("approval wait (dsh ask: no timeout)", () => {
  it("waits for an answer with no timeout, and stopping the turn withdraws the request", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const { app, pending, callTool } = makeApp(dir, [tool("b1", "bash", { command: "ls" })]);
      const id = await newConv(app);
      await say(app, id, "list files");
      await vi.waitFor(() => expect(pending.has("b1")).toBe(true));
      vi.advanceTimersByTime(10 * 60_000); // 以前 60 秒自动拒绝；现在一直等
      expect(pending.has("b1")).toBe(true);
      await req(app, "POST", `/conversations/${id}/stop`);
      await vi.waitFor(() => expect(pending.has("b1")).toBe(false));
      expect(callTool).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("instruction files", () => {
  it("the global AGENTS.md comes first in the system prompt, before the GUI's system prompt", async () => {
    const { app, requests } = makeApp(dir, [text("ok")], { instructions: "<instructions>Answer in Chinese.</instructions>" });
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "hi", { settings: { system: "be brief" } });
    await l.until(turnsDone(1));
    const system = requests[0]!.messages.find((m) => m.role === "system")!.content;
    expect(system).toBe("<instructions>Answer in Chinese.</instructions>\n\nbe brief");
  });
});
