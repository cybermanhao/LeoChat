/**
 * 输入框里的 / 命令（重设计 P3）：菜单里按组列出，选中后补全到输入框；
 * 不带参数的命令（/clear、/details）选中即执行。命令本身在 ChatArea 的 handleSend 里处理。
 */
export interface SlashCommand {
  name: string;
  group: "自动化" | "对话" | "显示";
  /** 参数说明，没有参数时省略 */
  args?: string;
  desc: string;
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: "goal", group: "自动化", args: "<目标>", desc: "设定目标，模型一轮接一轮推进，直到完成" },
  { name: "loop", group: "自动化", args: "<间隔或时间> <内容>", desc: "定时提醒，例如 /loop 30m 看一眼邮箱" },
  { name: "details", group: "显示", desc: "切换工作细节：简洁 / 详细" },
  { name: "clear", group: "对话", desc: "清空当前对话（会先确认）" },
];

/** 输入框内容是"/"加上部分命令名（还没输入空格）时，返回匹配的命令；否则返回 null（不显示菜单） */
export function matchSlash(input: string): SlashCommand[] | null {
  const m = /^\/(\S*)$/.exec(input);
  if (!m) return null;
  const q = m[1]!.toLowerCase();
  const hits = SLASH_COMMANDS.filter((c) => c.name.startsWith(q));
  return hits.length ? hits : null;
}
