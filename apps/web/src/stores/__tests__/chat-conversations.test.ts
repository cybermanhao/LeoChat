/**
 * 前端 store（harness 第三期：会话收件箱）：输入发到 server 的收件箱，每个打开的会话一条事件流。
 * 这里不起 Zustand，直接组合两个 slice，agentApi 用假的。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentEvent, Goal, Message } from "@leochat/core";

const api = vi.hoisted(() => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  loadConversation: vi.fn(),
  deleteConversation: vi.fn(),
  events: vi.fn(),
  sendMessage: vi.fn(),
  withdraw: vi.fn(),
  stop: vi.fn(),
  getGoal: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  listSchedules: vi.fn(),
  createSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
}));
const approveToolCall = vi.hoisted(() => vi.fn());
const executeUI = vi.hoisted(() => vi.fn());
const processUI = vi.hoisted(() => vi.fn(async () => ({ processedResult: null, uiCommandExecuted: false })));
const notify = vi.hoisted(() => vi.fn());

vi.mock("../../lib/agent-api", () => ({ agentApi: api }));
vi.mock("../../lib/api", () => ({ chatApi: { approveToolCall } }));
vi.mock("../../lib/ui-commands", () => ({ processToolResultForUICommands: processUI, executeUICommand: executeUI }));
vi.mock("../../lib/api-error", () => ({ handleApiError: vi.fn() }));
vi.mock("../../lib/os-notification", () => ({ sendOSNotification: notify }));
vi.mock("../toast", () => ({ showToast: vi.fn() }));

import { createConversationsSlice } from "../chat-conversations";
import { createGenerationSlice } from "../chat-generation";
import type { ChatState } from "../chat-types";

function makeStore() {
  let state = {
    currentProvider: "deepseek",
    currentModel: "deepseek-chat",
    maxEpochs: 10,
    unlimitedEpochs: false,
    temperature: 0.7,
    mcpTools: [{ name: "read_file" }],
    webSearch: false,
    permission: "ask",
  } as unknown as ChatState;
  const set = (u: unknown) => {
    const patch = typeof u === "function" ? (u as (s: ChatState) => Partial<ChatState>)(state) : (u as Partial<ChatState>);
    state = { ...state, ...patch };
  };
  const get = () => state;
  state = { ...state, ...createGenerationSlice(set, get), ...createConversationsSlice(set, get) };
  return { get, patch: (p: Partial<ChatState>) => set(p) };
}

/** 每个会话一个可控的事件流 */
const streams = new Map<string, { push: (e: AgentEvent) => void; signal: AbortSignal }>();
function fakeEvents() {
  api.events.mockImplementation(async function* (id: string, signal: AbortSignal) {
    const queue: AgentEvent[] = [];
    let wake: (() => void) | null = null;
    streams.set(id, {
      signal,
      push: (e) => {
        queue.push(e);
        wake?.();
      },
    });
    signal.addEventListener("abort", () => wake?.());
    while (!signal.aborted) {
      const e = queue.shift();
      if (e) yield e;
      else await new Promise<void>((r) => (wake = r));
    }
  });
}
const push = async (id: string, ...events: AgentEvent[]) => {
  await vi.waitFor(() => expect(streams.get(id)).toBeDefined());
  for (const e of events) streams.get(id)!.push(e);
  await new Promise((r) => setTimeout(r, 5));
};

const meta = (id: string, title = "") => ({ id, title, createdAt: 1, updatedAt: 1 });
const user = (id: string, text: string): Message => ({ id, role: "user", content: [{ type: "text", text }] });
const custom = (name: string, data: unknown): AgentEvent => ({ type: "custom", name, data });
const goal = (over: Partial<Goal> = {}): Goal => ({
  id: "goal_1",
  revision: 1,
  objective: "Sort the files",
  phase: "active",
  roundsStarted: 0,
  maxRounds: 256,
  createdAt: 1,
  updatedAt: 1,
  ...over,
});
function turn(text: string, runId = "r1"): AgentEvent[] {
  return [
    { type: "run_start", runId, at: 1 },
    { type: "step_start", stepId: "s1", index: 0 },
    { type: "message_start", stepId: "s1", messageId: "a1", role: "assistant" },
    { type: "block_start", messageId: "a1", index: 0, block: { type: "text" } },
    { type: "block_delta", messageId: "a1", index: 0, delta: { kind: "text", text } },
    { type: "block_end", messageId: "a1", index: 0, block: { type: "text", text } },
    { type: "step_end", stepId: "s1", finish: "end_turn", usage: { inputTokens: 1, outputTokens: 1 } },
    { type: "run_end", result: { runId, reason: "completed", transcript: [], usage: { inputTokens: 1, outputTokens: 1 } } },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  streams.clear();
  fakeEvents();
  api.deleteConversation.mockResolvedValue({});
  api.sendMessage.mockResolvedValue({ item: { id: "in_1" } });
  api.withdraw.mockResolvedValue({});
  api.stop.mockResolvedValue({});
  api.listSchedules.mockResolvedValue([]);
  approveToolCall.mockResolvedValue(undefined);
});

