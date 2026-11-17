/**
 * /loop 命令解析（harness 第二期：定时提醒）。复杂的说法（"工作日早上 9 点""10 分钟后"）交给模型用 schedule_create 处理。
 *
 *   /loop 30m 检查邮件            每 30 分钟（m / h / d，最少 1 分钟）
 *   /loop 09:00 总结昨天的工作      每天 09:00
 *   /loop cron 0 9 * * 1-5 晨报   cron 五字段
 */

/** 与 server（@leochat/node）的 ScheduleRule 相同的结构 */
export type LoopRule =
  | { kind: "once"; at: number }
  | { kind: "interval"; everySeconds: number }
  | { kind: "daily"; time: string }
  | { kind: "weekly"; time: string; weekdays: number[] }
  | { kind: "cron"; expression: string };

export type LoopParse = { ok: true; rule: LoopRule; prompt: string } | { ok: false; error: string };

export const LOOP_USAGE = "用法：/loop 30m 内容（每 30 分钟）、/loop 09:00 内容（每天）、/loop cron 0 9 * * 1-5 内容";

const UNIT: Record<string, number> = { m: 60, min: 60, h: 3600, d: 86400 };

/** 不是 /loop 命令时返回 null */
export function parseLoopCommand(input: string): LoopParse | null {
  const m = /^\/loop(?:\s+([\s\S]*))?$/.exec(input.trim());
  if (!m) return null;
  const rest = (m[1] ?? "").trim();
  if (!rest) return { ok: false, error: LOOP_USAGE };

  const interval = /^(\d+)\s*(m|min|h|d)\s+([\s\S]+)$/i.exec(rest);
  if (interval) {
    const seconds = Number(interval[1]) * UNIT[interval[2]!.toLowerCase()]!;
    if (seconds < 60) return { ok: false, error: "间隔最少 1 分钟" };
    return { ok: true, rule: { kind: "interval", everySeconds: seconds }, prompt: interval[3]!.trim() };
  }

  const daily = /^(\d{1,2}):(\d{2})\s+([\s\S]+)$/.exec(rest);
  if (daily) {
    const h = Number(daily[1]);
    const mi = Number(daily[2]);
    if (h > 23 || mi > 59) return { ok: false, error: "时间要写成 HH:MM，例如 09:00" };
    return { ok: true, rule: { kind: "daily", time: `${String(h).padStart(2, "0")}:${daily[2]}` }, prompt: daily[3]!.trim() };
  }

  const cron = /^cron\s+(\S+\s+\S+\s+\S+\s+\S+\s+\S+)\s+([\s\S]+)$/i.exec(rest);
  if (cron) return { ok: true, rule: { kind: "cron", expression: cron[1]! }, prompt: cron[2]!.trim() };

  return { ok: false, error: LOOP_USAGE };
}

/** 规则的中文描述（提醒条上显示） */
export function describeRule(rule: LoopRule): string {
  switch (rule.kind) {
    case "once":
      return "一次";
    case "interval": {
      const s = rule.everySeconds;
      if (s % 86400 === 0) return `每 ${s / 86400} 天`;
      if (s % 3600 === 0) return `每 ${s / 3600} 小时`;
      return `每 ${Math.round(s / 60)} 分钟`;
    }
    case "daily":
      return `每天 ${rule.time}`;
    case "weekly":
      return `每周${rule.weekdays.map((d) => "日一二三四五六"[d]).join("、")} ${rule.time}`;
    case "cron":
      return `cron ${rule.expression}`;
  }
}
