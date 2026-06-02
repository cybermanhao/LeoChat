/**
 * TDD: checkpoint 前端集成
 *
 * 测试覆盖：
 * - task_started 事件 → 对话 pendingTaskId 设置
 * - done 事件 → pendingTaskId 清除
 * - resumeFromTask → 调用 /api/chat/resume，处理 SSE，完成后清除 pendingTaskId
 * - resumeFromTask 404 → 报错但不崩溃
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../lib/os-notification", () => ({ sendOSNotification: vi.fn() }));
vi.mock("../../lib/api", () => ({
  getServerBaseUrl: vi.fn(async () => "http://localhost:3001"),
  chatApi: { approveToolCall: vi.fn() },
}));

import { createGenerationSlice } from "../chat-generation.js";
import { createConversationsSlice } from "../chat-conversations.js";
import type { ChatState, Conversation } from "../chat-types.js";
import type { TaskLoopEvent } from "@ai-chatbox/shared";

// ── Slice test harness ────────────────────────────────────────────────────────

function makeConv(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    title: "Test",
    displayMessages: [],
    contextMessages: [],
    createdAt: Date.now(),
    updatedAt: 0,
    pendingTaskId: undefined,
    ...overrides,
  };
}

function makeStore(initialConvs: Conversation[] = [makeConv()]) {
  let state: Partial<ChatState> = {
    conversations: initialConvs,
    currentConversationId: "conv-1",
    input: "",
    isGenerating: false,
    cardStatus: "stable" as const,
    toolCallStates: {},
    activeTaskLoop: null,
    pendingApprovals: [],
    sessionAllowedTools: new Set(),
    cancelGeneration: vi.fn(),
  };

  const set = vi.fn((updater: unknown) => {
    if (typeof updater === "function") {
      state = { ...state, ...(updater as (s: typeof state) => typeof state)(state) };
    } else {
      state = { ...state, ...(updater as typeof state) };
    }
  });

  const get = () => state as ChatState;

  const convSlice = createConversationsSlice(set as never, get);
  const genSlice = createGenerationSlice(set as never, get);

  // Merge slice methods into state — use Object.assign but restore
  // conversations so slice's initial `conversations: []` doesn't overwrite ours
  Object.assign(state, convSlice, genSlice, { conversations: initialConvs });

  return { get, set, genSlice, convSlice };
}

// ── task_started event ────────────────────────────────────────────────────────

describe("_handleTaskLoopEvent: task_started", () => {
  it("sets pendingTaskId on the conversation", () => {
    const { genSlice, get } = makeStore();

    genSlice._handleTaskLoopEvent("conv-1", {
      type: "task_started",
      taskId: "task-abc",
      resumed: false,
    } as TaskLoopEvent);

    const conv = get().conversations.find((c) => c.id === "conv-1");
    expect(conv?.pendingTaskId).toBe("task-abc");
  });

  it("does not affect other conversations", () => {
    const { genSlice, get } = makeStore([
      makeConv({ id: "conv-1" }),
      makeConv({ id: "conv-2" }),
    ]);

    genSlice._handleTaskLoopEvent("conv-1", {
      type: "task_started",
      taskId: "task-abc",
      resumed: false,
    } as TaskLoopEvent);

    const conv2 = get().conversations.find((c) => c.id === "conv-2");
    expect(conv2?.pendingTaskId).toBeUndefined();
  });
});

// ── done event clears pendingTaskId ──────────────────────────────────────────

describe("_handleTaskLoopEvent: done clears pendingTaskId", () => {
  it("clears pendingTaskId when task completes", () => {
    const { genSlice, get } = makeStore([
      makeConv({ id: "conv-1", pendingTaskId: "task-old" }),
    ]);

    genSlice._handleTaskLoopEvent("conv-1", {
      type: "done",
      epochCount: 1,
      internalMessages: [],
    } as TaskLoopEvent);

    const conv = get().conversations.find((c) => c.id === "conv-1");
    expect(conv?.pendingTaskId).toBeUndefined();
  });
});

// ── resumeFromTask ────────────────────────────────────────────────────────────

describe("resumeFromTask", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeSSEStream(events: Array<{ event: string; data: unknown }>): Response {
    const lines = events
      .flatMap(({ event, data }) => [`event: ${event}`, `data: ${JSON.stringify(data)}`, ""])
      .join("\n");

    const encoder = new TextEncoder();
    const bytes = encoder.encode(lines);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }

  it("calls /api/chat/resume with taskId", async () => {

    fetchMock.mockResolvedValue(
      makeSSEStream([
        { event: "task_started", data: { taskId: "task-resume", resumed: true } },
        { event: "complete", data: { role: "assistant", content: "resumed!" } },
      ])
    );

    const { genSlice } = makeStore([
      makeConv({ id: "conv-1", pendingTaskId: "task-resume" }),
    ]);

    await genSlice.resumeFromTask("conv-1", "task-resume");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/chat/resume"),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ taskId: "task-resume" }),
      })
    );
  });

  it("sets isGenerating during resume and clears on completion", async () => {
    fetchMock.mockResolvedValue(
      makeSSEStream([
        { event: "task_started", data: { taskId: "task-r2", resumed: true } },
        { event: "complete", data: { role: "assistant", content: "done" } },
      ])
    );

    const { genSlice, get } = makeStore([
      makeConv({ id: "conv-1", pendingTaskId: "task-r2" }),
    ]);

    const resumePromise = genSlice.resumeFromTask("conv-1", "task-r2");
    // isGenerating should be true during the request
    expect(get().isGenerating).toBe(true);

    await resumePromise;
    expect(get().isGenerating).toBe(false);
  });

  it("clears pendingTaskId after successful resume", async () => {
    fetchMock.mockResolvedValue(
      makeSSEStream([
        { event: "task_started", data: { taskId: "task-r3", resumed: true } },
        { event: "complete", data: { role: "assistant", content: "done" } },
      ])
    );

    const { genSlice, get } = makeStore([
      makeConv({ id: "conv-1", pendingTaskId: "task-r3" }),
    ]);

    await genSlice.resumeFromTask("conv-1", "task-r3");

    const conv = get().conversations.find((c) => c.id === "conv-1");
    expect(conv?.pendingTaskId).toBeUndefined();
  });

  it("clears isGenerating and pendingTaskId even on 404 response", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Task not found: task-gone" }), { status: 404 })
    );

    const { genSlice, get } = makeStore([
      makeConv({ id: "conv-1", pendingTaskId: "task-gone" }),
    ]);

    await genSlice.resumeFromTask("conv-1", "task-gone");

    expect(get().isGenerating).toBe(false);
    const conv = get().conversations.find((c) => c.id === "conv-1");
    expect(conv?.pendingTaskId).toBeUndefined();
  });
});
