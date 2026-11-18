import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadAgentInstructions, withInstructions } from "../src/index";

let root: string;
let env: Record<string, string>;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "leochat-instr-"));
  env = { LEOCHAT_HOME: join(root, "home"), LEOCHAT_AGENTS_HOME: join(root, "agents") };
  await mkdir(env.LEOCHAT_HOME!, { recursive: true });
  await mkdir(env.LEOCHAT_AGENTS_HOME!, { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const w = async (path: string, content: string) => {
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, content);
};

describe("loadAgentInstructions (dsh agent-instructions)", () => {
  it("loads global then project files from the root down to cwd, base before local overlay", async () => {
    await w(join(env.LEOCHAT_HOME!, "AGENTS.md"), "global rules");
    await w(join(env.LEOCHAT_AGENTS_HOME!, "AGENTS.md"), "shared agents rules");
    const repo = join(root, "repo");
    await mkdir(join(repo, ".git"), { recursive: true });
    await w(join(repo, "AGENTS.md"), "repo rules");
    await w(join(repo, "pkg", "sub", "AGENTS.md"), "sub rules");
    await w(join(repo, "pkg", "sub", "AGENTS.local.md"), "my local tweaks");
    const r = await loadAgentInstructions({ cwd: join(repo, "pkg", "sub"), env });
    expect(r.files.map((f) => [f.scope, f.content])).toEqual([
      ["global", "global rules"],
      ["global", "shared agents rules"],
      ["project", "repo rules"],
      ["project", "sub rules"],
      ["project", "my local tweaks"],
    ]);
    expect(r.text).toMatch(/^The following instruction files/);
    expect(r.text.indexOf("repo rules")).toBeLessThan(r.text.indexOf("sub rules"));
  });

  it("collapses duplicates: CLAUDE.md copied from AGENTS.md, and a project file equal to the global one", async () => {
    await w(join(env.LEOCHAT_HOME!, "AGENTS.md"), "same everywhere");
    const repo = join(root, "repo");
    await mkdir(join(repo, ".git"), { recursive: true });
    await w(join(repo, "AGENTS.md"), "  same everywhere\n");
    await w(join(repo, "app", "AGENTS.md"), "app rules");
    await w(join(repo, "app", "CLAUDE.md"), "app rules\n");
    const r = await loadAgentInstructions({ cwd: join(repo, "app"), env });
    expect(r.files.map((f) => f.content)).toEqual(["same everywhere", "app rules"]);
  });

  it("without a project root marker only cwd is used; without cwd only global files", async () => {
    await w(join(root, "outer", "AGENTS.md"), "outer");
    await w(join(root, "outer", "inner", "AGENTS.md"), "inner");
    expect((await loadAgentInstructions({ cwd: join(root, "outer", "inner"), env })).files.map((f) => f.content)).toEqual(["inner"]);
    expect(await loadAgentInstructions({ env })).toEqual({ text: "", files: [], omitted: [] });
    expect(withInstructions("sys", { text: "", files: [], omitted: [] })).toBe("sys");
  });

  it("keeps the most specific files under the byte budget: drops broad files first, then truncates", async () => {
    await w(join(env.LEOCHAT_HOME!, "AGENTS.md"), "g".repeat(400));
    const repo = join(root, "repo");
    await mkdir(join(repo, ".git"), { recursive: true });
    await w(join(repo, "AGENTS.md"), "r".repeat(400));
    await w(join(repo, "deep", "AGENTS.md"), "最具体".repeat(200));
    const r = await loadAgentInstructions({ cwd: join(repo, "deep"), env, maxBytes: 700 });
    expect(Buffer.byteLength(r.text)).toBeLessThanOrEqual(700);
    expect(r.omitted).toEqual([join(env.LEOCHAT_HOME!, "AGENTS.md"), join(repo, "AGENTS.md")]);
    expect(r.truncated).toBe(join(repo, "deep", "AGENTS.md"));
    expect(r.text).toContain("最具体");
    expect(r.text).not.toContain("�");
    expect(withInstructions("you are helpful", r)).toMatch(/<\/instructions>\n\nyou are helpful$/);
  });
});

describe("displayPath", () => {
  it("shows files under the home directory as ~/... and leaves others as they are", async () => {
    const { displayPath } = await import("../src/agent-instructions");
    const r = String.raw;
    expect(displayPath(r`C:\Users\someone\.leochat\AGENTS.md`, r`C:\Users\someone`)).toBe("~/.leochat/AGENTS.md");
    expect(displayPath(r`c:\users\SOMEONE\proj\AGENTS.md`, r`C:\Users\someone\ `.trim())).toBe("~/proj/AGENTS.md");
    expect(displayPath("/home/someone/.agents/AGENTS.md", "/home/someone")).toBe("~/.agents/AGENTS.md");
    expect(displayPath(r`D:\work\repo\AGENTS.md`, r`C:\Users\someone`)).toBe("D:/work/repo/AGENTS.md");
    expect(displayPath(r`C:\Users\someone2\AGENTS.md`, r`C:\Users\someone`)).toBe("C:/Users/someone2/AGENTS.md");
  });
});
