import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Provider } from "@leochat/core";
import { scriptedProvider, textTurn, toolTurn } from "@leochat/core/testing";
import { EXIT, main } from "../src/index";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leochat-cli-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function io(provider?: Provider, extra: { interrupt?: AbortSignal; env?: Record<string, string> } = {}) {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: {
      stdout: { write: (s: string) => out.push(s) },
      stderr: { write: (s: string) => err.push(s) },
      env: extra.env ?? {},
      cwd: dir,
      ...(provider ? { provider } : {}),
      ...(extra.interrupt ? { interrupt: extra.interrupt } : {}),
    },
    stdout: () => out.join(""),
    stderr: () => err.join(""),
  };
}
const convIdOf = (stderr: string) => /\[会话\] (\S+)/.exec(stderr)![1]!;

describe("leochat goal", () => {
  it("runs rounds until complete: reply on stdout, progress on stderr, exit 0, then --status", async () => {
    const t = io(scriptedProvider([textTurn("First draft."), toolTurn([{ id: "c", name: "update_goal", args: { action: "complete" } }]), textTurn("Finished the poem.")]));
    const code = await main(["goal", "write", "a", "poem"], t.io);
    expect(code).toBe(EXIT.ok);
    expect(t.stdout()).toContain("First draft.");
    expect(t.stdout()).toContain("Finished the poem.");
    expect(t.stdout()).not.toContain("目标第"); // 进度不进 stdout
    expect(t.stderr()).toContain("── 目标第 1 轮 ──");
    expect(t.stderr()).toContain("── 目标第 2 轮 ──");
    expect(t.stderr()).toContain("[目标] 已完成");

    const s = io();
    expect(await main(["goal", "--status", convIdOf(t.stderr())], s.io)).toBe(EXIT.ok);
    expect(s.stdout()).toMatch(/已完成\t第 2\/256 轮\twrite a poem/);
  });

  it("exits 2 when the rounds run out, and --resume --extra-rounds continues the same goal", async () => {
    const first = io(scriptedProvider([textTurn("still working")]));
    expect(await main(["goal", "--max-rounds", "1", "sort the files"], first.io)).toBe(EXIT.blocked);
    expect(first.stderr()).toContain("卡住了");
    const id = convIdOf(first.stderr());

    const second = io(scriptedProvider([toolTurn([{ id: "c", name: "update_goal", args: { action: "complete" } }]), textTurn("done")]));
    expect(await main(["goal", "--resume", id, "--extra-rounds", "2"], second.io)).toBe(EXIT.ok);
    expect(second.stderr()).toContain("── 目标第 2 轮 ──");
    const s = io();
    await main(["goal", "--status", id], s.io);
    expect(s.stdout()).toMatch(/已完成\t第 2\/3 轮/);
  });

  it("first interrupt pauses the goal (exit 3)", async () => {
    const ac = new AbortController();
    const t = io(scriptedProvider([textTurn("a long answer streaming slowly", { chunkSize: 2, delayMs: 20 })]), { interrupt: ac.signal });
    setTimeout(() => ac.abort(), 60);
    expect(await main(["goal", "long", "task"], t.io)).toBe(EXIT.stopped);
    const s = io();
    await main(["goal", "--status", convIdOf(t.stderr())], s.io);
    expect(s.stdout()).toMatch(/^已暂停/);
  });

  it("uses stdio MCP servers from --mcp as tools", async () => {
    const server = resolve(__dirname, "../../leochat-mcp/dist/index.js");
    await writeFile(join(dir, "mcp.json"), JSON.stringify({ mcpServers: { leochat: { command: process.execPath, args: [server] } } }));
    const provider = scriptedProvider([
      toolTurn([{ id: "t1", name: "test_tool_call", args: { duration: 0, message: "hello-from-cli" } }]),
      toolTurn([{ id: "c", name: "update_goal", args: { action: "complete" } }]),
      textTurn("ok"),
    ]);
    const t = io(provider);
    expect(await main(["goal", "--mcp", "mcp.json", "call the test tool"], t.io)).toBe(EXIT.ok);
    expect(provider.requests[0]!.tools?.map((x) => x.name)).toEqual(expect.arrayContaining(["test_tool_call", "get_goal", "update_goal"]));
    expect(t.stderr()).toMatch(/\[工具\] ✓/);
  }, 30_000);
});

describe("leochat chat / list / usage", () => {
  it("chat prints the reply; --continue appends to the same conversation", async () => {
    const a = io(scriptedProvider([textTurn("Hello!")]));
    expect(await main(["chat", "hi"], a.io)).toBe(EXIT.ok);
    expect(a.stdout().trim()).toBe("Hello!");
    const id = convIdOf(a.stderr());
    const b = io(scriptedProvider([textTurn("Again.")]), {});
    expect(await main(["chat", "--continue", id, "-q", "again"], b.io)).toBe(EXIT.ok);
    expect(b.stderr()).toBe(""); // -q 不输出进度
    const l = io();
    await main(["list"], l.io);
    expect(l.stdout().trim().split("\n")).toHaveLength(1);
  });

  it("reports usage errors with exit 64", async () => {
    expect(await main([], io().io)).toBe(EXIT.usage);
    expect(await main(["chat"], io().io)).toBe(EXIT.usage);
    expect(await main(["goal", "--max-rounds", "0", "x"], io(scriptedProvider([])).io)).toBe(EXIT.usage);
    expect(await main(["goal", "--resume", "conv_missing"], io(scriptedProvider([])).io)).toBe(EXIT.usage);
    const noKey = io();
    expect(await main(["chat", "hi"], noKey.io)).toBe(EXIT.usage);
    expect(noKey.stderr()).toContain("DEEPSEEK_API_KEY");
    expect(await main(["--help"], io().io)).toBe(EXIT.ok);
  });
});
