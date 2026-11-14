import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  d1Store,
  defineTool,
  deferAnswerer,
  memoryStore,
  resume,
  run,
  userMessage,
  type D1Like,
  type D1StatementLike,
  type PausedRun,
  type SessionStore,
} from "../src/index";
import { scriptedProvider, textTurn, toolTurn } from "../src/testing/index";

/** 用 Node 内置的 node:sqlite 模拟 D1（真实 SQL，含 RETURNING 和事务） */
async function sqliteD1(): Promise<D1Like> {
  // 用 process.getBuiltinModule 取内置模块：既不给 core 引入 @types/node，也绕过 vitest 2 不认识 node:sqlite 的问题
  const proc = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process;
  const mod = proc.getBuiltinModule("node:sqlite") as {
    DatabaseSync: new (path: string) => {
      prepare(sql: string): { get(...v: unknown[]): unknown; run(...v: unknown[]): { changes: number | bigint } };
      exec(sql: string): void;
    };
  };
  const db = new mod.DatabaseSync(":memory:");
  const stmt = (sql: string, values: unknown[] = []): D1StatementLike => ({
    bind: (...v) => stmt(sql, v),
    first: async <T>() => (db.prepare(sql).get(...values) as T | undefined) ?? null,
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...values).changes) } }),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (statements) => {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

const paused = (runId = "run_1"): PausedRun => ({
  runId,
  transcript: [userMessage("x", "m1")],
  approvals: [{ approvalId: "apr_1", callId: "c1", toolName: "send", consumed: false }],
  partialResults: [],
  usage: { inputTokens: 1, outputTokens: 1 },
  createdAt: 1000,
});

function storeContract(name: string, make: (now: () => number) => Promise<SessionStore>) {
  describe(`SessionStore contract: ${name}`, () => {
    it("saves and loads, deletes", async () => {
      const s = await make(() => 0);
      await s.savePaused(paused());
      expect(await s.loadPaused("run_1")).toEqual(paused());
      await s.deletePaused("run_1");
      expect(await s.loadPaused("run_1")).toBeNull();
    });

    it("consumes an approval exactly once, and re-saving keeps it consumed", async () => {
      const s = await make(() => 0);
      await s.savePaused(paused());
      expect(await s.consumeApproval("run_1", "apr_1")).toEqual({ callId: "c1" });
      expect(await s.consumeApproval("run_1", "apr_1")).toBeNull();
      expect(await s.consumeApproval("run_1", "nope")).toBeNull();
      await s.savePaused(paused());
      expect((await s.loadPaused("run_1"))!.approvals[0]!.consumed).toBe(true);
    });

    it("claims atomically, expires after the TTL, and releases on save", async () => {
      let t = 0;
      const s = await make(() => t);
      await s.savePaused(paused());
      expect(await s.claimPaused("run_1", 1000)).toBe(true);
      expect(await s.claimPaused("run_1", 1000)).toBe(false);
      t = 2000; // 认领过期（处理它的进程可能崩溃了）
      expect(await s.claimPaused("run_1", 1000)).toBe(true);
      await s.savePaused(paused()); // 再次暂停会解除认领
      expect(await s.claimPaused("run_1", 1000)).toBe(true);
      expect(await s.claimPaused("missing", 1000)).toBe(false);
    });
  });
}

storeContract("memoryStore", async (now) => memoryStore(now));
storeContract("d1Store (sqlite)", async (now) => {
  const s = d1Store(await sqliteD1(), now);
  await s.migrate();
  return s;
});

describe("resume() with a real SQL store", () => {
  const send = defineTool({
    name: "send",
    description: "",
    input: z.object({}),
    needsApproval: true,
    execute: () => ({ content: "sent" }),
  });

  it("pauses, resumes, and refuses a concurrent second resume", async () => {
    const store = d1Store(await sqliteD1());
    await store.migrate();
    const provider = scriptedProvider([toolTurn([{ id: "c1", name: "send", args: {} }]), textTurn("Sent.", { delayMs: 5 })]);
    const common = { provider, model: "m", tools: [send], approval: { answerers: [deferAnswerer] }, store };
    const first = await run({ ...common, messages: [userMessage("send")] }).result;
    expect(first.reason).toBe("awaiting_approval");
    const decisions = { [first.pending![0]!.approvalId]: { outcome: "allowed-once" as const } };

    // 用户连点两次"同意"：两个 resume 同时进来
    const [a, b] = await Promise.all([
      resume({ ...common, runId: first.runId, decisions }).result,
      resume({ ...common, runId: first.runId, decisions }).result,
    ]);
    const reasons = [a.reason, b.reason].sort();
    expect(reasons).toEqual(["completed", "error"]);
    const loser = a.reason === "error" ? a : b;
    expect(loser.error?.kind).toBe("conflict");
    const winner = a.reason === "completed" ? a : b;
    expect(winner.transcript.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(await store.loadPaused(first.runId)).toBeNull();
  });
});
