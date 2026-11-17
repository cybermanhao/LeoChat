import { describe, expect, it } from "vitest";
import { describeRule, parseLoopCommand } from "../loop-command";

describe("parseLoopCommand", () => {
  it("parses intervals, daily times and cron", () => {
    expect(parseLoopCommand("/loop 30m 检查邮件")).toEqual({ ok: true, rule: { kind: "interval", everySeconds: 1800 }, prompt: "检查邮件" });
    expect(parseLoopCommand("/loop 2h  喝水\n多喝点")).toEqual({ ok: true, rule: { kind: "interval", everySeconds: 7200 }, prompt: "喝水\n多喝点" });
    expect(parseLoopCommand("/loop 1d 备份")).toMatchObject({ rule: { kind: "interval", everySeconds: 86400 } });
    expect(parseLoopCommand("/loop 9:30 总结")).toEqual({ ok: true, rule: { kind: "daily", time: "09:30" }, prompt: "总结" });
    expect(parseLoopCommand("/loop cron 0 9 * * 1-5 晨报")).toEqual({ ok: true, rule: { kind: "cron", expression: "0 9 * * 1-5" }, prompt: "晨报" });
  });

  it("rejects bad input and ignores other text", () => {
    expect(parseLoopCommand("hello")).toBeNull();
    expect(parseLoopCommand("/looping")).toBeNull();
    expect(parseLoopCommand("/loop")).toMatchObject({ ok: false });
    expect(parseLoopCommand("/loop 30m")).toMatchObject({ ok: false });
    expect(parseLoopCommand("/loop 0m x")).toMatchObject({ ok: false, error: "间隔最少 1 分钟" });
    expect(parseLoopCommand("/loop 25:00 x")).toMatchObject({ ok: false });
    expect(parseLoopCommand("/loop 每天早上 x")).toMatchObject({ ok: false });
  });

  it("describes rules", () => {
    expect(describeRule({ kind: "interval", everySeconds: 1800 })).toBe("每 30 分钟");
    expect(describeRule({ kind: "interval", everySeconds: 7200 })).toBe("每 2 小时");
    expect(describeRule({ kind: "daily", time: "09:00" })).toBe("每天 09:00");
    expect(describeRule({ kind: "weekly", time: "08:00", weekdays: [1, 5] })).toBe("每周一、五 08:00");
  });
});