describe("conversations", () => {
  it("opens a conversation: loads it, connects its event stream, and the reset event rebuilds the view", async () => {
    const { get } = makeStore();
    api.listConversations.mockResolvedValue([meta("c1", "first"), meta("c2")]);
    api.loadConversation.mockResolvedValue({ meta: meta("c1", "first"), transcript: [user("u1", "hi")], goal: null, running: false, goalArmed: false });
    await get().loadConversations();
    await get().setCurrentConversation("c1");
    expect(get().view.messages.map((m) => m.id)).toEqual(["u1"]);
    expect(api.events.mock.calls[0]![0]).toBe("c1");
    await push("c1", custom("reset", { transcript: [user("u1", "hi"), { id: "a1", role: "assistant", content: [{ type: "text", text: "hello" }] }] }));
    expect(get().view.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("switching conversations closes the old stream without stopping the server's work, and ignores a stale load", async () => {
    const { get } = makeStore();
    let resolveFirst: (v: unknown) => void = () => {};
    api.loadConversation
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce({ meta: meta("c2"), transcript: [user("u2", "second")], goal: null, running: false, goalArmed: false })
      .mockResolvedValueOnce({ meta: meta("c3"), transcript: [], goal: null, running: false, goalArmed: false });
    const first = get().setCurrentConversation("c1");
    await get().setCurrentConversation("c2");
    resolveFirst({ meta: meta("c1"), transcript: [user("u1", "first")], goal: null, running: false, goalArmed: false });
    await first;
    expect(get().currentConversationId).toBe("c2");
    expect(get().view.messages[0]!.id).toBe("u2");
    await push("c2", custom("agent", { running: true, source: "goal" }));
    expect(get().isGenerating).toBe(true);
    await get().setCurrentConversation("c3");
    expect(streams.get("c2")!.signal.aborted).toBe(true);
    expect(get().isGenerating).toBe(false);
    expect(api.stop).not.toHaveBeenCalled();
  });

  it("deleting the current conversation moves to the next one", async () => {
    const { get } = makeStore();
    api.listConversations.mockResolvedValue([meta("c1"), meta("c2")]);
    api.loadConversation.mockImplementation(async (id: string) => ({ meta: meta(id), transcript: [], goal: null, running: false, goalArmed: false }));
    await get().loadConversations();
    await get().setCurrentConversation("c1");
    await get().deleteConversation("c1");
    expect(api.deleteConversation).toHaveBeenCalledWith("c1");
    expect(get().conversations.map((c) => c.id)).toEqual(["c2"]);
    expect(get().currentConversationId).toBe("c2");
  });
});

describe("input goes to the server inbox", () => {
  it("first send creates the conversation, connects, and posts next-turn with the current settings", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    await get().sendMessage("  Hi there  ", "be nice");
    expect(api.sendMessage).toHaveBeenCalledWith("c1", {
      text: "  Hi there  ",
      target: "next-turn",
      settings: expect.objectContaining({ system: "be nice", model: "deepseek-chat", provider: "deepseek", maxSteps: 10, tools: ["read_file"], host: "web" }),
    });
    expect(api.sendMessage.mock.calls[0]![1].settings).not.toHaveProperty("permission");
    expect(api.events.mock.calls[0]![0]).toBe("c1");
    expect(get().conversations[0]!.title).toBe("Hi there");
    expect(get().input).toBe("");
  });

  it("sending right after New chat waits for that conversation instead of creating a second one", async () => {
    // 回归（2026-11-23 手机 e2e）：新建请求还没返回时就发送，发送那边另建了一个会话，界面停在空会话上
    const { get } = makeStore();
    let resolveCreate!: (v: unknown) => void;
    api.createConversation.mockReturnValue(new Promise((r) => (resolveCreate = r)));
    const creating = get().createConversation();
    const sending = get().sendMessage("hi");
    resolveCreate(meta("c1"));
    await creating;
    await sending;
    expect(api.createConversation).toHaveBeenCalledTimes(1);
    expect(get().currentConversationId).toBe("c1");
    expect(api.sendMessage.mock.calls.at(-1)![0]).toBe("c1");
  });

  it("a slow startup list that arrives after the first send does not drop the new conversation", async () => {
    // 回归（2026-11-23 e2e）：列表请求在新建会话之前发出、之后才返回，列表里没有新会话，
    // 旧逻辑把当前会话清空，事件流也随之停掉；之后的排队消息被发到了另一个新会话
    const { get } = makeStore();
    let resolveList!: (v: unknown) => void;
    api.listConversations.mockReturnValue(new Promise((r) => (resolveList = r)));
    const loading = get().loadConversations();
    api.createConversation.mockResolvedValue(meta("c1"));
    await get().sendMessage("hi");
    resolveList([meta("old")]);
    await loading;
    expect(get().currentConversationId).toBe("c1");
    expect(get().conversations.map((c) => c.id)).toEqual(["c1", "old"]);
    // 事件流仍然连着这个会话：后续消息继续发给 c1
    await get().queueFollowUp("later");
    expect(api.createConversation).toHaveBeenCalledTimes(1);
    expect(api.sendMessage.mock.calls.at(-1)![0]).toBe("c1");
  });

  it("while a turn runs, Enter interjects (next-step) and Ctrl+Enter queues (next-turn); full access is sent along", async () => {
    const { get, patch } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    await get().sendMessage("start");
    await push("c1", custom("agent", { running: true, source: "user" }));
    await get().sendMessage("shorter please");
    await get().queueFollowUp("then translate");
    expect(api.sendMessage.mock.calls.map((c) => c[1].target)).toEqual(["next-turn", "next-step", "next-turn"]);
    patch({ permission: "full" });
    await get().sendMessage("x");
    expect(api.sendMessage.mock.calls.at(-1)![1].settings).toMatchObject({ permission: "full" });
  });

  it("a failed send puts the text back into the input", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    api.sendMessage.mockRejectedValueOnce(new Error("500"));
    await get().sendMessage("keep me");
    expect(get().input).toBe("keep me");
  });

  it("stop and withdraw go to the server", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    await get().sendMessage("start");
    get().cancelGeneration();
    await get().withdraw("in_9");
    expect(api.stop).toHaveBeenCalledWith("c1");
    expect(api.withdraw).toHaveBeenCalledWith("c1", "in_9");
  });
});

