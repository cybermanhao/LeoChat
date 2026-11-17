/**
 * GUI 迁移第二步的前端 store：会话由 server 保存，生成过程直接用 core 的 reduce() 渲染。
 * 这里不起 Zustand，直接组合两个 slice，agentApi 用假的。
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentEvent, Message } from "@leochat/core";

const api = vi.hoisted(() => ({
  listConversations: vi.fn(),
  createConversation: vi.fn(),
  loadConversation: vi.fn(),
  deleteConversation: vi.fn(),
  run: vi.fn(),
  steer: vi.fn(),
  followUp: vi.fn(),
  abort: vi.fn(),
}));
const approveToolCall = vi.hoisted(() => vi.fn());
const processUI = vi.hoisted(() => vi.fn(async () => ({ processedResult: null, uiCommandExecuted: false })));

vi.mock("../../lib/agent-api", () => ({ agentApi: api }));
vi.mock("../../lib/api", () => ({ chatApi: { approveToolCall } }));
vi.mock("../../lib/ui-commands", () => ({ processToolResultForUICommands: processUI, executeUICommand: vi.fn() }));
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
