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

/**
 * 会话收件箱（参考 dsh agent-loop 的 inbox）：待处理的输入。
 * next-turn：下一轮的提示（用户消息、定时提醒、目标的下一轮）；next-step：插话，送进正在运行的这一轮
 */
export type InboxTarget = "next-turn" | "next-step";
export type InboxSource = "user" | "reminder" | "goal";

export interface InboxItem<S = unknown> {
  id: string;
  message: Message;
  source: InboxSource;
  /** 运行这条输入时用的设置（模型、工具……），由宿主决定内容 */
  settings?: S;
  at: number;
}

export interface InboxState<S = unknown> {
  "next-turn": InboxItem<S>[];
  "next-step": InboxItem<S>[];
}

type LogRecord =
  | { t: "meta"; id: string; title: string; createdAt: number; v: 1 }
  | { t: "op"; op: TranscriptOp; at: number }
  | { t: "title"; title: string; at: number }
  /** /goal 的变更记录（core 的 GoalRecord），和 transcript 写在同一份日志里 */
  | { t: "goal"; rec: GoalRecord }
  /** 收件箱：放入一条，或领取（claimed）/ 丢弃（discarded）若干条 */
  | { t: "inbox"; op: "insert"; target: InboxTarget; item: InboxItem; at: number }
  | { t: "inbox"; op: "remove"; ids: string[]; outcome: "claimed" | "discarded"; at: number };

const recordAt = (r: Exclude<LogRecord, { t: "meta" }>): number => (r.t === "goal" ? r.rec.at : r.at);

/** 回放收件箱记录：重复的 id 视为数据错误；移除不存在的 id 忽略（重复领取是无害的） */
export function replayInbox(records: Iterable<LogRecord | { t: string }>): InboxState {
  const state: InboxState = { "next-turn": [], "next-step": [] };
  for (const r of records) {
    if (r.t !== "inbox") continue;
    const rec = r as Extract<LogRecord, { t: "inbox" }>;
    if (rec.op === "insert") {
      if (state["next-turn"].some((x) => x.id === rec.item.id) || state["next-step"].some((x) => x.id === rec.item.id)) {
        throw new Error(`inbox item ${rec.item.id} is already pending`);
      }
      state[rec.target].push(rec.item);
    } else {
      const ids = new Set(rec.ids);
      state["next-turn"] = state["next-turn"].filter((x) => !ids.has(x.id));
      state["next-step"] = state["next-step"].filter((x) => !ids.has(x.id));
    }
  }
  return state;
}

export interface LoadedConversation {
  meta: ConversationMeta;
  transcript: Message[];
  goal: Goal | null;
  goalError?: string;
  /** 待处理的输入 */
  inbox: InboxState;
}

export interface ConversationLog {
  readonly dir: string;
  create(title?: string): Promise<ConversationMeta>;
  list(): Promise<ConversationMeta[]>;
  /** goal 是当前目标；目标记录回放失败时 goal 为 null、goalError 给出原因（不影响会话本身） */
  load(id: string): Promise<LoadedConversation | null>;
  /** 放进收件箱（先写盘） */
  inboxInsert(id: string, target: InboxTarget, item: InboxItem): Promise<void>;
  /** 从收件箱移除：claimed 表示已交给运行，discarded 表示撤回 / 停止时清空 */
  inboxRemove(id: string, ids: string[], outcome: "claimed" | "discarded"): Promise<void>;
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
      if (r.t !== "meta") updatedAt = Math.max(updatedAt, recordAt(r));
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
    // 临时文件名带随机后缀：同一进程里可能有多个实例同时写（否则会互相 rename 掉对方的临时文件）
    const tmp = join(dir, `${INDEX}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
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
      return { meta, transcript: applyTranscriptOps([], ops), goal, ...(goalError ? { goalError } : {}), inbox: replayInbox(records) };
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
    inboxInsert(id, target, item) {
      return serial(id, async () => {
        const at = now();
        await appendDurable(file(id), JSON.stringify({ t: "inbox", op: "insert", target, item, at } satisfies LogRecord));
        const meta = (await loadIndex()).get(id);
        if (meta) await touch({ ...meta, updatedAt: at });
      });
    },
    inboxRemove(id, ids, outcome) {
      if (!ids.length) return Promise.resolve();
      return serial(id, async () => {
        await appendDurable(file(id), JSON.stringify({ t: "inbox", op: "remove", ids, outcome, at: now() } satisfies LogRecord));
      });
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
