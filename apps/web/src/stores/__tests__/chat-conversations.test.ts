/**
 * GUI 迁移第二步的前端 store：会话由 server 保存，生成过程直接用 core 的 reduce() 渲染。
 * 这里不起 Zustand，直接组合两个 slice，agentApi 用假的。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentEvent, Goal, Message } from "@leochat/core";

const api = vi.hoisted(() => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  loadConversation: vi.fn(),
  deleteConversation: vi.fn(),
  run: vi.fn(),
  steer: vi.fn(),
  followUp: vi.fn(),
  abort: vi.fn(),
  getGoal: vi.fn(),
  createGoal: vi.fn(),
  updateGoal: vi.fn(),
  runGoal: vi.fn(),
}));
const approveToolCall = vi.hoisted(() => vi.fn());
const executeUI = vi.hoisted(() => vi.fn());
const processUI = vi.hoisted(() => vi.fn(async () => ({ processedResult: null, uiCommandExecuted: false })));

vi.mock("../../lib/agent-api", () => ({ agentApi: api }));
vi.mock("../../lib/api", () => ({ chatApi: { approveToolCall } }));
vi.mock("../../lib/ui-commands", () => ({ processToolResultForUICommands: processUI, executeUICommand: executeUI }));
vi.mock("../../lib/api-error", () => ({ handleApiError: vi.fn() }));
vi.mock("../../lib/os-notification", () => ({ sendOSNotification: vi.fn() }));

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
  } as unknown as ChatState;
  const set = (u: unknown) => {
    const patch = typeof u === "function" ? (u as (s: ChatState) => Partial<ChatState>)(state) : (u as Partial<ChatState>);
    state = { ...state, ...patch };
  };
  const get = () => state;
  state = { ...state, ...createConversationsSlice(set, get), ...createGenerationSlice(set, get) };
  return { get };
}

const meta = (id: string, title = "") => ({ id, title, createdAt: 1, updatedAt: 1 });
const user = (id: string, text: string): Message => ({ id, role: "user", content: [{ type: "text", text }] });

/** 一次简单回复的事件序列 */
function textRun(text: string, runId = "run_1"): AgentEvent[] {
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

async function* stream(events: AgentEvent[], gate?: Promise<void>, gateAfter = 0) {
  for (let i = 0; i < events.length; i++) {
    if (gate && i === gateAfter) await gate;
    yield events[i]!;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  api.deleteConversation.mockResolvedValue({});
  api.steer.mockResolvedValue({ result: "delivered" });
  api.followUp.mockResolvedValue({ result: null });
  api.abort.mockResolvedValue({});
  approveToolCall.mockResolvedValue(undefined);
});

describe("conversations slice", () => {
  it("loads the list and opens a conversation from its transcript", async () => {
    const { get } = makeStore();
    api.listConversations.mockResolvedValue([meta("c1", "first"), meta("c2")]);
    api.loadConversation.mockResolvedValue({
      meta: meta("c1", "first"),
      transcript: [user("u1", "hi"), { id: "a1", role: "assistant", content: [{ type: "text", text: "hello" }] }],
    });
    await get().loadConversations();
    expect(get().conversations.map((c) => c.id)).toEqual(["c1", "c2"]);
    await get().setCurrentConversation("c1");
    expect(get().currentConversationId).toBe("c1");
    expect(get().view.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("drops a stale load when the user switches again quickly", async () => {
    const { get } = makeStore();
    let resolveFirst: (v: unknown) => void = () => {};
    api.loadConversation
      .mockImplementationOnce(() => new Promise((r) => (resolveFirst = r)))
      .mockResolvedValueOnce({ meta: meta("c2"), transcript: [user("u2", "second")] });
    const first = get().setCurrentConversation("c1");
    await get().setCurrentConversation("c2");
    resolveFirst({ meta: meta("c1"), transcript: [user("u1", "first")] });
    await first;
    expect(get().currentConversationId).toBe("c2");
    expect(get().view.messages[0]!.id).toBe("u2");
  });

  it("deleting the current conversation moves to the next one", async () => {
    const { get } = makeStore();
    api.listConversations.mockResolvedValue([meta("c1"), meta("c2")]);
    api.loadConversation.mockImplementation(async (id: string) => ({ meta: meta(id), transcript: [] }));
    await get().loadConversations();
    await get().setCurrentConversation("c1");
    await get().deleteConversation("c1");
    expect(api.deleteConversation).toHaveBeenCalledWith("c1");
    expect(get().conversations.map((c) => c.id)).toEqual(["c2"]);
    expect(get().currentConversationId).toBe("c2");
  });
});

describe("generation slice", () => {
  it("creates a conversation on first send, renders the streamed reply, and titles it", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    api.run.mockImplementation(() => stream(textRun("Hello!")));
    await get().sendMessage("  Hi there  ", "be nice");
    expect(api.run).toHaveBeenCalledWith(
      "c1",
      expect.objectContaining({ text: "  Hi there  ", system: "be nice", model: "deepseek-chat", provider: "deepseek", maxSteps: 10, tools: ["read_file"] }),
      expect.any(AbortSignal),
    );
    const v = get().view;
    expect(v.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(v.messages[1]!.parts[0]).toMatchObject({ type: "text", text: "Hello!", streaming: false });
    expect(v.status).toBe("done");
    expect(get().isGenerating).toBe(false);
    expect(get().conversations[0]!.title).toBe("Hi there");
  });

  it("while running, Enter steers and Ctrl+Enter queues into the active run", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    api.run.mockImplementation(() => stream(textRun("ok"), gate, 1));
    const running = get().sendMessage("start");
    await vi.waitFor(() => expect(get().activeRunId).toBe("run_1"));
    await get().sendMessage("actually, shorter");
    await get().queueFollowUp("then translate");
    expect(api.steer).toHaveBeenCalledWith("run_1", "actually, shorter");
    expect(api.followUp).toHaveBeenCalledWith("run_1", "then translate");
    expect(api.run).toHaveBeenCalledTimes(1);
    release();
    await running;
  });

  it("auto-approves tools allowed for the session and answers others once", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    const events: AgentEvent[] = [
      { type: "run_start", runId: "r", at: 1 },
      { type: "message_start", stepId: "s", messageId: "a", role: "assistant" },
      { type: "block_start", messageId: "a", index: 0, block: { type: "tool_use", id: "b1", name: "bash" } },
      { type: "block_end", messageId: "a", index: 0, block: { type: "tool_use", id: "b1", name: "bash", arguments: '{"command":"ls"}', input: { command: "ls" } } },
      { type: "approval_request", approvalId: "apr", callId: "b1", toolName: "bash" },
    ];
    api.run.mockImplementation(() => stream(events));
    await get().sendMessage("list");
    expect(get().view.messages[1]!.parts[0]).toMatchObject({ type: "tool", state: "awaiting-approval" });
    await get().respondApproval("b1", "bash", true, true);
    await get().respondApproval("b1", "bash", true, true); // 重复点击不重复提交
    expect(approveToolCall).toHaveBeenCalledTimes(1);
    expect(get().sessionAllowedTools.has("bash")).toBe(true);

    // 同一会话里再次请求 bash：自动允许
    api.run.mockImplementation(() => stream(events.map((e) => (e.type === "approval_request" ? { ...e, callId: "b2" } : e))));
    await get().sendMessage("again");
    expect(approveToolCall).toHaveBeenLastCalledWith("b2", true);
  });

  it("runs UI commands from successful tool output", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    api.run.mockImplementation(() =>
      stream([
        { type: "run_start", runId: "r", at: 1 },
        { type: "tool_end", callId: "t", ok: true, output: { content: [{ type: "text", text: '{"__ui_command__":true}' }] }, ms: 1 },
      ]),
    );
    await get().sendMessage("theme");
    expect(processUI).toHaveBeenCalledWith('{"__ui_command__":true}');
  });

  it("cancel aborts the run on the server and ends streaming locally", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    const never = new Promise<void>(() => {});
    api.run.mockImplementation(() => stream(textRun("partial"), never, 5));
    void get().sendMessage("go");
    await vi.waitFor(() => expect(get().view.messages[1]?.parts[0]).toMatchObject({ text: "partial", streaming: true }));
    get().cancelGeneration();
    expect(api.abort).toHaveBeenCalledWith("run_1");
    expect(get().isGenerating).toBe(false);
    expect(get().view.status).toBe("aborted");
    expect(get().view.messages[1]!.parts[0]).toMatchObject({ streaming: false });
  });
});

