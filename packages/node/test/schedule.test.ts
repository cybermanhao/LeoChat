import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createScheduler, fromWallClock, nextOccurrence, normalizeRule, parseCron, ScheduleError, wallClock, type Schedule } from "../src/schedule";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leochat-schedule-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const SH = "Asia/Shanghai";
const NY = "America/New_York";
const at = (iso: string) => Date.parse(iso);

describe("time zones and rules", () => {
  it("converts wall clock times in a time zone, including DST", () => {
    expect(fromWallClock(2026, 11, 17, 9, 0, SH)).toBe(at("2026-11-17T01:00:00Z"));
    expect(wallClock(at("2026-11-17T01:00:00Z"), SH)).toMatchObject({ y: 2026, mo: 11, d: 17, h: 9, mi: 0, dow: 2 });
    // 纽约：夏令时 UTC-4，冬令时 UTC-5
    expect(fromWallClock(2026, 7, 1, 9, 0, NY)).toBe(at("2026-07-01T13:00:00Z"));
    expect(fromWallClock(2026, 12, 1, 9, 0, NY)).toBe(at("2026-12-01T14:00:00Z"));
  });

  it("finds the next daily, weekly and cron occurrence", () => {
    const t = at("2026-11-17T02:00:00Z"); // 上海 10:00，周二
    expect(nextOccurrence({ kind: "daily", time: "09:00" }, t, SH, t)).toBe(at("2026-11-18T01:00:00Z"));
    expect(nextOccurrence({ kind: "daily", time: "11:30" }, t, SH, t)).toBe(at("2026-11-17T03:30:00Z"));
    // 每周一、五 08:00 → 周五 11-20
    expect(nextOccurrence({ kind: "weekly", time: "08:00", weekdays: [1, 5] }, t, SH, t)).toBe(at("2026-11-20T00:00:00Z"));
    // 工作日每 15 分钟（9-17 点）→ 上海 10:15
    expect(nextOccurrence({ kind: "cron", expression: "*/15 9-17 * * 1-5" }, t, SH, t)).toBe(at("2026-11-17T02:15:00Z"));
    // 每月 1 号 0 点
    expect(nextOccurrence({ kind: "cron", expression: "0 0 1 * *" }, t, SH, t)).toBe(at("2026-11-30T16:00:00Z"));
    // 2 月 29 日（闰年 2028）
    expect(nextOccurrence({ kind: "cron", expression: "0 12 29 2 *" }, t, SH, t)).toBe(at("2028-02-29T04:00:00Z"));
    // 固定间隔按创建时间对齐；一次性过期后没有下一次
    expect(nextOccurrence({ kind: "interval", everySeconds: 600 }, t + 601_000, SH, t)).toBe(t + 1_200_000);
    expect(nextOccurrence({ kind: "once", at: t }, t, SH, t)).toBeNull();
  });

  it("validates rules", () => {
    expect(() => normalizeRule({ kind: "interval", everySeconds: 30 })).toThrow(ScheduleError);
    expect(() => normalizeRule({ kind: "daily", time: "25:00" })).toThrow(/HH:MM/);
    expect(() => normalizeRule({ kind: "weekly", time: "09:00", weekdays: [7] })).toThrow(/weekdays/);
    expect(() => parseCron("0 9 * *")).toThrow(/5 fields/);
    expect(() => parseCron("@daily x y z w")).toThrow(/invalid cron/);
    expect(normalizeRule({ kind: "daily", time: "9:05" })).toEqual({ kind: "daily", time: "09:05" });
    expect(normalizeRule({ kind: "cron", expression: " 0  9 * * 1-5 " })).toEqual({ kind: "cron", expression: "0 9 * * 1-5" });
    expect(parseCron("0 0 * * 7").dow.has(0)).toBe(true); // 7 也表示周日
  });
});

