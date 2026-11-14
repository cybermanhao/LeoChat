/**
 * SessionStore 实现与暂停式审批的应答者（设计文档 §4.1、§7.5）。
 * - memoryStore()：测试用，以及 GUI 的本地 server（单进程）
 * - d1Store(db)：Cloudflare D1（Workers）。只依赖一个最小的结构化接口，不引入 Workers 类型
 */
import type { Answerer, PausedRun, SessionStore } from "./run-types";

/** 内置应答者：直接返回 deferred，用于 serverless。没有配置 store 时 run() 启动即报错（C1） */
export const deferAnswerer: Answerer<unknown> = () => "deferred";

export function memoryStore(now: () => number = Date.now): SessionStore & { readonly size: number } {
  const runs = new Map<string, { run: PausedRun; claimedAt: number | null }>();
  return {
    get size() {
      return runs.size;
    },
    async savePaused(run) {
      // 保留已有审批的"已消费"状态（重新保存时不能把它重置成未消费）
      const prev = runs.get(run.runId)?.run.approvals;
      const approvals = run.approvals.map((a) => ({ ...a, consumed: a.consumed || (prev?.find((p) => p.approvalId === a.approvalId)?.consumed ?? false) }));
      runs.set(run.runId, { run: structuredClone({ ...run, approvals }), claimedAt: null });
    },
    async loadPaused(runId) {
      const r = runs.get(runId);
      return r ? structuredClone(r.run) : null;
    },
    async claimPaused(runId, ttlMs) {
      const r = runs.get(runId);
      if (!r) return false;
      if (r.claimedAt !== null && now() - r.claimedAt < ttlMs) return false;
      r.claimedAt = now();
      return true;
    },
    async deletePaused(runId) {
      runs.delete(runId);
    },
    async consumeApproval(runId, approvalId) {
      const a = runs.get(runId)?.run.approvals.find((x) => x.approvalId === approvalId);
      if (!a || a.consumed) return null;
      a.consumed = true;
      return { callId: a.callId };
    },
  };
}

// ── D1 ───────────────────────────────────────────────────────────────────

/** Cloudflare D1 的最小结构化接口（与 D1Database 兼容） */
export interface D1Like {
  prepare(sql: string): D1StatementLike;
  batch(statements: D1StatementLike[]): Promise<unknown[]>;
}
export interface D1StatementLike {
  bind(...values: unknown[]): D1StatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

/** 建表语句。部署时执行一次（例如 wrangler d1 execute），或用 d1Store(...).migrate() */
export const D1_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS leochat_paused_runs (
    run_id TEXT PRIMARY KEY,
    state TEXT NOT NULL,
    claimed_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS leochat_approvals (
    approval_id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL,
    call_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE INDEX IF NOT EXISTS leochat_approvals_run ON leochat_approvals (run_id)`,
];

export function d1Store(db: D1Like, now: () => number = Date.now): SessionStore & { migrate(): Promise<void> } {
  return {
    async migrate() {
      await db.batch(D1_SCHEMA.map((sql) => db.prepare(sql)));
    },
    async savePaused(run) {
      const { approvals, ...state } = run;
      await db.batch([
        db
          .prepare(
            `INSERT INTO leochat_paused_runs (run_id, state, claimed_at, created_at) VALUES (?, ?, NULL, ?)
             ON CONFLICT(run_id) DO UPDATE SET state = excluded.state, claimed_at = NULL`,
          )
          .bind(run.runId, JSON.stringify(state), run.createdAt),
        // INSERT OR IGNORE：已有审批保留原来的 consumed 状态
        ...approvals.map((a) =>
          db
            .prepare(`INSERT OR IGNORE INTO leochat_approvals (approval_id, run_id, call_id, tool_name, consumed) VALUES (?, ?, ?, ?, ?)`)
            .bind(a.approvalId, run.runId, a.callId, a.toolName, a.consumed ? 1 : 0),
        ),
      ]);
    },
    async loadPaused(runId) {
      const row = await db.prepare(`SELECT state FROM leochat_paused_runs WHERE run_id = ?`).bind(runId).first<{ state: string }>();
      if (!row) return null;
      const state = JSON.parse(row.state) as Omit<PausedRun, "approvals">;
      const rows = await db
        .prepare(
          `SELECT json_group_array(json_object('approvalId', approval_id, 'callId', call_id, 'toolName', tool_name, 'consumed', consumed)) AS list
           FROM leochat_approvals WHERE run_id = ?`,
        )
        .bind(runId)
        .first<{ list: string }>();
      const approvals = (JSON.parse(rows?.list ?? "[]") as Array<{ approvalId: string; callId: string; toolName: string; consumed: number }>).map(
        (a) => ({ ...a, consumed: a.consumed === 1 }),
      );
      return { ...state, approvals };
    },
    async claimPaused(runId, ttlMs) {
      const t = now();
      // 单条 UPDATE 是原子的：只有未被认领或认领已过期时才成功
      const r = await db
        .prepare(`UPDATE leochat_paused_runs SET claimed_at = ? WHERE run_id = ? AND (claimed_at IS NULL OR claimed_at < ?)`)
        .bind(t, runId, t - ttlMs)
        .run();
      return (r.meta?.changes ?? 0) > 0;
    },
    async deletePaused(runId) {
      await db.batch([
        db.prepare(`DELETE FROM leochat_paused_runs WHERE run_id = ?`).bind(runId),
        db.prepare(`DELETE FROM leochat_approvals WHERE run_id = ?`).bind(runId),
      ]);
    },
    async consumeApproval(runId, approvalId) {
      const row = await db
        .prepare(`UPDATE leochat_approvals SET consumed = 1 WHERE run_id = ? AND approval_id = ? AND consumed = 0 RETURNING call_id`)
        .bind(runId, approvalId)
        .first<{ call_id: string }>();
      return row ? { callId: row.call_id } : null;
    },
  };
}
