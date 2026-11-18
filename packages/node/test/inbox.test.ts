import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { userMessage } from "@leochat/core";
import { conversationLog, replayInbox, type InboxItem } from "../src/index";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leochat-inbox-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const item = (id: string, source: InboxItem["source"] = "user"): InboxItem => ({ id, message: userMessage(id, `m_${id}`), source, at: 1 });

describe("conversation inbox", () => {
  it("persists inserts and removals and replays the pending lists after reopening", async () => {
    const log = await conversationLog(dir);
    const c = await log.create();
    await log.inboxInsert(c.id, "next-turn", { ...item("a"), settings: { model: "m" } });
    await log.inboxInsert(c.id, "next-turn", item("b", "reminder"));
    await log.inboxInsert(c.id, "next-step", item("s"));
    await log.inboxRemove(c.id, ["a", "s"], "claimed");
    await log.inboxRemove(c.id, [], "discarded"); // 空移除不写记录
    const loaded = await (await conversationLog(dir)).load(c.id);
    expect(loaded!.inbox["next-turn"].map((x) => [x.id, x.source])).toEqual([["b", "reminder"]]);
    expect(loaded!.inbox["next-step"]).toEqual([]);
    expect(loaded!.transcript).toEqual([]); // 收件箱不是 transcript
  });

  it("rejects a duplicated pending id and ignores removals of unknown ids", () => {
    const ins = (id: string) => ({ t: "inbox", op: "insert", target: "next-turn", item: item(id), at: 1 });
    expect(() => replayInbox([ins("x"), ins("x")] as never)).toThrow(/already pending/);
    expect(replayInbox([ins("x"), { t: "inbox", op: "remove", ids: ["nope"], outcome: "claimed", at: 2 }] as never)["next-turn"]).toHaveLength(1);
  });

  it("survives a torn last line written during an insert", async () => {
    const log = await conversationLog(dir);
    const c = await log.create();
    await log.inboxInsert(c.id, "next-turn", item("kept"));
    await appendFile(join(dir, `${c.id}.jsonl`), '{"t":"inbox","op":"insert","targ');
    expect((await log.load(c.id))!.inbox["next-turn"].map((x) => x.id)).toEqual(["kept"]);
  });
});

describe("writes after delete", () => {
  it("a write still in flight after a conversation is deleted does not recreate its log file", async () => {
    const { readdir } = await import("node:fs/promises");
    const log = await conversationLog(dir);
    const c = await log.create();
    await log.delete(c.id);
    await log.append(c.id, { kind: "append", message: userMessage("late", "m1") });
    await log.inboxInsert(c.id, "next-turn", item("late"));
    expect((await readdir(dir)).filter((f) => f.endsWith(".jsonl"))).toEqual([]);
    expect(await log.load(c.id)).toBeNull();
  });
});
