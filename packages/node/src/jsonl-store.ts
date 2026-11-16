/**
 * 文件系统上的 SessionStore（设计文档 §7.5，参考 dsh 的 JSONL 会话日志）。
 *
 * 目录结构（每个 run 一组文件）：
 *   <runId>.paused.json    暂停的运行（原子写入：先写临时文件再 rename）
 *   <runId>.events.jsonl   事件日志（appendEvents 追加），供 harness 回放、compaction 存档
 *   <runId>.claim          resume 认领（独占创建，内容是认领时间；超过 ttl 可以被重新认领）
 *   <runId>.mutex          读-改-写的短锁（consumeApproval、savePaused）
 *
 * 跨进程安全：认领和短锁都用独占创建文件（O_EXCL）实现，同一台机器上的多个进程也不会同时处理同一个运行。
 */
import { appendFile, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentEvent, Message, PausedRun, SessionStore } from "@leochat/core";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

export interface JsonlStoreOptions {
  /** 短锁最长等待时间，默认 5 秒 */
  lockTimeoutMs?: number;
  now?: () => number;
}

export interface JsonlStore extends SessionStore {
  readonly dir: string;
  appendEvents(runId: string, events: AgentEvent[]): Promise<void>;
  /** 读取事件日志（回放用） */
  readEvents(runId: string): Promise<AgentEvent[]>;
  /** 把压缩时被替换掉的原始消息追加进事件日志（配合 createCompactor 的 archive 回调） */
  archiveMessages(runId: string, messages: Message[]): Promise<void>;
}

function assertId(runId: string): void {
  // 防止路径穿越：runId 只允许字母、数字、下划线和连字符
  if (!SAFE_ID.test(runId)) throw new Error(`jsonlStore: invalid runId ${JSON.stringify(runId)}`);
}

const isExists = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "EEXIST";
const isMissing = (e: unknown) => (e as NodeJS.ErrnoException)?.code === "ENOENT";
/**
 * Windows 上，一个正在被删除（delete pending）或被别的进程打开的文件，再去创建/rename 会得到 EPERM/EBUSY/EACCES，
 * 而不是 EEXIST。这类错误按"暂时被占用"处理：重试
 */
const isBusy = (e: unknown) => ["EPERM", "EBUSY", "EACCES"].includes((e as NodeJS.ErrnoException)?.code ?? "");

async function retryBusy<T>(fn: () => Promise<T>, attempts = 20): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isBusy(e) || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 15));
    }
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await retryBusy(() => readFile(path, "utf8"))) as T;
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}

async function writeAtomic(path: string, data: string): Promise<void> {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data, "utf8");
  await retryBusy(() => rename(tmp, path));
}

/** 独占创建文件；已存在（或在 Windows 上正处于删除中）返回 false，由调用方重试 */
async function createExclusive(path: string, content: string): Promise<boolean> {
  try {
    const fh = await open(path, "wx");
    await fh.writeFile(content, "utf8");
    await fh.close();
    return true;
  } catch (e) {
    if (isExists(e) || isBusy(e)) return false;
    throw e;
  }
}

export async function jsonlStore(dir: string, opts: JsonlStoreOptions = {}): Promise<JsonlStore> {
  await mkdir(dir, { recursive: true });
  const now = opts.now ?? Date.now;
  const lockTimeout = opts.lockTimeoutMs ?? 5000;
  const paths = (runId: string) => {
    assertId(runId);
    return {
      paused: join(dir, `${runId}.paused.json`),
      events: join(dir, `${runId}.events.jsonl`),
      claim: join(dir, `${runId}.claim`),
      mutex: join(dir, `${runId}.mutex`),
    };
  };

  /** 在短锁里执行读-改-写；锁文件残留（进程崩溃）超过 lockTimeout 视为过期 */
  async function withMutex<T>(path: string, fn: () => Promise<T>): Promise<T> {
    const deadline = Date.now() + lockTimeout;
    for (;;) {
      if (await createExclusive(path, String(Date.now()))) break;
      const held = Number(await readFile(path, "utf8").catch(() => "0"));
      if (Date.now() - held > lockTimeout) {
        await rm(path, { force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`jsonlStore: lock timeout ${path}`);
      await new Promise((r) => setTimeout(r, 10 + Math.random() * 20));
    }
    try {
      return await fn();
    } finally {
      await rm(path, { force: true });
    }
  }

  return {
    dir,
    async savePaused(run) {
      const p = paths(run.runId);
      await withMutex(p.mutex, async () => {
        // 保留已有审批的"已消费"状态
        const prev = await readJson<PausedRun>(p.paused);
        const approvals = run.approvals.map((a) => ({
          ...a,
          consumed: a.consumed || (prev?.approvals.find((x) => x.approvalId === a.approvalId)?.consumed ?? false),
        }));
        await writeAtomic(p.paused, JSON.stringify({ ...run, approvals }));
      });
      await rm(p.claim, { force: true }); // 再次暂停时解除认领
    },
    async loadPaused(runId) {
      return readJson<PausedRun>(paths(runId).paused);
    },
    async claimPaused(runId, ttlMs) {
      const p = paths(runId);
      if ((await readJson(p.paused)) === null) return false;
      if (await createExclusive(p.claim, String(now()))) return true;
      const at = Number(await readFile(p.claim, "utf8").catch(() => "0"));
      if (now() - at < ttlMs) return false;
      // 认领已过期：删掉后重新独占创建；两个进程同时抢时只有一个成功
      await rm(p.claim, { force: true });
      return createExclusive(p.claim, String(now()));
    },
    async consumeApproval(runId, approvalId) {
      const p = paths(runId);
      return withMutex(p.mutex, async () => {
        const run = await readJson<PausedRun>(p.paused);
        const a = run?.approvals.find((x) => x.approvalId === approvalId);
        if (!run || !a || a.consumed) return null;
        a.consumed = true;
        await writeAtomic(p.paused, JSON.stringify(run));
        return { callId: a.callId };
      });
    },
    async deletePaused(runId) {
      const p = paths(runId);
      await rm(p.paused, { force: true });
      await rm(p.claim, { force: true });
    },
    async appendEvents(runId, events) {
      if (events.length === 0) return;
      await appendFile(paths(runId).events, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    },
    async readEvents(runId) {
      let text: string;
      try {
        text = await readFile(paths(runId).events, "utf8");
      } catch (e) {
        if (isMissing(e)) return [];
        throw e;
      }
      return text
        .split("\n")
        .filter((l) => l.trim() !== "")
        .map((l) => JSON.parse(l) as AgentEvent);
    },
    async archiveMessages(runId, messages) {
      await appendFile(
        paths(runId).events,
        JSON.stringify({ type: "custom", name: "leochat.compaction_archive", data: { at: now(), messages } } satisfies AgentEvent) + "\n",
        "utf8",
      );
    },
  };
}
