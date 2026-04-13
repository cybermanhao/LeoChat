// packages/leochat-cli/src/__tests__/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@leochat/sdk", () => ({
  LeoAgent: vi.fn(),
}));

import { LeoAgent } from "@leochat/sdk";
import { run } from "../index.js";

function buildMockAgent(overrides: Record<string, unknown> = {}) {
  return {
    loadConfig: vi.fn().mockReturnThis(),
    setModel: vi.fn().mockReturnThis(),
    setSystemPrompt: vi.fn().mockReturnThis(),
    loadSkills: vi.fn().mockReturnThis(),
    onToolCall: vi.fn().mockReturnThis(),
    onToolCalled: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ainvoke: vi.fn().mockResolvedValue({
      text: "Mock response",
      toolCalls: [],
      usage: { input: 10, output: 5 },
      history: [],
    }),
    ...overrides,
  };
}

describe("CLI", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let mockAgent: ReturnType<typeof buildMockAgent>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockAgent = buildMockAgent();
    vi.mocked(LeoAgent).mockImplementation(() => mockAgent as any);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("-o json 输出合法 JSON，包含 text / toolCalls / usage", async () => {
    await run(["node", "leochat", "--output", "json", "hello"]);

    const output = (stdoutSpy.mock.calls as string[][])
      .map(([arg]) => arg)
      .join("");
    const parsed = JSON.parse(output);
    expect(parsed).toMatchObject({
      text: "Mock response",
      toolCalls: [],
      usage: { input: 10, output: 5 },
    });
  });

  it("默认模式输出 result.text 到 stdout", async () => {
    await run(["node", "leochat", "hello"]);

    const output = (stdoutSpy.mock.calls as string[][])
      .map(([arg]) => arg)
      .join("");
    expect(output).toContain("Mock response");
  });

  it("ainvoke 抛出时写 stderr 并以 code 1 退出", async () => {
    mockAgent.ainvoke = vi.fn().mockRejectedValue(new Error("API failed"));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await run(["node", "leochat", "hello"]);

    const errOutput = (stderrSpy.mock.calls as string[][])
      .map(([arg]) => arg)
      .join("");
    expect(errOutput).toContain("API failed");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("无 query 且非 -i 时不调用 ainvoke", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await run(["node", "leochat"]);

    expect(mockAgent.ainvoke).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
