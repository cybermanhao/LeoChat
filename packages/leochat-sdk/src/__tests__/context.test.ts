import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../context.js";

describe("buildSystemPrompt", () => {
  it("无 slots 时返回原始 base prompt", () => {
    expect(buildSystemPrompt("You are helpful.", [])).toBe("You are helpful.");
  });

  it("单个 slot 注入为 <context> 标签", () => {
    const result = buildSystemPrompt("Base.", [
      { key: "skill:test", content: "Do the thing." },
    ]);
    expect(result).toBe(
      'Base.\nAs you answer the user\'s questions, you can use the following context:\n<context name="skill:test">Do the thing.</context>'
    );
  });

  it("多个 slots 按顺序拼接", () => {
    const result = buildSystemPrompt("Base.", [
      { key: "a", content: "First" },
      { key: "b", content: "Second" },
    ]);
    expect(result).toContain('<context name="a">First</context>');
    expect(result).toContain('<context name="b">Second</context>');
    expect(result.indexOf('<context name="a">')).toBeLessThan(
      result.indexOf('<context name="b">')
    );
  });

  it("base 为空字符串时输出包含 slot 内容", () => {
    const result = buildSystemPrompt("", [{ key: "k", content: "content" }]);
    expect(result).toContain('<context name="k">content</context>');
  });
});