describe("steer before the run id is known", () => {
  it("holds the steer until run_start and then delivers it", async () => {
    const { get } = makeStore();
    let resolveCreate: (v: unknown) => void = () => {};
    api.createConversation.mockImplementation(() => new Promise((r) => (resolveCreate = r)));
    api.run.mockImplementation(() => stream(textRun("ok")));
    const running = get().sendMessage("start");
    expect(get().isGenerating).toBe(true);
    await get().sendMessage("early steer"); // 还没有 runId
    expect(get().input).toBe("");
    expect(api.steer).not.toHaveBeenCalled();
    resolveCreate(meta("c1"));
    await running;
    expect(api.steer).toHaveBeenCalledWith("run_1", "early steer");
  });
});

describe("in-process UI tools", () => {
  it("executes ui_command custom events and tells the server which host it runs in", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    api.run.mockImplementation(() =>
      stream([
        { type: "run_start", runId: "r", at: 1 },
        { type: "custom", name: "ui_command", data: { command: "update_theme", payload: { themeId: "dark-green" } } },
        { type: "custom", name: "ui_command", data: { command: "rm_rf", payload: {} } }, // 未知命令忽略
      ]),
    );
    await get().sendMessage("换主题");
    expect(executeUI).toHaveBeenCalledTimes(1);
    expect(executeUI).toHaveBeenCalledWith({ __ui_command__: true, command: "update_theme", payload: { themeId: "dark-green" } });
    expect(api.run.mock.calls[0]![1]).toMatchObject({ host: "web" });
  });
});

