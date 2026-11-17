/**
 * 模型的定时提醒工具（参考 dsh 的 tool-schedule）：schedule_create、schedule_list、schedule_delete。
 * 只能管理当前会话的提醒；到期的提醒作为用户消息回到这个会话。
 */
import { z } from "zod";
import { defineTool, type AnyTool } from "@leochat/core";
import { MIN_INTERVAL_SECONDS, ScheduleError, type Schedule, type ScheduleRule, type Scheduler } from "./schedule";

function view(s: Schedule, tz: string) {
  return {
    id: s.id,
    title: s.title,
    prompt: s.prompt,
    rule: s.rule,
    state: s.state,
    nextAt: s.nextAt === null ? null : new Date(s.nextAt).toLocaleString("zh-CN", { hour12: false, timeZone: tz }),
    timeZone: s.timeZone,
  };
}

export function scheduleTools<S>(scheduler: Scheduler<S>, conversationId: string, opts: { settings?: S; timeZone?: string; now?: () => number } = {}): AnyTool[] {
  const now = opts.now ?? Date.now;
  const tz = opts.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const fail = (e: unknown) => ({ content: JSON.stringify({ code: e instanceof ScheduleError ? e.code : "error", message: e instanceof ScheduleError ? e.message : "The schedule operation failed." }), isError: true });
  return [
    defineTool({
      name: "schedule_create",
      description:
        "Create a reminder that is delivered back into this conversation as a user message when due. " +
        `Kinds: once (afterSeconds), interval (everySeconds, at least ${MIN_INTERVAL_SECONDS}), daily (time HH:MM), ` +
        `weekly (time HH:MM + weekdays 0=Sunday..6), cron (5-field expression). Clock times use the user's time zone (${tz}). ` +
        "Only create one when the user asks for a reminder or a recurring task.",
      input: z.object({
        prompt: z.string().describe("What to say / do when the reminder is due, written as the user's instruction"),
        title: z.string().describe("Short name").optional(),
        kind: z.enum(["once", "interval", "daily", "weekly", "cron"]),
        afterSeconds: z.number().int().positive().optional(),
        everySeconds: z.number().int().optional(),
        time: z.string().optional(),
        weekdays: z.array(z.number().int()).optional(),
        expression: z.string().optional(),
      }),
      execute: async (input) => {
        let rule: ScheduleRule;
        switch (input.kind) {
          case "once":
            if (!input.afterSeconds) return fail(new ScheduleError("invalid_rule", "once needs afterSeconds"));
            rule = { kind: "once", at: now() + input.afterSeconds * 1000 };
            break;
          case "interval":
            rule = { kind: "interval", everySeconds: input.everySeconds ?? 0 };
            break;
          case "daily":
            rule = { kind: "daily", time: input.time ?? "" };
            break;
          case "weekly":
            rule = { kind: "weekly", time: input.time ?? "", weekdays: input.weekdays ?? [] };
            break;
          case "cron":
            rule = { kind: "cron", expression: input.expression ?? "" };
            break;
        }
        try {
          const s = await scheduler.create({
            conversationId,
            prompt: input.prompt,
            ...(input.title ? { title: input.title } : {}),
            rule,
            timeZone: tz,
            ...(opts.settings !== undefined ? { settings: opts.settings } : {}),
          });
          return { content: JSON.stringify(view(s, tz)) };
        } catch (e) {
          return fail(e);
        }
      },
    }),
    defineTool({
      name: "schedule_list",
      description: "List the active reminders of this conversation.",
      input: z.object({}),
      execute: () => ({ content: JSON.stringify(scheduler.list({ conversationId }).map((s) => view(s, tz))) }),
    }),
    defineTool({
      name: "schedule_delete",
      description: "Delete a reminder of this conversation by id.",
      input: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const s = scheduler.get(id);
        if (!s || s.conversationId !== conversationId) return { content: JSON.stringify({ id, deleted: false, code: "schedule_not_found" }), isError: true };
        await scheduler.delete(id);
        return { content: JSON.stringify({ id, deleted: true }) };
      },
    }),
  ];
}
