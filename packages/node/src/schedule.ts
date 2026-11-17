/**
 * /loop：定时提醒（参考 dsh 的 packages/schedule）。
 * 设计文档：docs/superpowers/specs/2026-11-17-harness-design.md §2.2、§4.4
 *
 * - 种类：once（一次性）、interval（固定间隔）、daily（每天）、weekly（每周）、cron（五字段，最小 1 分钟）
 * - 到期时调用宿主的 deliver()，由宿主把提醒作为用户消息送进原会话
 * - 宿主必须在运行；重启后每个任务只补发最近一次错过的时点
 * - 先投递再记账：崩溃时可能重复投递一次，不会漏掉（与 dsh 相同，不保证恰好一次）
 * - 任务存成一个 JSON 文件（原子替换写入）
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { newId } from "@leochat/core";

export type ScheduleRule =
  | { kind: "once"; at: number }
  | { kind: "interval"; everySeconds: number }
  | { kind: "daily"; time: string }
  | { kind: "weekly"; time: string; weekdays: number[] }
  | { kind: "cron"; expression: string };

export interface ScheduleDelivery {
  occurrenceAt: number;
  deliveredAt: number;
}

export interface Schedule<S = unknown> {
  id: string;
  conversationId: string;
  title: string;
  /** 到期时送进会话的内容 */
  prompt: string;
  rule: ScheduleRule;
  /** IANA 时区；daily / weekly / cron 按这个时区的钟点计算 */
  timeZone: string;
  /** 宿主保存的运行设置（模型、工具……），投递时原样交回 */
  settings?: S;
  state: "active" | "ended";
  /** 下一次到期时间；ended 时为 null */
  nextAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** 最近的投递记录（最多 20 条） */
  deliveries: ScheduleDelivery[];
}

export const MIN_INTERVAL_SECONDS = 60;
const MAX_DELIVERY_RECORDS = 20;
const MAX_PROMPT = 8_000;
/** 投递失败后多久再试 */
export const RETRY_AFTER_MS = 30_000;
/** setTimeout 的上限约 24.8 天；更远的任务分段等待 */
const MAX_TIMER_MS = 2 ** 31 - 1;

export class ScheduleError extends Error {
  constructor(
    readonly code: "invalid_rule" | "invalid_input" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

// ── 时区与钟点 ────────────────────────────────────────────────────────────

interface Wall {
  y: number;
  mo: number; // 1-12
  d: number;
  h: number;
  mi: number;
  dow: number; // 0=周日
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let f = dtfCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      weekday: "short",
    });
    dtfCache.set(tz, f);
  }
  return f;
}
const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

/** 某个时刻在指定时区的钟点 */
export function wallClock(t: number, tz: string): Wall {
  const parts: Record<string, string> = {};
  for (const p of formatter(tz).formatToParts(new Date(t))) parts[p.type] = p.value;
  return { y: +parts.year!, mo: +parts.month!, d: +parts.day!, h: +parts.hour!, mi: +parts.minute!, dow: WEEKDAYS[parts.weekday!] ?? 0 };
}

/** 指定时区的钟点对应的时刻（夏令时跳过的钟点会落到之后最近的有效时刻） */
export function fromWallClock(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  let t = naive;
  for (let i = 0; i < 3; i++) {
    const w = wallClock(t, tz);
    const offset = Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi) - t;
    const next = naive - offset;
    if (next === t) break;
    t = next;
  }
  return t;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz);
    return true;
  } catch {
    return false;
  }
}

function parseTime(time: string): { h: number; mi: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m || +m[1]! > 23 || +m[2]! > 59) throw new ScheduleError("invalid_rule", `time must be HH:MM, got ${JSON.stringify(time)}`);
  return { h: +m[1]!, mi: +m[2]! };
}

// ── cron（五字段 Vixie 方言：分 时 日 月 周；* , - /）────────────────────

interface Cron {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
  domAny: boolean;
  dowAny: boolean;
}