describe("event stream", () => {
  it("renders runs, tracks status / inbox / goal, runs UI commands and session-allowed approvals", async () => {
    const { get, patch } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    await get().sendMessage("hi");
    patch({ sessionAllowedTools: new Set(["bash"]) });
    await push(
      "c1",
      custom("reset", { transcript: [] }),
      custom("inbox", { nextTurn: [{ id: "in_1", source: "user", text: "hi" }], nextStep: [] }),
      custom("agent", { running: true, source: "user" }),
      custom("inbox", { nextTurn: [], nextStep: [] }),
      { type: "user_message", message: user("u1", "hi"), via: "followUp" },
      ...turn("Hello!").slice(0, 3),
      { type: "approval_request", approvalId: "apr", callId: "b1", toolName: "bash" },
      custom("ui_command", { command: "update_theme", payload: { themeId: "dark-green" } }),
      custom("ui_command", { command: "rm_rf", payload: {} }),
      ...turn("Hello!").slice(3),
      custom("agent", { running: false, source: null }),
    );
    expect(get().view.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(get().view.messages[1]!.parts[0]).toMatchObject({ text: "Hello!", streaming: false });
    expect(get().isGenerating).toBe(false);
    expect(get().inbox).toEqual({ nextTurn: [], nextStep: [] });
    expect(approveToolCall).toHaveBeenCalledWith("b1", true);
    expect(executeUI).toHaveBeenCalledTimes(1);
    expect(executeUI).toHaveBeenCalledWith({ __ui_command__: true, command: "update_theme", payload: { themeId: "dark-green" } });
    expect(notify).toHaveBeenCalledWith("LeoChat", "AI 回复完成");
    expect(api.listSchedules).toHaveBeenCalled(); // 一轮结束后刷新提醒
  });

  it("goal turns do not send the reply notification; goal completion does", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    await get().sendMessage("x");
    await push(
      "c1",
      custom("goal", { ...goal(), armed: true }),
      custom("agent", { running: true, source: "goal" }),
      ...turn("round"),
      custom("goal", { ...goal({ phase: "complete", revision: 3 }), armed: false }),
      custom("agent", { running: false, source: null }),
    );
    expect(notify).not.toHaveBeenCalledWith("LeoChat", "AI 回复完成");
    expect(notify).toHaveBeenCalledWith("LeoChat", "目标已完成");
    expect(get().goal).toMatchObject({ phase: "complete", armed: false });
  });

  it("reconnects after the stream drops", async () => {
    const { get } = makeStore();
    let calls = 0;
    api.events.mockImplementation(async function* () {
      calls++;
      if (calls === 1) throw new Error("dropped");
      yield custom("reset", { transcript: [user("u1", "back")] });
      await new Promise(() => {});
    });
    api.loadConversation.mockResolvedValue({ meta: meta("c1"), transcript: [], goal: null, running: false, goalArmed: false });
    await get().setCurrentConversation("c1");
    await vi.waitFor(() => expect(get().view.messages.map((m) => m.id)).toEqual(["u1"]), { timeout: 4000 });
    get().connect(null);
  });
});

