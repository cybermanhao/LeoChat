// packages/leochat-sdk/src/__tests__/skill.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("fs", () => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { listSkills, loadSkillContent } from "../skill.js";

const mockReaddir = vi.mocked(readdirSync);
const mockRead = vi.mocked(readFileSync);
const mockExists = vi.mocked(existsSync);
const mockStat = vi.mocked(statSync);

const SKILL_MD = `---
name: my-skill
description: Does something cool
---
# Body content here
Some instructions.`;

describe("listSkills", () => {
  afterEach(() => vi.clearAllMocks());

  it("目录不存在时返回空数组", () => {
    mockExists.mockReturnValue(false);
    expect(listSkills("/fake/skills")).toEqual([]);
  });

  it("返回合法 skill 目录的元数据", () => {
    // existsSync: true for dir and SKILL.md, false for references
    mockExists.mockImplementation((p) => !String(p).includes("references"));
    mockReaddir.mockReturnValue(["my-skill"] as any);
    mockStat.mockReturnValue({ isDirectory: () => true } as any);
    mockRead.mockReturnValue(SKILL_MD);

    const result = listSkills("/skills");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my-skill");
    expect(result[0].description).toBe("Does something cool");
  });

  it("跳过不含 SKILL.md 的子目录", () => {
    mockExists.mockImplementation((p) => {
      const s = String(p);
      // skills dir exists, but SKILL.md doesn't
      return s === "/skills" || s.endsWith("my-skill");
    });
    mockReaddir.mockReturnValue(["my-skill"] as any);
    mockStat.mockReturnValue({ isDirectory: () => true } as any);

    expect(listSkills("/skills")).toEqual([]);
  });
});

describe("loadSkillContent", () => {
  afterEach(() => vi.clearAllMocks());

  it("返回正确的 meta 和 body", () => {
    mockExists.mockReturnValue(false); // no references dir
    mockRead.mockReturnValue(SKILL_MD);

    const result = loadSkillContent("/skills/my-skill");
    expect(result.meta.name).toBe("my-skill");
    expect(result.body).toContain("Body content here");
    expect(result.references).toEqual([]);
  });
});
