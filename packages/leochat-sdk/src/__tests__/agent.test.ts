// packages/leochat-sdk/src/__tests__/agent.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ai-chatbox/mcp-core", () => ({
  TaskLoop: vi.fn(),
  MCPClient: vi.fn(),
}));

import { TaskLoop, MCPClient } from "@ai-chatbox/mcp-core";
import { LeoAgent } from "../agent.js";
import type { LLMConfig } from "../types.js";

const mockLLMConfig: LLMConfig = {
  provider: "openai",
  model: "gpt-4o",
  apiKey: "test-key",
};

/** 构造一个按顺序 emit 事件的 TaskLoop mock */
function makeTaskLoopMock(events: unknown[]) {
  vi.mocked(TaskLoop).mockImplementation(() => {
    let listener: ((e: unknown) => void) | null = null;
    return {
      subscribe: vi.fn((cb) => {
        listener = cb;
        return () => {};
      }),
      start: vi.fn(async () => {
        for (const event of events) listener?.(event);
      }),
      registerOnToolCall: vi.fn(),
      registerOnToolCalled: vi.fn(),
    } as any;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(MCPClient).mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    availableTools: [],
    serverName: "test-server",
  }) as any);
});

describe("LeoAgent.ainvoke()", () => {
  it("未配置 LLM 时抛出明确错误", async () => {
    const agent = new LeoAgent();
    await expect(agent.ainvoke("hello")).rejects.toThrow("LLM not configured");
  });

  it("聚合 content_delta 到 result.text", async () => {
    makeTaskLoopMock([
      { type: "update", delta: { content_delta: "Hello " } },
      { type: "update", delta: { content_delta: "world" } },
      { type: "done", internalMessages: [], totalTokens: { input: 10, output: 5 } },
    ]);
    const agent = new LeoAgent().setLLM(mockLLMConfig);
    const result = await agent.ainvoke("test");
    expect(result.text).toBe("Hello world");
  });

  it("toolcall + toolresult 事件填充 result.toolCalls", async () => {
    makeTaskLoopMock([
      { type: "toolcall", toolCall: { id: "tc1", name: "search", arguments: { q: "x" } } },
      { type: "toolresult", toolCallId: "tc1", result: "found it", duration: 42 },
      { type: "done", internalMessages: [], totalTokens: { input: 5, output: 3 } },
    ]);
    const agent = new LeoAgent().setLLM(mockLLMConfig);
    const result = await agent.ainvoke("test");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      id: "tc1",
      name: "search",
      result: "found it",
      duration: 42,
    });
  });

  it("done 事件的 totalTokens 映射到 result.usage", async () => {
    makeTaskLoopMock([
      { type: "done", internalMessages: [], totalTokens: { input: 100, output: 50 } },
    ]);
    const agent = new LeoAgent().setLLM(mockLLMConfig);
    const result = await agent.ainvoke("test");
    expect(result.usage).toEqual({ input: 100, output: 50 });
  });

  it("error 事件导致 ainvoke() reject", async () => {
    makeTaskLoopMock([
      { type: "error", error: new Error("API failed") },
    ]);
    const agent = new LeoAgent().setLLM(mockLLMConfig);
    await expect(agent.ainvoke("test")).rejects.toThrow("API failed");
  });

  it("setModel 在无现有配置时不抛出，getLLMConfig 返回正确 model", () => {
    const agent = new LeoAgent();
    expect(() => agent.setModel("gpt-4o")).not.toThrow();
    expect(agent.getLLMConfig()?.model).toBe("gpt-4o");
  });
});