function cronField(src: string, min: number, max: number, name: string): Set<number> {
  const out = new Set<number>();
  for (const part of src.split(",")) {
    const m = /^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/.exec(part);
    if (!m) throw new ScheduleError("invalid_rule", `invalid cron ${name} field: ${src}`);
    const step = m[2] ? +m[2] : 1;
    let lo = min;
    let hi = max;
    if (m[1] !== "*") {
      const [a, b] = m[1]!.split("-").map(Number);
      lo = a!;
      hi = b ?? (m[2] ? max : a!);
    }
    if (step < 1 || lo < min || hi > max || lo > hi) throw new ScheduleError("invalid_rule", `cron ${name} out of range: ${src}`);
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

export function parseCron(expression: string): Cron {
  const f = expression.trim().split(/\s+/);
  if (f.length !== 5) throw new ScheduleError("invalid_rule", "cron needs 5 fields: minute hour day-of-month month day-of-week");
  const dow = cronField(f[4]!, 0, 7, "day-of-week");
  if (dow.has(7)) {
    dow.delete(7);
    dow.add(0);
  }
  return {
    minute: cronField(f[0]!, 0, 59, "minute"),
    hour: cronField(f[1]!, 0, 23, "hour"),
    dom: cronField(f[2]!, 1, 31, "day-of-month"),
    month: cronField(f[3]!, 1, 12, "month"),
    dow,
    domAny: f[2] === "*",
    dowAny: f[4] === "*",
  };
}

function cronDayMatches(c: Cron, w: { mo: number; d: number; dow: number }): boolean {
  if (!c.month.has(w.mo)) return false;
  // Vixie 规则：日和周都限定时，满足其一即可
  if (c.domAny && c.dowAny) return true;
  if (c.domAny) return c.dow.has(w.dow);
  if (c.dowAny) return c.dom.has(w.d);
  return c.dom.has(w.d) || c.dow.has(w.dow);
}

// ── 下一次到期时间 ─────────────────────────────────────────────────────────

/** 严格晚于 after 的下一次时点；没有了返回 null */
export function nextOccurrence(rule: ScheduleRule, after: number, tz: string, anchor: number): number | null {
  switch (rule.kind) {
    case "once":
      return rule.at > after ? rule.at : null;
    case "interval": {
      const every = rule.everySeconds * 1000;
      const n = Math.floor((after - anchor) / every) + 1;
      return anchor + Math.max(1, n) * every;
    }
    case "daily":
    case "weekly":
    case "cron": {
      const cron =
        rule.kind === "cron"
          ? parseCron(rule.expression)
          : (() => {
              const { h, mi } = parseTime(rule.time);
              const days = rule.kind === "weekly" ? rule.weekdays : [0, 1, 2, 3, 4, 5, 6];
              return parseCron(`${mi} ${h} * * ${days.join(",")}`);
            })();
      const hours = [...cron.hour].sort((a, b) => a - b);
      const minutes = [...cron.minute].sort((a, b) => a - b);
      const start = wallClock(after, tz);
      // 从 after 所在的那天开始逐日找（最多约 8 年，覆盖 2 月 29 日这类规则）
      for (let i = 0; i < 366 * 8; i++) {
        const day = new Date(Date.UTC(start.y, start.mo - 1, start.d + i));
        const w = { mo: day.getUTCMonth() + 1, d: day.getUTCDate(), dow: day.getUTCDay() };
        if (!cronDayMatches(cron, w)) continue;
        for (const h of hours) {
          for (const mi of minutes) {
            const t = fromWallClock(day.getUTCFullYear(), w.mo, w.d, h, mi, tz);
            if (t > after) return t;
          }
        }
      }
      return null;
    }
  }
}

/** 校验并规范化规则 */
export function normalizeRule(rule: ScheduleRule): ScheduleRule {
  switch (rule?.kind) {
    case "once":
      if (!Number.isFinite(rule.at)) throw new ScheduleError("invalid_rule", "once needs a timestamp");
      return { kind: "once", at: Math.floor(rule.at) };
    case "interval":
      if (!Number.isSafeInteger(rule.everySeconds) || rule.everySeconds < MIN_INTERVAL_SECONDS) {
        throw new ScheduleError("invalid_rule", `interval must be at least ${MIN_INTERVAL_SECONDS} seconds`);
      }
      return { kind: "interval", everySeconds: rule.everySeconds };
    case "daily": {
      const { h, mi } = parseTime(rule.time);
      return { kind: "daily", time: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}` };
    }
    case "weekly": {
      const { h, mi } = parseTime(rule.time);
      const days = [...new Set(rule.weekdays)].sort((a, b) => a - b);
      if (!days.length || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
        throw new ScheduleError("invalid_rule", "weekdays must be numbers 0 (Sunday) to 6 (Saturday)");
      }
      return { kind: "weekly", time: `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`, weekdays: days };
    }
    case "cron":
      parseCron(rule.expression);
      return { kind: "cron", expression: rule.expression.trim().split(/\s+/).join(" ") };
    default:
      throw new ScheduleError("invalid_rule", "unknown schedule kind");
  }
}

// ── 调度器 ────────────────────────────────────────────────────────────────

export interface SchedulerOptions<S> {
  /** 任务文件路径，例如 <dataDir>/schedules.json */
  file: string;
  /** 到期投递；抛错时任务保留在原时点，下次唤醒再试（与 dsh 相同，没有单独的重试计时器） */
  deliver(schedule: Schedule<S>, occurrenceAt: number): Promise<void>;
  now?: () => number;
  /** 默认用宿主的时区 */
  defaultTimeZone?: string;
  /** 投递失败时的日志 */
  onError?(error: unknown, schedule: Schedule<S>): void;
}

export interface CreateScheduleInput<S> {
  conversationId: string;
  title?: string;
  prompt: string;
  rule: ScheduleRule;
  timeZone?: string;
  settings?: S;
}

export interface Scheduler<S = unknown> {
  create(input: CreateScheduleInput<S>): Promise<Schedule<S>>;
  list(filter?: { conversationId?: string; includeEnded?: boolean }): Schedule<S>[];
  get(id: string): Schedule<S> | undefined;
  delete(id: string): Promise<boolean>;
  /** 删除某个会话的全部任务（会话被删除时） */
  deleteForConversation(conversationId: string): Promise<number>;
  /** 处理所有到期任务（计时器会自动调用；测试里手动调用） */
  tick(): Promise<void>;
  /** 开始计时（启动时补发错过的最近一次） */
  start(): void;
  stop(): void;
}

export async function createScheduler<S = unknown>(opts: SchedulerOptions<S>): Promise<Scheduler<S>> {
  const now = opts.now ?? Date.now;
  const defaultTz = opts.defaultTimeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  let tasks: Schedule<S>[] = [];
  try {
    tasks = (JSON.parse(await readFile(opts.file, "utf8")) as { schedules: Schedule<S>[] }).schedules ?? [];
  } catch {
    tasks = [];
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** 投递失败的任务：在这个时间之前不再尝试（只在内存里，重启后立即再试） */
  const retryAt = new Map<string, number>();
  const dueAt = (t: Schedule<S>) => Math.max(t.nextAt!, retryAt.get(t.id) ?? 0);
  let running = false;
  let ticking: Promise<void> | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = queue.then(fn, fn);
    queue = p.catch(() => {});
    return p;
  };

  const save = async () => {
    await mkdir(dirname(opts.file), { recursive: true });
    const tmp = `${opts.file}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify({ schedules: tasks }, null, 2), "utf8");
    await rename(tmp, opts.file);
  };

  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = undefined;
    if (!running) return;
    const next = Math.min(...tasks.filter((t) => t.state === "active" && t.nextAt !== null).map(dueAt));
    if (!Number.isFinite(next)) return;
    timer = setTimeout(() => void self.tick(), Math.min(Math.max(next - now(), 0), MAX_TIMER_MS));
    timer.unref?.();
  };

  const self: Scheduler<S> = {
    create: (input) =>
      serial(async () => {
        if (typeof input.prompt !== "string" || !input.prompt.trim()) throw new ScheduleError("invalid_input", "prompt is required");
        if (input.prompt.length > MAX_PROMPT) throw new ScheduleError("invalid_input", `prompt is longer than ${MAX_PROMPT} characters`);
        const timeZone = input.timeZone ?? defaultTz;
        if (!isValidTimeZone(timeZone)) throw new ScheduleError("invalid_rule", `unknown time zone ${timeZone}`);
        const rule = normalizeRule(input.rule);
        const t = now();
        const nextAt = nextOccurrence(rule, t, timeZone, t);
        if (nextAt === null) throw new ScheduleError("invalid_rule", "the schedule has no future occurrence");
        const s: Schedule<S> = {
          id: newId("sched_"),
          conversationId: input.conversationId,
          title: (input.title ?? input.prompt).trim().replace(/\s+/g, " ").slice(0, 80),
          prompt: input.prompt.trim(),
          rule,
          timeZone,
          ...(input.settings !== undefined ? { settings: input.settings } : {}),
          state: "active",
          nextAt,
          createdAt: t,
          updatedAt: t,
          deliveries: [],
        };
        tasks.push(s);
        await save();
        arm();
        return structuredClone(s); // 返回副本：调用方改不到内部状态，内部更新也不会改到调用方手里的对象
      }),
    list: (filter = {}) =>
      tasks
        .filter((t) => (filter.includeEnded || t.state === "active") && (!filter.conversationId || t.conversationId === filter.conversationId))
        .map((t) => structuredClone(t)),
    get: (id) => {
      const t = tasks.find((x) => x.id === id);
      return t ? structuredClone(t) : undefined;
    },
    delete: (id) =>
      serial(async () => {
        const before = tasks.length;
        tasks = tasks.filter((t) => t.id !== id);
        if (tasks.length === before) return false;
        await save();
        arm();
        return true;
      }),
    deleteForConversation: (conversationId) =>
      serial(async () => {
        const before = tasks.length;
        tasks = tasks.filter((t) => t.conversationId !== conversationId);
        const n = before - tasks.length;
        if (n) {
          await save();
          arm();
        }
        return n;
      }),
    tick() {
      // 同一时间只跑一次；跑的时候又到期的任务在下一次 arm 时处理
      ticking ??= serial(async () => {
        const t = now();
        const due = tasks.filter((x) => x.state === "active" && x.nextAt !== null && dueAt(x) <= t);
        for (const s of due) {
          // 错过多次时只投递最近的一次（dsh）
          let occurrence = s.nextAt!;
          for (let n = nextOccurrence(s.rule, occurrence, s.timeZone, s.createdAt); n !== null && n <= t; n = nextOccurrence(s.rule, n, s.timeZone, s.createdAt)) {
            occurrence = n;
          }
          try {
            await opts.deliver(structuredClone(s), occurrence);
          } catch (e) {
            opts.onError?.(e, s);
            retryAt.set(s.id, now() + RETRY_AFTER_MS); // 留在原时点，过一会儿再试（避免紧循环）
            continue;
          }
          retryAt.delete(s.id);
          const next = nextOccurrence(s.rule, Math.max(t, occurrence), s.timeZone, s.createdAt);
          s.deliveries = [...s.deliveries, { occurrenceAt: occurrence, deliveredAt: now() }].slice(-MAX_DELIVERY_RECORDS);
          s.nextAt = next;
          s.state = next === null ? "ended" : "active";
          s.updatedAt = now();
        }
        if (due.length) await save();
      }).finally(() => {
        ticking = null;
        arm();
      });
      return ticking;
    },
    start() {
      running = true;
      void self.tick();
    },
    stop() {
      running = false;
      arm();
    },
  };
  return self;
}

/** 送进会话的提醒文字（照 dsh 的固定开头，说明这是用户预先设置的消息） */
export function renderReminder(s: Pick<Schedule, "id" | "prompt" | "title">, occurrenceAt: number, timeZone?: string): string {
  const when = new Date(occurrenceAt).toLocaleString("zh-CN", { hour12: false, ...(timeZone ? { timeZone } : {}) });
  return `[定时提醒]\n这是用户预先设置的定时消息（${when}，任务 ${s.id}）。\n\n${s.prompt}`;
}

/** 消息是不是定时提醒（界面据此显示成"定时提醒"标签） */
export const REMINDER_PREFIX = "[定时提醒]";
