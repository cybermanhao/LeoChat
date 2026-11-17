/**
 * 会话日志（参考 dsh session-persistence-jsonl + session-projection-cache）。
 *
 * - 每个会话一份只追加的 JSONL：第一行是 meta，之后是 transcript 操作（append / reset）和改名记录
 * - 日志是唯一的权威数据：transcript = 把操作依次重放到空列表上（core 的 applyTranscriptOps）
 * - 每次写入都 datasync 到磁盘（dsh：flush 才是持久性屏障）；读取时忽略崩溃留下的半截最后一行
 * - 列表读 index.json（投影缓存）；缓存缺失或损坏时扫描日志重建，日志永远优先
 * - 同一个会话只有一个写入方：进程内按会话排队（本地 server 是唯一写入者）
 */
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { applyTranscriptOps, newId, replayGoal, type Goal, type GoalRecord, type GoalStore, type Message, type TranscriptOp } from "@leochat/core";

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const INDEX = "index.json";

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

type LogRecord =
  | { t: "meta"; id: string; title: string; createdAt: number; v: 1 }
  | { t: "op"; op: TranscriptOp; at: number }
  | { t: "title"; title: string; at: number }
  /** /goal 的变更记录（core 的 GoalRecord），和 transcript 写在同一份日志里 */
  | { t: "goal"; rec: GoalRecord };

export interface ConversationLog {
  readonly dir: string;
  create(title?: string): Promise<ConversationMeta>;
  list(): Promise<ConversationMeta[]>;
  /** goal 是当前目标；目标记录回放失败时 goal 为 null、goalError 给出原因（不影响会话本身） */
  load(id: string): Promise<{ meta: ConversationMeta; transcript: Message[]; goal: Goal | null; goalError?: string } | null>;
  append(id: string, op: TranscriptOp): Promise<void>;
  setTitle(id: string, title: string): Promise<void>;
  delete(id: string): Promise<void>;
  /** 直接交给 run({ persist })：每次 transcript 变化都写进这个会话的日志 */
  persistFor(id: string): (op: TranscriptOp) => Promise<void>;
  /** 这个会话的目标存储，交给 core 的 goalController() */
  goalStore(id: string): GoalStore;
}

function assertId(id: string): void {
  if (!SAFE_ID.test(id)) throw new Error(`conversationLog: invalid id ${JSON.stringify(id)}`);
}

/** 追加一行并 datasync */
async function appendDurable(path: string, line: string): Promise<void> {
  const fh = await open(path, "a");
  try {
    await fh.appendFile(line + "\n", "utf8");
    await fh.datasync();
  } finally {
    await fh.close();
  }
}

/** 解析日志：忽略崩溃留下的半截最后一行；中间行损坏视为数据错误 */
function parseLog(text: string): LogRecord[] {
  const lines = text.split("\n");
  const out: LogRecord[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line) as LogRecord);
    } catch (e) {
      const isLast = lines.slice(i + 1).every((l) => !l.trim());
      if (isLast) break; // 撕裂的尾部
      throw e;
    }
  }
  return out;
}

