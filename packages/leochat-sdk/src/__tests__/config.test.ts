// packages/leochat-sdk/src/__tests__/config.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from "fs";
import { loadConfig } from "../config.js";

const mockRead = vi.mocked(readFileSync);

describe("loadConfig", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.TEST_SDK_KEY;
  });

  it("合法 JSON 正确解析为 SdkConfig", () => {
    mockRead.mockReturnValue('{"mcpServers": {}, "systemPrompt": "hi"}');
    const result = loadConfig("./mcp.json");
    expect(result.systemPrompt).toBe("hi");
    expect(result.mcpServers).toEqual({});
  });

  it("展开 ${ENV_VAR} 占位符", () => {
    process.env.TEST_SDK_KEY = "sk-abc";
    mockRead.mockReturnValue(
      '{"defaultLLM": {"apiKey": "${TEST_SDK_KEY}", "provider": "openai", "model": "gpt-4o"}}'
    );
    const result = loadConfig("./mcp.json");
    expect((result.defaultLLM as any).apiKey).toBe("sk-abc");
  });

  it("文件不存在时抛出包含路径的错误", () => {
    mockRead.mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });
    expect(() => loadConfig("./missing.json")).toThrow("Cannot read config file");
  });

  it("非法 JSON 时抛出解析错误", () => {
    mockRead.mockReturnValue("{ not valid json");
    expect(() => loadConfig("./bad.json")).toThrow("Invalid JSON");
  });
});
