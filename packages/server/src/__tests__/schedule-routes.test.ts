/**
 * /loop：到期的定时提醒放进会话收件箱，由处理者在空闲时跑（会话忙时排在后面，不再失败重试）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gated, isCustom, listen, makeApp, newConv, req, say, text, textOf, transcript, turnsDone } from "./helpers.js";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leochat-schedule-routes-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const schedules = async (app: Parameters<typeof req>[0], id?: string) =>
  ((await (await req(app, "GET", `/schedules${id ? `?conversationId=${id}` : ""}`)).json()) as {
    schedules: Array<{ id: string; rule: unknown; settings: { model?: string } }>;
  }).schedules;

describe("/loop schedules", () => {
  it("a due reminder lands in the inbox and runs with its saved settings; the open page sees it live", async () => {
    const { app, requests } = makeApp(dir, [text("Good morning! Here is your summary.")], { schedules: true });
    const id = await newConv(app);
    const l = await listen(app, id);
    const created = await req(app, "POST", `/conversations/${id}/schedules`, {
      prompt: "Summarize my day",
      rule: { kind: "once", at: Date.now() + 300 },
      settings: { model: "deepseek-chat", maxSteps: 3 },
    });
    expect(created.status).toBe(200);
    const events = await l.until(turnsDone(1));
    const um = events.find((e) => e.type === "user_message") as { message: { content: Array<{ text: string }> } };
    expect(um.message.content[0]!.text).toMatch(/^\[定时提醒\][\s\S]*Summarize my day/);
    expect(requests[0]!.model).toBe("deepseek-chat");
    expect((await transcript(app, id)).transcript.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(await schedules(app, id)).toHaveLength(0); // 一次性提醒投递后结束
  });

  it("a reminder that fires during a turn waits in the inbox and runs right after it", async () => {
    const g = gated("long answer");
    const { app } = makeApp(dir, [g.round, text("Reminder handled.")], { schedules: true });
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "start");
    await l.until((ev) => ev.some((e) => e.type === "run_start"));
    await req(app, "POST", `/conversations/${id}/schedules`, { prompt: "drink water", rule: { kind: "once", at: Date.now() + 200 } });
    await l.until((ev) => ev.some((e) => isCustom(e, "inbox") && (e.data as { nextTurn: Array<{ source: string }> }).nextTurn.some((x) => x.source === "reminder")));
    g.release();
    await l.until(turnsDone(2));
    const t = (await transcript(app, id)).transcript;
    expect(t.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect(textOf(t[2]!)).toContain("[定时提醒]");
  });

  it("the model can create a reminder with schedule_create; the turn's settings are saved with it", async () => {
    const { app } = makeApp(
      dir,
      [
        async (cbs) => {
          await cbs.onToolCall({ id: "s1", name: "schedule_create", arguments: { prompt: "Check the news", kind: "daily", time: "08:30" }, status: "pending" });
          await cbs.onComplete({ id: "a", role: "assistant", content: "", timestamp: 1 });
        },
        text("Done, I will remind you every day at 08:30."),
      ],
      { schedules: true },
    );
    const id = await newConv(app);
    const l = await listen(app, id);
    await say(app, id, "remind me daily at 8:30 to check the news", { settings: { model: "deepseek-reasoner" } });
    await l.until(turnsDone(1));
    const list = await schedules(app, id);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ rule: { kind: "daily", time: "08:30" }, settings: { model: "deepseek-reasoner" } });

    // 删除会话时一并删除它的提醒
    await req(app, "DELETE", `/conversations/${id}`);
    expect(await schedules(app)).toHaveLength(0);
  });

  it("validates input", async () => {
    const { app } = makeApp(dir, [], { schedules: true });
    const id = await newConv(app);
    expect((await req(app, "POST", `/conversations/${id}/schedules`, { prompt: "x" })).status).toBe(400);
    expect((await req(app, "POST", `/conversations/${id}/schedules`, { prompt: "x", rule: { kind: "interval", everySeconds: 5 } })).status).toBe(400);
    expect((await req(app, "POST", "/conversations/conv_missing/schedules", { prompt: "x", rule: { kind: "daily", time: "09:00" } })).status).toBe(404);
    expect((await req(app, "DELETE", "/schedules/sched_missing")).status).toBe(404);
    const ok = await req(app, "POST", `/conversations/${id}/schedules`, { prompt: "x", rule: { kind: "daily", time: "09:00" } });
    const s = ((await ok.json()) as { schedule: { id: string } }).schedule;
    expect((await req(app, "DELETE", `/schedules/${s.id}`)).status).toBe(200);
    await vi.waitFor(async () => expect(await schedules(app, id)).toHaveLength(0));
  });
});
