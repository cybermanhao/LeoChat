/**
 * SessionStore 的内存实现与暂停式审批的应答者（设计文档 §4.1、§7.5）。
 * D1 实现放在第 6 步。
 */
import type { Answerer, PausedRun, SessionStore } from "./run-types";

/** 内置应答者：直接返回 deferred，用于 serverless。没有配置 store 时 run() 启动即报错（C1） */
export const deferAnswerer: Answerer<unknown> = () => "deferred";

/**
 * 内存实现：测试用，以及 GUI 的本地 server（单进程）。
 * consumeApproval 在单线程 JS 里天然是原子的。
 */
export function memoryStore(): SessionStore & { readonly size: number } {
  const runs = new Map<string, PausedRun>();
  return {
    get size() {
      return runs.size;
    },
    async savePaused(run) {
      runs.set(run.runId, structuredClone(run));
    },
    async loadPaused(runId) {
      const r = runs.get(runId);
      return r ? structuredClone(r) : null;
    },
    async deletePaused(runId) {
      runs.delete(runId);
    },
    async consumeApproval(runId, approvalId) {
      const r = runs.get(runId);
      const a = r?.approvals.find((x) => x.approvalId === approvalId);
      if (!a || a.consumed) return null;
      a.consumed = true;
      return { callId: a.callId };
    },
  };
}
