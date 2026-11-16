import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { defineTool, deferAnswerer, loadSkillTool, resume, run, skillCatalog, userMessage, type PausedRun, type ToolResultBlock } from "@leochat/core";
import { scriptedProvider, textTurn, toolTurn } from "@leochat/core/testing";
import { fsSkills, jsonlStore, parseSkillMd, stdioMcpTools } from "../src/index";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leochat-node-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const paused = (runId = "run_1"): PausedRun => ({
  runId,
  transcript: [userMessage("x", "m1")],
  approvals: [{ approvalId: "apr_1", callId: "c1", toolName: "send", consumed: false }],
  partialResults: [],
  usage: { inputTokens: 1, outputTokens: 1 },
  createdAt: 1000,
});

describe("jsonlStore", () => {
  it("satisfies the SessionStore contract", async () => {
    let t = 0;
    const s = await jsonlStore(dir, { now: () => t });
    await s.savePaused(paused());
    expect(await s.loadPaused("run_1")).toEqual(paused());
    expect(await s.claimPaused("run_1", 1000)).toBe(true);
    expect(await s.claimPaused("run_1", 1000)).toBe(false);
    t = 2000;
    expect(await s.claimPaused("run_1", 1000)).toBe(true); // 过期后可以重新认领
    expect(await s.consumeApproval("run_1", "apr_1")).toEqual({ callId: "c1" });
    expect(await s.consumeApproval("run_1", "apr_1")).toBeNull();
    await s.savePaused(paused()); // 重新保存不能把已消费重置
    expect((await s.loadPaused("run_1"))!.approvals[0]!.consumed).toBe(true);
    expect(await s.claimPaused("run_1", 1000)).toBe(true); // 再次暂停时解除了认领
    await s.deletePaused("run_1");
    expect(await s.loadPaused("run_1")).toBeNull();
    expect(await s.claimPaused("missing", 1000)).toBe(false);
  });

  it("consumes an approval exactly once under concurrency, across store instances", async () => {
    const a = await jsonlStore(dir);
    const b = await jsonlStore(dir); // 模拟另一个进程
    await a.savePaused(paused());
    const results = await Promise.all(Array.from({ length: 10 }, (_, i) => (i % 2 ? a : b).consumeApproval("run_1", "apr_1")));
    expect(results.filter((r) => r !== null)).toHaveLength(1);
    const claims = await Promise.all([a.claimPaused("run_1", 60_000), b.claimPaused("run_1", 60_000)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    expect((await readdir(dir)).some((f) => f.endsWith(".mutex"))).toBe(false); // 短锁都释放了
  });

  it("rejects run ids that could escape the directory", async () => {
    const s = await jsonlStore(dir);
    await expect(s.loadPaused("../etc/passwd")).rejects.toThrow(/invalid runId/);
    await expect(s.savePaused(paused("a/b"))).rejects.toThrow(/invalid runId/);
  });

  it("appends and reads the event log, including compaction archives", async () => {
    const s = await jsonlStore(dir);
    await s.appendEvents("run_1", [{ type: "run_start", runId: "run_1", at: 1 }]);
    await s.archiveMessages("run_1", [userMessage("old", "m0")]);
    const events = await s.readEvents("run_1");
    expect(events.map((e) => e.type)).toEqual(["run_start", "custom"]);
    expect(await s.readEvents("nothing")).toEqual([]);
  });

  it("drives a real pause/resume through core", async () => {
    const store = await jsonlStore(dir);
    const send = defineTool({ name: "send", description: "", input: z.object({}), needsApproval: true, execute: () => ({ content: "sent" }) });
    const provider = scriptedProvider([toolTurn([{ id: "c1", name: "send", args: {} }]), textTurn("Sent.")]);
    const common = { provider, model: "m", tools: [send], approval: { answerers: [deferAnswerer] }, store };
    const first = await run({ ...common, messages: [userMessage("send it")] }).result;
    expect(first.reason).toBe("awaiting_approval");
    const second = await resume({ ...common, runId: first.runId, decisions: { [first.pending![0]!.approvalId]: { outcome: "allowed-once" } } }).result;
    expect(second.reason).toBe("completed");
    expect(await store.loadPaused(first.runId)).toBeNull();
  });
});

describe("fsSkills", () => {
  const write = async (root: string, name: string, content: string) => {
    await mkdir(join(root, name), { recursive: true });
    await writeFile(join(root, name, "SKILL.md"), content);
  };

  it("parses CRLF, quotes, arrays, booleans and folded blocks", () => {
    const md = '---\r\nname: "pdf"\r\ndescription: >\r\n  Fill PDF forms\r\n  and extract text.\r\ntags: [a, "b"]\r\nuser-invocable: false\r\n---\r\n# PDF\r\nBody.\r\n';
    const { meta, body } = parseSkillMd(md);
    expect(meta).toEqual({ name: "pdf", description: "Fill PDF forms and extract text.", tags: ["a", "b"], "user-invocable": false });
    expect(body).toBe("# PDF\nBody.");
    expect(parseSkillMd("no frontmatter here").body).toBe("no frontmatter here");
  });

  it("scans roots in order, skips model-hidden skills, and loads bodies on demand", async () => {
    const project = join(dir, "project");
    const user = join(dir, "user");
    await write(project, "pdf", "---\nname: pdf\ndescription: Project PDF skill\n---\nproject body");
    await write(user, "pdf", "---\nname: pdf\ndescription: User PDF skill\n---\nuser body");
    await write(user, "excel", "---\ndescription: Excel helper\n---\nexcel body"); // 没写 name，用目录名
    await write(user, "secret", "---\nname: secret\ndescription: x\ndisable-model-invocation: true\n---\nhidden");
    await mkdir(join(user, "not-a-skill"), { recursive: true });
    const skills = fsSkills([project, user, join(dir, "missing")]);
    expect(await skills.list()).toEqual([
      { name: "pdf", description: "Project PDF skill" },
      { name: "excel", description: "Excel helper" },
    ]);
    expect(await skills.load("pdf")).toBe("project body");
    expect(await skills.load("secret")).toBeNull();
    expect(skillCatalog(await skills.list())).toContain("- excel: Excel helper");

    const tool = loadSkillTool(skills);
    const ctx = { runId: "r", callId: "c", signal: new AbortController().signal, app: {}, emit: () => {}, update: () => {} };
    expect(await tool.execute({ name: "excel" }, ctx)).toMatchObject({ content: "excel body" });
  });
});

describe("stdioMcpTools", () => {
  it("runs a real stdio MCP server as a tool source and closes it when the run ends", async () => {
    const server = resolve(__dirname, "../../leochat-mcp/dist/index.js");
    const source = stdioMcpTools({ command: process.execPath, args: [server], stderr: "ignore" });
    const provider = scriptedProvider([
      toolTurn([{ id: "c1", name: "test_tool_call", args: { duration: 0, message: "hello-stdio" } }]),
      textTurn("done"),
    ]);
    const r = await run({ provider, model: "m", messages: [userMessage("test")], tools: [source] }).result;
    expect(r.reason).toBe("completed");
    expect(provider.requests[0]!.tools?.map((t) => t.name)).toContain("test_tool_call");
    const result = r.transcript[2]!.content[0] as ToolResultBlock;
    expect(result.isError).toBeFalsy();
    expect(JSON.stringify(result.content)).toContain("hello-stdio");
  }, 30_000);
});

describe("conversationLog", () => {
  it("creates, appends ops, replays the transcript, renames, lists by recency, deletes", async () => {
    const { conversationLog } = await import("../src/index");
    let t = 1000;
    const log = await conversationLog(dir, { now: () => t++ });
    const a = await log.create("first");
    const b = await log.create("second");
    await log.append(a.id, { kind: "append", message: userMessage("hi", "m1") });
    await log.append(a.id, { kind: "append", message: { id: "m2", role: "assistant", content: [{ type: "text", text: "hello" }] } });
    await log.append(a.id, { kind: "reset", messages: [userMessage("summary", "s1")] });
    await log.append(a.id, { kind: "append", message: userMessage("again", "m3") });
    await log.setTitle(a.id, "renamed");
    const loaded = await log.load(a.id);
    expect(loaded!.transcript.map((m) => m.id)).toEqual(["s1", "m3"]);
    expect(loaded!.meta.title).toBe("renamed");
    expect((await log.list()).map((c) => c.id)).toEqual([a.id, b.id]);
    await log.delete(b.id);
    expect((await log.list()).map((c) => c.id)).toEqual([a.id]);
    expect(await log.load(b.id)).toBeNull();
  });

  it("survives a torn last line and rebuilds a lost index from the logs", async () => {
    const { conversationLog } = await import("../src/index");
    const { appendFile } = await import("node:fs/promises");
    const log = await conversationLog(dir);
    const c = await log.create("x");
    await log.append(c.id, { kind: "append", message: userMessage("kept", "m1") });
    await appendFile(join(dir, `${c.id}.jsonl`), '{"t":"op","op":{"kind":"append","mess'); // 崩溃时写了一半
    expect((await log.load(c.id))!.transcript.map((m) => m.id)).toEqual(["m1"]);
    await rm(join(dir, "index.json"));
    const fresh = await conversationLog(dir);
    expect((await fresh.list()).map((m) => m.id)).toEqual([c.id]);
  });

  it("works as run({ persist }) and resumes an interrupted tool call without re-running it", async () => {
    const { conversationLog } = await import("../src/index");
    const log = await conversationLog(dir);
    const conv = await log.create();
    let executions = 0;
    const tool = defineTool({ name: "pay", description: "", input: z.object({}), execute: () => (executions++, { content: "paid" }) });
    // 第一次运行：模型调用工具，但在工具执行时进程"崩溃"（中止）
    const first = run({
      provider: scriptedProvider([toolTurn([{ id: "c1", name: "pay", args: {} }])]),
      model: "m",
      messages: [userMessage("pay the bill", "u1")],
      tools: [defineTool({ name: "pay", description: "", input: z.object({}), execute: () => new Promise<never>(() => {}) })],
      persist: log.persistFor(conv.id),
    });
    await log.append(conv.id, { kind: "append", message: userMessage("pay the bill", "u1") });
    for await (const e of first) if (e.type === "tool_start") break; // 模拟进程在工具执行中途退出：不再处理后续
    first.abort();
    await first.result;
    // 重启：从日志恢复，继续对话
    const restored = (await log.load(conv.id))!.transcript;
    const r = await run({
      provider: scriptedProvider([textTurn("Not sure if it went through; please check.")]),
      model: "m",
      messages: [...restored, userMessage("did it work?", "u2")],
      tools: [tool],
      persist: log.persistFor(conv.id),
    }).result;
    expect(executions).toBe(0); // 中断的工具调用不会被重新执行
    expect(r.reason).toBe("completed");
    const toolResults = r.transcript.filter((m) => m.role === "tool").flatMap((m) => m.content) as ToolResultBlock[];
    expect(toolResults.every((b) => b.isError)).toBe(true);
  });
});
