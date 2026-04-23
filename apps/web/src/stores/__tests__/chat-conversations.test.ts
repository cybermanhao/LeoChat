import { describe, it, expect, vi, beforeEach } from "vitest";
import { createConversationsSlice } from "../chat-conversations.js";
import type { ChatState, Conversation } from "../chat-types.js";

// 直接测试 slice 函数，绕过 Zustand store 初始化
function makeSlice() {
  let state: Partial<ChatState> = {
    conversations: [],
    currentConversationId: null,
    input: "",
    isGenerating: false,
    cardStatus: "stable" as const,
    toolCallStates: {},
    activeTaskLoop: null,
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
  const slice = createConversationsSlice(set as any, get);

  return { slice, get, set };
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "conv-1",
    title: "Test",
    displayMessages: [{ id: "m1", role: "user", contentItems: [], createdAt: Date.now() } as any],
    contextMessages: [{ id: "m1", role: "user", content: "hello" } as any],
    internalMessages: [{ role: "user", content: "hello" } as any],
    createdAt: Date.now(),
    updatedAt: 0,
    ...overrides,
  };
}

describe("clearCurrentConversation", () => {
  let slice: ReturnType<typeof makeSlice>["slice"];
  let get: ReturnType<typeof makeSlice>["get"];

  beforeEach(() => {
    const result = makeSlice();
    slice = result.slice;
    get = result.get;
  });

  it("currentConversationId 为 null 时什么都不做", () => {
    const conv = makeConversation();
    get().conversations = [conv];
    get().currentConversationId = null;

    slice.clearCurrentConversation();
    expect(get().conversations).toHaveLength(1);
    expect(get().conversations[0].displayMessages).toHaveLength(1);
  });

  it("清空当前对话的所有消息", () => {
    const conv = makeConversation();
    get().conversations = [conv];
    get().currentConversationId = "conv-1";

    slice.clearCurrentConversation();

    const updated = get().conversations.find((c) => c.id === "conv-1")!;
    expect(updated.displayMessages).toHaveLength(0);
    expect(updated.contextMessages).toHaveLength(0);
    expect(updated.internalMessages).toHaveLength(0);
  });

  it("更新 updatedAt 时间戳", () => {
    const conv = makeConversation({ updatedAt: 0 });
    get().conversations = [conv];
    get().currentConversationId = "conv-1";

    slice.clearCurrentConversation();

    const updated = get().conversations.find((c) => c.id === "conv-1")!;
    expect(updated.updatedAt).toBeGreaterThan(0);
  });

  it("重置生成状态", () => {
    const conv = makeConversation();
    get().conversations = [conv];
    get().currentConversationId = "conv-1";
    get().isGenerating = true;
    get().toolCallStates = { tc1: {} as any };

    slice.clearCurrentConversation();

    expect(get().isGenerating).toBe(false);
    expect(get().activeTaskLoop).toBeNull();
    expect(get().cardStatus).toBe("stable");
    expect(get().toolCallStates).toEqual({});
  });

  it("生成中时调用 cancelGeneration", () => {
    const cancelGeneration = vi.fn();
    const conv = makeConversation();
    get().conversations = [conv];
    get().currentConversationId = "conv-1";
    get().isGenerating = true;
    get().cancelGeneration = cancelGeneration;

    slice.clearCurrentConversation();
    expect(cancelGeneration).toHaveBeenCalledTimes(1);
  });

  it("不影响其他对话", () => {
    const conv1 = makeConversation({ id: "conv-1" });
    const conv2 = makeConversation({
      id: "conv-2",
      displayMessages: [{ id: "m2", role: "assistant", contentItems: [] } as any],
    });
    get().conversations = [conv1, conv2];
    get().currentConversationId = "conv-1";

    slice.clearCurrentConversation();

    const other = get().conversations.find((c) => c.id === "conv-2")!;
    expect(other.displayMessages).toHaveLength(1);
  });
});