export async function conversationLog(dir: string, opts: { now?: () => number } = {}): Promise<ConversationLog> {
  await mkdir(dir, { recursive: true });
  const now = opts.now ?? Date.now;
  const file = (id: string) => {
    assertId(id);
    return join(dir, `${id}.jsonl`);
  };
  const queues = new Map<string, Promise<unknown>>();
  /** 同一个会话的写入排队执行 */
  const serial = <T>(id: string, fn: () => Promise<T>): Promise<T> => {
    const run = (queues.get(id) ?? Promise.resolve()).then(fn, fn);
    queues.set(id, run.catch(() => {}));
    return run;
  };

  async function readMeta(id: string): Promise<ConversationMeta | null> {
    let text: string;
    try {
      text = await readFile(file(id), "utf8");
    } catch {
      return null;
    }
    const records = parseLog(text);
    const meta = records.find((r): r is Extract<LogRecord, { t: "meta" }> => r.t === "meta");
    if (!meta) return null;
    let title = meta.title;
    let updatedAt = meta.createdAt;
    for (const r of records) {
      if (r.t === "title") title = r.title;
      if (r.t !== "meta") updatedAt = Math.max(updatedAt, r.t === "goal" ? r.rec.at : r.at);
    }
    return { id: meta.id, title, createdAt: meta.createdAt, updatedAt };
  }

  // ── 投影缓存 ──
  let index: Map<string, ConversationMeta> | null = null;
  async function loadIndex(): Promise<Map<string, ConversationMeta>> {
    if (index) return index;
    try {
      const raw = JSON.parse(await readFile(join(dir, INDEX), "utf8")) as { conversations: ConversationMeta[] };
      index = new Map(raw.conversations.map((c) => [c.id, c]));
    } catch {
      // 缺失或损坏：扫描日志重建
      index = new Map();
      for (const f of await readdir(dir)) {
        if (!f.endsWith(".jsonl")) continue;
        const meta = await readMeta(f.slice(0, -".jsonl".length)).catch(() => null);
        if (meta) index.set(meta.id, meta);
      }
      await saveIndex();
    }
    return index;
  }
  async function saveIndex(): Promise<void> {
    if (!index) return;
    const tmp = join(dir, `${INDEX}.${process.pid}.tmp`);
    await writeFile(tmp, JSON.stringify({ conversations: [...index.values()] }), "utf8");
    await rename(tmp, join(dir, INDEX));
  }
  async function touch(meta: ConversationMeta): Promise<void> {
    (await loadIndex()).set(meta.id, meta);
    await saveIndex().catch(() => {}); // 缓存写失败不影响日志
  }

  const self: ConversationLog = {
    dir,
    async create(title = "") {
      const id = newId("conv_").replace(/[^A-Za-z0-9_-]/g, "");
      const meta: ConversationMeta = { id, title, createdAt: now(), updatedAt: now() };
      await appendDurable(file(id), JSON.stringify({ t: "meta", id, title, createdAt: meta.createdAt, v: 1 } satisfies LogRecord));
      await touch(meta);
      return meta;
    },
    async list() {
      return [...(await loadIndex()).values()].sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async load(id) {
      let text: string;
      try {
        text = await readFile(file(id), "utf8");
      } catch {
        return null;
      }
      const records = parseLog(text);
      const meta = await readMeta(id);
      if (!meta) return null;
      const ops = records.filter((r): r is Extract<LogRecord, { t: "op" }> => r.t === "op").map((r) => r.op);
      const goalRecs = records.filter((r): r is Extract<LogRecord, { t: "goal" }> => r.t === "goal").map((r) => r.rec);
      let goal: Goal | null = null;
      let goalError: string | undefined;
      try {
        goal = replayGoal(goalRecs);
      } catch (e) {
        goalError = e instanceof Error ? e.message : String(e);
      }
      return { meta, transcript: applyTranscriptOps([], ops), goal, ...(goalError ? { goalError } : {}) };
    },
    append(id, op) {
      return serial(id, async () => {
        const at = now();
        await appendDurable(file(id), JSON.stringify({ t: "op", op, at } satisfies LogRecord));
        const meta = (await loadIndex()).get(id);
        if (meta) await touch({ ...meta, updatedAt: at });
      });
    },
    setTitle(id, title) {
      return serial(id, async () => {
        const at = now();
        await appendDurable(file(id), JSON.stringify({ t: "title", title, at } satisfies LogRecord));
        const meta = (await loadIndex()).get(id);
        if (meta) await touch({ ...meta, title, updatedAt: at });
      });
    },
    delete(id) {
      return serial(id, async () => {
        await rm(file(id), { force: true });
        (await loadIndex()).delete(id);
        await saveIndex().catch(() => {});
      });
    },
    persistFor(id) {
      return (op) => self.append(id, op);
    },
    goalStore(id) {
      assertId(id);
      return {
        load: async () => {
          let text: string;
          try {
            text = await readFile(file(id), "utf8");
          } catch {
            return [];
          }
          return parseLog(text)
            .filter((r): r is Extract<LogRecord, { t: "goal" }> => r.t === "goal")
            .map((r) => r.rec);
        },
        append: (rec) =>
          serial(id, async () => {
            await appendDurable(file(id), JSON.stringify({ t: "goal", rec } satisfies LogRecord));
            const meta = (await loadIndex()).get(id);
            if (meta) await touch({ ...meta, updatedAt: rec.at });
          }),
      };
    },
  };
  return self;
}