describe("/goal and /loop", () => {
  it("startGoal creates the goal with the run settings; pause / resume with extra rounds use the current revision", async () => {
    const { get, patch } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    api.createGoal.mockResolvedValue({ goal: goal(), armed: true });
    await get().startGoal("Sort the files", { systemPrompt: "sys" });
    expect(api.createGoal).toHaveBeenCalledWith("c1", { objective: "Sort the files", settings: expect.objectContaining({ system: "sys", tools: ["read_file"] }) });
    expect(get().goal).toMatchObject({ armed: true });

    api.updateGoal.mockResolvedValueOnce({ goal: goal({ phase: "paused", revision: 2 }), armed: false });
    await get().pauseGoal();
    expect(api.updateGoal.mock.calls[0]![1]).toEqual({ action: "pause", revision: 1 });

    patch({ goal: goal({ phase: "blocked", revision: 9, roundsStarted: 2, maxRounds: 2 }) });
    api.updateGoal
      .mockResolvedValueOnce({ goal: goal({ phase: "blocked", revision: 10, maxRounds: 22 }), armed: false })
      .mockResolvedValueOnce({ goal: goal({ phase: "active", revision: 11, maxRounds: 22 }), armed: true });
    await get().resumeGoal({ extraRounds: 20 });
    expect(api.updateGoal.mock.calls.slice(1).map((c) => c[1])).toEqual([
      { action: "edit", revision: 9, maxRounds: 22 },
      { action: "resume", revision: 10, settings: expect.objectContaining({ model: "deepseek-chat" }) },
    ]);
    expect(get().goal).toMatchObject({ phase: "active", armed: true });
  });

  it("a stale pause (the server just started a round) re-reads the goal and retries once; a stale edit does not", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    api.createGoal.mockResolvedValue({ goal: goal(), armed: true });
    await get().startGoal("x");
    api.updateGoal.mockRejectedValueOnce(new Error("409")).mockResolvedValueOnce({ goal: goal({ phase: "paused", revision: 6 }), armed: false });
    api.getGoal.mockResolvedValueOnce({ goal: goal({ revision: 5, roundsStarted: 1 }), armed: true });
    await get().pauseGoal();
    expect(api.updateGoal.mock.calls.map((c) => c[1])).toEqual([
      { action: "pause", revision: 1 },
      { action: "pause", revision: 5 },
    ]);
    expect(get().goal).toMatchObject({ phase: "paused", armed: false });

    api.updateGoal.mockClear();
    api.updateGoal.mockRejectedValueOnce(new Error("409"));
    api.getGoal.mockResolvedValueOnce({ goal: goal({ phase: "paused", revision: 7 }), armed: false });
    await get().resumeGoal({ extraRounds: 5 }); // edit 过期：不重试，也不继续 resume
    expect(api.updateGoal).toHaveBeenCalledTimes(1);
  });

  it("createSchedule saves the run settings; deleteSchedule removes it", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    api.createSchedule.mockImplementation(async (id: string, input: { prompt: string; rule: unknown }) => ({
      id: "s9",
      conversationId: id,
      title: input.prompt,
      prompt: input.prompt,
      rule: input.rule,
      timeZone: "UTC",
      state: "active",
      nextAt: 2,
    }));
    api.deleteSchedule.mockResolvedValue({});
    expect(await get().createSchedule("check mail", { kind: "interval", everySeconds: 1800 }, "sys")).toBe(true);
    expect(api.createSchedule.mock.calls[0]![1]).toMatchObject({ prompt: "check mail", settings: { system: "sys", model: "deepseek-chat" } });
    expect(get().schedules.map((x) => x.id)).toEqual(["s9"]);
    await get().deleteSchedule("s9");
    expect(get().schedules).toEqual([]);
    api.createSchedule.mockRejectedValueOnce(new Error("400"));
    expect(await get().createSchedule("x", { kind: "daily", time: "09:00" })).toBe(false);
  });
});