describe("scheduler", () => {
  function setup(start: number) {
    let t = start;
    const delivered: Array<{ id: string; occurrenceAt: number }> = [];
    let fail = false;
    const make = () =>
      createScheduler<{ model: string }>({
        file: join(dir, "schedules.json"),
        now: () => t,
        defaultTimeZone: SH,
        deliver: async (s, occurrenceAt) => {
          if (fail) throw new Error("conversation busy");
          delivered.push({ id: s.id, occurrenceAt });
        },
      });
    return { make, delivered, advance: (ms: number) => (t += ms), setFail: (v: boolean) => (fail = v), now: () => t };
  }

  it("delivers when due, keeps settings, records deliveries, and ends one-off schedules", async () => {
    const env = setup(at("2026-11-17T02:00:00Z"));
    const s = await env.make();
    const once = await s.create({ conversationId: "c1", prompt: "  stand up  ", rule: { kind: "once", at: env.now() + 60_000 }, settings: { model: "m" } });
    const every = await s.create({ conversationId: "c1", prompt: "check mail", rule: { kind: "interval", everySeconds: 600 } });
    await s.create({ conversationId: "c2", prompt: "other", rule: { kind: "daily", time: "09:00" } });
    expect(once).toMatchObject({ prompt: "stand up", title: "stand up", state: "active", nextAt: env.now() + 60_000, timeZone: SH, settings: { model: "m" } });
    expect(s.list({ conversationId: "c1" })).toHaveLength(2);

    await s.tick();
    expect(env.delivered).toHaveLength(0);
    env.advance(60_000);
    await s.tick();
    expect(env.delivered).toEqual([{ id: once.id, occurrenceAt: once.nextAt }]);
    expect(s.get(once.id)).toMatchObject({ state: "ended", nextAt: null, deliveries: [{ occurrenceAt: once.nextAt }] });
    expect(s.list({ conversationId: "c1" }).map((x) => x.id)).toEqual([every.id]); // 已结束的默认不列出

    env.advance(540_000);
    await s.tick();
    expect(env.delivered.at(-1)).toEqual({ id: every.id, occurrenceAt: every.nextAt });
  });

  it("after downtime only the most recent missed occurrence is delivered, and state survives a restart", async () => {
    const env = setup(at("2026-11-17T02:00:00Z"));
    const s1 = await env.make();
    const every = await s1.create({ conversationId: "c1", prompt: "ping", rule: { kind: "interval", everySeconds: 600 } });
    env.advance(3_600_000 + 1_000); // 停机 1 小时：错过 6 次
    const s2 = await env.make(); // 重启：从文件读取
    await s2.tick();
    expect(env.delivered).toEqual([{ id: every.id, occurrenceAt: every.createdAt + 3_600_000 }]);
    expect(s2.get(every.id)!.nextAt).toBe(every.createdAt + 4_200_000);
    const onDisk = JSON.parse(await readFile(join(dir, "schedules.json"), "utf8")) as { schedules: Schedule[] };
    expect(onDisk.schedules[0]!.deliveries).toHaveLength(1);
  });

  it("a failed delivery keeps the schedule at its time for the next wake-up", async () => {
    const env = setup(at("2026-11-17T02:00:00Z"));
    const s = await env.make();
    const once = await s.create({ conversationId: "c1", prompt: "x", rule: { kind: "once", at: env.now() + 1_000 } });
    env.advance(1_000);
    env.setFail(true);
    await s.tick();
    expect(s.get(once.id)).toMatchObject({ state: "active", nextAt: once.nextAt });
    env.setFail(false);
    await s.tick(); // 30 秒内不重试（避免紧循环）
    expect(s.get(once.id)!.state).toBe("active");
    env.advance(30_000);
    await s.tick();
    expect(s.get(once.id)!.state).toBe("ended");
  });

  it("deletes schedules, also per conversation, and rejects bad input", async () => {
    const env = setup(at("2026-11-17T02:00:00Z"));
    const s = await env.make();
    const a = await s.create({ conversationId: "c1", prompt: "a", rule: { kind: "daily", time: "09:00" } });
    await s.create({ conversationId: "c1", prompt: "b", rule: { kind: "daily", time: "10:00" } });
    await s.create({ conversationId: "c2", prompt: "c", rule: { kind: "daily", time: "11:00" } });
    expect(await s.delete(a.id)).toBe(true);
    expect(await s.delete(a.id)).toBe(false);
    expect(await s.deleteForConversation("c1")).toBe(1);
    expect(s.list().map((x) => x.prompt)).toEqual(["c"]);
    await expect(s.create({ conversationId: "c1", prompt: " ", rule: { kind: "daily", time: "09:00" } })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(s.create({ conversationId: "c1", prompt: "x", rule: { kind: "once", at: env.now() - 1 } })).rejects.toMatchObject({ code: "invalid_rule" });
    await expect(s.create({ conversationId: "c1", prompt: "x", rule: { kind: "daily", time: "09:00" }, timeZone: "Mars/Base" })).rejects.toThrow(/time zone/);
  });

  it("the timer fires on its own after start()", async () => {
    const delivered: string[] = [];
    const s = await createScheduler({ file: join(dir, "t.json"), deliver: async (x) => void delivered.push(x.id) });
    const once = await s.create({ conversationId: "c", prompt: "soon", rule: { kind: "once", at: Date.now() + 150 } });
    s.start();
    await new Promise((r) => setTimeout(r, 600));
    s.stop();
    expect(delivered).toEqual([once.id]);
  });
});

describe("scheduleTools", () => {
  it("lets the model create, list and delete reminders of its own conversation only", async () => {
    const { scheduleTools } = await import("../src/index");
    const t0 = at("2026-11-17T02:00:00Z");
    const s = await createScheduler<{ model: string }>({ file: join(dir, "s.json"), now: () => t0, defaultTimeZone: SH, deliver: async () => {} });
    const tools = Object.fromEntries(scheduleTools(s, "c1", { settings: { model: "m" }, timeZone: SH, now: () => t0 }).map((x) => [x.name, x]));
    const ctx = { runId: "r", callId: "c", signal: new AbortController().signal, app: {}, emit: () => {}, update: () => {} };
    const created = await tools.schedule_create!.execute({ prompt: "summarize my mail", kind: "daily", time: "9:00" }, ctx);
    const v = JSON.parse((created as { content: string }).content) as { id: string; nextAt: string; rule: unknown };
    expect(v.rule).toEqual({ kind: "daily", time: "09:00" });
    expect(v.nextAt).toContain("2026/11/18 09:00");
    expect(s.get(v.id)).toMatchObject({ conversationId: "c1", settings: { model: "m" } });

    const bad = await tools.schedule_create!.execute({ prompt: "x", kind: "interval", everySeconds: 5 }, ctx);
    expect(bad).toMatchObject({ isError: true });
    const listed = JSON.parse(((await tools.schedule_list!.execute({}, ctx)) as { content: string }).content) as unknown[];
    expect(listed).toHaveLength(1);

    const other = await s.create({ conversationId: "c2", prompt: "not yours", rule: { kind: "daily", time: "10:00" } });
    expect(await tools.schedule_delete!.execute({ id: other.id }, ctx)).toMatchObject({ isError: true });
    expect(await tools.schedule_delete!.execute({ id: v.id }, ctx)).toMatchObject({ content: expect.stringContaining('"deleted":true') });
    expect(s.list().map((x) => x.id)).toEqual([other.id]);
  });
});
