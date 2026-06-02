/**
 * TDD: /api/chat 路由 — checkpoint 集成
 *
 * 测试覆盖：
 * - POST /chat: 生成 taskId，首个 SSE 事件为 task_started
 * - POST /chat: 工具调用完成后 TaskStore 保存进度
 * - POST /chat: 任务完成后标记 status = completed
 * - POST /chat: 客户端断开后标记 status = interrupted
 * - POST /chat/resume: 从已有 taskId 恢复，继续 LLM 循环
 * - POST /chat/resume: taskId 不存在返回 404
 *
 * Route A — resumeTaskId 合并进 /chat:
 * - POST /chat { resumeTaskId }: 加载已保存消息，沿用原 taskId，resumed: true
 * - POST /chat { resumeTaskId } 未知 ID: 返回 404
 * - POST /chat { resumeTaskId }: 使用 task.internalMessages 而非请求 messages
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { TaskStore } from "../task-store.js";
import { createRoutes } from "../routes/index.js";
import type { ServerContext } from "../server.js";
import type { StreamCallbacks } from "../services/llm.js";
import type { ChatMessage } from "@ai-chatbox/shared";

// ── SSE helpers ───────────────────────────────────────────────────────────────

async function collectSSE(response: Response): Promise<Array<{ event: string; data: unknown }>> {
  const text = await response.text();
  const events: Array<{ event: string; data: unknown }> = [];
  const lines = text.split("\n");
  let currentEvent = "";

  for (const line of lines) {
    if (line.startsWith("event: ")) {
      currentEvent = line.slice(7).trim();
    } else if (line.startsWith("data: ")) {
      const raw = line.slice(6).trim();
      try {
        events.push({ event: currentEvent, data: JSON.parse(raw) });
      } catch {
        events.push({ event: currentEvent, data: raw });
      }
      currentEvent = "";
    }
  }
  return events;
}

function makeUserMsg(content: string): ChatMessage {
  return { id: "u1", role: "user", content, timestamp: Date.now() };
}

// ── Mock LLMService ───────────────────────────────────────────────────────────

type StreamChatImpl = (req: unknown, cbs: StreamCallbacks, opts?: unknown) => Promise<void>;

function makeMockLLMService(streamChatImpl: StreamChatImpl) {
  return {
    streamChat: vi.fn(streamChatImpl),
    chat: vi.fn(),
    getAvailableProviders: vi.fn(() => ["deepseek"]),
    getDefaultProvider: vi.fn(() => "deepseek"),
    setApiKey: vi.fn(),
    listModels: vi.fn(async () => []),
  };
}

// ── Mock SessionManager ───────────────────────────────────────────────────────

function makeMockSessionManager() {
  return {
    getToolsForLLM: vi.fn(() => []),
    callTool: vi.fn(async () => "tool result"),
    getSessions: vi.fn(() => []),
    getConfigs: vi.fn(() => []),
    getConfig: vi.fn(() => null),
    getSession: vi.fn(() => null),
    getClient: vi.fn(() => null),
    addServer: vi.fn(),
    removeServer: vi.fn(async () => {}),
    connect: vi.fn(async () => ({})),
    disconnect: vi.fn(async () => {}),
    getAllTools: vi.fn(() => []),
  };
}

// ── Test setup ────────────────────────────────────────────────────────────────

let tmpDir: string;
let taskStore: TaskStore;
let app: Hono;
let mockLLM: ReturnType<typeof makeMockLLMService>;
let mockSession: ReturnType<typeof makeMockSessionManager>;

async function buildApp(streamImpl: StreamChatImpl) {
  mockLLM = makeMockLLMService(streamImpl);
  mockSession = makeMockSessionManager();

  const context = {
    sessionManager: mockSession,
    startTime: Date.now(),
    pendingApprovals: new Map(),
    taskStore,
  } as unknown as ServerContext;

  app = new Hono();
  app.route("/api", createRoutes(context, mockLLM as never));
}

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "leochat-route-test-"));
  taskStore = new TaskStore(tmpDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/chat — task_started event", () => {
  it("emits task_started as first SSE event with a taskId", async () => {
    await buildApp(async (_req, cbs) => {
      await cbs.onComplete({ id: "a1", role: "assistant", content: "hello", timestamp: Date.now() });
    });

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [makeUserMsg("hi")], stream: true }),
    });

    expect(res.status).toBe(200);
    const events = await collectSSE(res);
    const started = events.find((e) => e.event === "task_started");
    expect(started).toBeDefined();
    expect(typeof (started!.data as { taskId: string }).taskId).toBe("string");
    expect((started!.data as { taskId: string }).taskId.length).toBeGreaterThan(0);
  });

  it("task_started is the FIRST event before any content", async () => {
    await buildApp(async (_req, cbs) => {
      await cbs.onChunk({ content: "hello", index: 0 });
      await cbs.onComplete({ id: "a1", role: "assistant", content: "hello", timestamp: Date.now() });
    });

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [makeUserMsg("hi")], stream: true }),
    });

    const events = await collectSSE(res);
    expect(events[0].event).toBe("task_started");
  });
});

describe("POST /api/chat — TaskStore persistence", () => {
  it("saves task as running on start", async () => {
    await buildApp(async (_req, cbs) => {
      await cbs.onComplete({ id: "a1", role: "assistant", content: "done", timestamp: Date.now() });
    });

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [makeUserMsg("hi")], chatId: "chat-1", stream: true }),
    });

    await collectSSE(res);
    const pending = await taskStore.listPending("chat-1");
    // Task should be completed (not pending) after successful run
    expect(pending).toHaveLength(0);
    // But should exist as completed
    const events = await collectSSE(
      await app.request("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: [makeUserMsg("hi")], chatId: "chat-1", stream: true }),
      })
    );
    const started = events.find((e) => e.event === "task_started");
    const taskId = (started!.data as { taskId: string }).taskId;
    const record = await taskStore.load(taskId);
    expect(record).not.toBeNull();
    expect(record!.status).toBe("completed");
  });

  it("saves internalMessages after tool round completes", async () => {
    let savedTaskId = "";

    await buildApp(async (_req, cbs) => {
      // Round 1: LLM calls a tool
      await cbs.onToolCall({
        id: "tc-1", name: "my_tool", arguments: { x: 1 }, status: "pending",
      });
      // onComplete for round 1 (tool call present)
      await cbs.onComplete({
        id: "a1", role: "assistant", content: "",
        tool_calls: [{ id: "tc-1", name: "my_tool", arguments: { x: 1 }, status: "completed" }],
        timestamp: Date.now(),
      });
      // Round 2: LLM responds with text
      await cbs.onComplete({ id: "a2", role: "assistant", content: "all done", timestamp: Date.now() });
    });

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [makeUserMsg("run tool")], chatId: "chat-2", stream: true }),
    });

    const events = await collectSSE(res);
    const started = events.find((e) => e.event === "task_started");
    savedTaskId = (started!.data as { taskId: string }).taskId;

    const record = await taskStore.load(savedTaskId);
    expect(record).not.toBeNull();
    // Should include: original user msg + assistant(tool_call) + tool result + assistant(final)
    expect(record!.internalMessages.length).toBeGreaterThan(1);
    expect(record!.toolRound).toBeGreaterThan(0);
    expect(record!.status).toBe("completed");
  });
});

describe("POST /api/chat/resume", () => {
  it("returns 404 for unknown taskId", async () => {
    await buildApp(async (_req, cbs) => {
      await cbs.onComplete({ id: "a1", role: "assistant", content: "hi", timestamp: Date.now() });
    });

    const res = await app.request("/api/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: "does-not-exist" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it("returns 400 when taskId is missing", async () => {
    await buildApp(async (_req, cbs) => {
      await cbs.onComplete({ id: "a1", role: "assistant", content: "hi", timestamp: Date.now() });
    });

    const res = await app.request("/api/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  it("resumes from saved messages and emits task_started", async () => {
    // Pre-save an interrupted task
    const savedMsgs: ChatMessage[] = [
      makeUserMsg("original question"),
      { id: "a0", role: "assistant", content: "partial answer", timestamp: Date.now() },
    ];
    await taskStore.save({
      taskId: "task-to-resume",
      chatId: "chat-resume",
      status: "interrupted",
      toolRound: 1,
      internalMessages: savedMsgs,
    });

    let receivedMessages: ChatMessage[] = [];
    await buildApp(async (req, cbs) => {
      receivedMessages = (req as { messages: ChatMessage[] }).messages;
      await cbs.onComplete({ id: "a2", role: "assistant", content: "resumed!", timestamp: Date.now() });
    });

    const res = await app.request("/api/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: "task-to-resume" }),
    });

    expect(res.status).toBe(200);
    const events = await collectSSE(res);

    // Should emit task_started
    const started = events.find((e) => e.event === "task_started");
    expect(started).toBeDefined();
    expect((started!.data as { taskId: string }).taskId).toBe("task-to-resume");

    // LLM should receive the saved message history
    expect(receivedMessages).toHaveLength(savedMsgs.length);
    expect(receivedMessages[0].content).toBe("original question");
  });

  it("marks resumed task as completed after successful run", async () => {
    await taskStore.save({
      taskId: "task-resume-complete",
      chatId: "chat-x",
      status: "interrupted",
      toolRound: 0,
      internalMessages: [makeUserMsg("continue")],
    });

    await buildApp(async (_req, cbs) => {
      await cbs.onComplete({ id: "a1", role: "assistant", content: "done", timestamp: Date.now() });
    });

    const res = await app.request("/api/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: "task-resume-complete" }),
    });

    await collectSSE(res);

    const record = await taskStore.load("task-resume-complete");
    expect(record!.status).toBe("completed");
  });
});

// ── Route A: resumeTaskId merged into POST /chat ──────────────────────────────

describe("POST /api/chat — resumeTaskId (Route A)", () => {
  it("returns 404 when resumeTaskId does not exist", async () => {
    await buildApp(async (_req, cbs) => {
      await cbs.onComplete({ id: "a1", role: "assistant", content: "hi", timestamp: Date.now() });
    });

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [], resumeTaskId: "ghost", stream: true }),
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: string };
    expect(body.error).toMatch(/not found/i);
  });

  it("uses saved internalMessages instead of request messages", async () => {
    const savedMsgs: ChatMessage[] = [
      makeUserMsg("saved question"),
      { id: "a0", role: "assistant", content: "partial", timestamp: Date.now() },
    ];
    await taskStore.save({
      taskId: "task-route-a",
      chatId: "chat-ra",
      status: "interrupted",
      toolRound: 0,
      internalMessages: savedMsgs,
    });

    let receivedMessages: ChatMessage[] = [];
    await buildApp(async (req, cbs) => {
      receivedMessages = (req as { messages: ChatMessage[] }).messages;
      await cbs.onComplete({ id: "a1", role: "assistant", content: "resumed", timestamp: Date.now() });
    });

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [makeUserMsg("this should be ignored")],
        resumeTaskId: "task-route-a",
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    await collectSSE(res);

    // LLM receives saved messages, not the request messages
    expect(receivedMessages[0].content).toBe("saved question");
    expect(receivedMessages.some((m) => m.content === "this should be ignored")).toBe(false);
  });

  it("emits task_started with original taskId and resumed: true", async () => {
    await taskStore.save({
      taskId: "task-route-a2",
      chatId: "chat-ra2",
      status: "interrupted",
      toolRound: 0,
      internalMessages: [makeUserMsg("hi")],
    });

    await buildApp(async (_req, cbs) => {
      await cbs.onComplete({ id: "a1", role: "assistant", content: "done", timestamp: Date.now() });
    });

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [], resumeTaskId: "task-route-a2", stream: true }),
    });

    const events = await collectSSE(res);
    const started = events.find((e) => e.event === "task_started");
    expect(started).toBeDefined();
    expect((started!.data as { taskId: string; resumed: boolean }).taskId).toBe("task-route-a2");
    expect((started!.data as { taskId: string; resumed: boolean }).resumed).toBe(true);
  });

  it("marks task as completed after successful resume", async () => {
    await taskStore.save({
      taskId: "task-route-a3",
      chatId: "chat-ra3",
      status: "interrupted",
      toolRound: 0,
      internalMessages: [makeUserMsg("continue")],
    });

    await buildApp(async (_req, cbs) => {
      await cbs.onComplete({ id: "a1", role: "assistant", content: "done", timestamp: Date.now() });
    });

    const res = await app.request("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [], resumeTaskId: "task-route-a3", stream: true }),
    });

    await collectSSE(res);

    const record = await taskStore.load("task-route-a3");
    expect(record!.status).toBe("completed");
  });
});