describe("/goal in the store", () => {
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
  const roundMsg = (n: number): Message => ({ id: `r${n}`, role: "user", content: [{ type: "text", text: `<goal_round>
Round: ${n}/256
</goal_round>` }] });

  it("startGoal creates the goal, attaches to the driver, and follows goal / goal_round events", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    api.createGoal.mockResolvedValue({ goal: goal() });
    api.runGoal.mockImplementation(() =>
      stream([
        { type: "custom", name: "goal", data: goal() },
        { type: "custom", name: "goal_round", data: { round: 1, message: roundMsg(1) } },
        ...textRun("Working."),
        { type: "custom", name: "goal", data: goal({ phase: "complete", revision: 3, roundsStarted: 1 }) },
      ]),
    );
    await get().startGoal("Sort the files", { systemPrompt: "sys" });
    expect(api.createGoal).toHaveBeenCalledWith("c1", { objective: "Sort the files" });
    expect(api.runGoal.mock.calls[0]![1]).toMatchObject({ system: "sys", tools: ["read_file"] });
    expect(get().goal).toMatchObject({ phase: "complete" });
    expect(get().view.messages.map((m) => m.id)).toEqual(["r1", "a1"]); // 每轮提示进入视图；goal 事件不进视图
    expect(get().isGenerating).toBe(false);
    expect(get().goalAttached).toBe(false);
  });

  it("stop while a goal runs pauses the goal instead of cutting the stream", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    api.createGoal.mockResolvedValue({ goal: goal() });
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    api.runGoal.mockImplementation(() => stream([{ type: "custom", name: "goal", data: goal({ revision: 2, roundsStarted: 1 }) }, ...textRun("x")], gate, 1));
    api.updateGoal.mockImplementation(async () => {
      release();
      return { goal: goal({ phase: "paused", revision: 3, roundsStarted: 1 }), running: false };
    });
    const running = get().startGoal("Sort the files");
    await vi.waitFor(() => expect(get().goal?.revision).toBe(2));
    get().cancelGeneration();
    await running;
    expect(api.updateGoal).toHaveBeenCalledWith("c1", { action: "pause", revision: 2 });
    expect(api.abort).not.toHaveBeenCalled();
    expect(get().goal?.phase).toBe("paused");
  });

  it("switching conversations only detaches from a running goal, and reopening attaches again", async () => {
    const { get } = makeStore();
    api.createConversation.mockResolvedValue(meta("c1"));
    api.createGoal.mockResolvedValue({ goal: goal() });
    api.runGoal.mockImplementation(() => stream(textRun("x"), new Promise<void>(() => {}), 1));
    void get().startGoal("Sort the files");
    await vi.waitFor(() => expect(get().goalAttached).toBe(true));
    api.loadConversation.mockResolvedValueOnce({ meta: meta("c2"), transcript: [], goal: null, goalRunning: false });
    await get().setCurrentConversation("c2");
    expect(api.updateGoal).not.toHaveBeenCalled(); // 没有暂停
    expect(api.abort).not.toHaveBeenCalled();
    expect(get().isGenerating).toBe(false);
    expect(get().goal).toBeNull();

    api.runGoal.mockClear();
    api.runGoal.mockImplementation(() => stream([{ type: "custom", name: "goal", data: goal({ revision: 5, roundsStarted: 3 }) }]));
    api.loadConversation.mockResolvedValueOnce({ meta: meta("c1"), transcript: [roundMsg(1)], goal: goal({ revision: 4, roundsStarted: 3 }), goalRunning: true });
    await get().setCurrentConversation("c1");
    await vi.waitFor(() => expect(api.runGoal).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(get().goal?.revision).toBe(5));
  });

  it("resume adds rounds when they ran out, then resumes and attaches", async () => {
    const { get } = makeStore();
    api.loadConversation.mockResolvedValueOnce({
      meta: meta("c1"),
      transcript: [],
      goal: goal({ phase: "blocked", revision: 9, roundsStarted: 2, maxRounds: 2, blocker: { code: "round-limit", reason: "Used all 2 rounds." } }),
      goalRunning: false,
    });
    await get().setCurrentConversation("c1");
    api.updateGoal
      .mockResolvedValueOnce({ goal: goal({ phase: "blocked", revision: 10, roundsStarted: 2, maxRounds: 22 }), running: false })
      .mockResolvedValueOnce({ goal: goal({ phase: "active", revision: 11, roundsStarted: 2, maxRounds: 22 }), running: false });
    api.runGoal.mockImplementation(() => stream([]));
    await get().resumeGoal({ extraRounds: 20 });
    expect(api.updateGoal.mock.calls.map((c) => c[1])).toEqual([
      { action: "edit", revision: 9, maxRounds: 22 },
      { action: "resume", revision: 10 },
    ]);
    expect(api.runGoal).toHaveBeenCalledTimes(1);
  });
});
