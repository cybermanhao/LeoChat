/**
 * 工具专用视图（按 dsh 的做法：按工具名注册，未注册的走通用视图）。
 * 每个视图给出：图标、一句话描述（命令、搜索词、地址……），以及在过程摘要里归入哪一类。
 */
import {
  AlarmClock,
  Clipboard,
  ExternalLink,
  Globe,
  Link2,
  Bell,
  Palette,
  PanelRight,
  Target,
  Terminal,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** 过程摘要里的分类："运行 2 条命令 · 搜索 3 次 · 读取 1 个网页 · 1 个工具" */
export type StepKind = "command" | "search" | "page" | "tool";

export interface ToolView {
  icon: LucideIcon;
  kind: StepKind;
  /** 一句话描述；拿不到参数时返回 undefined，界面会退回显示工具名 */
  describe: (input: Record<string, unknown>) => string | undefined;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

function hostPath(url: unknown): string | undefined {
  const s = str(url);
  if (!s) return undefined;
  try {
    const u = new URL(s);
    return u.hostname + (u.pathname === "/" ? "" : u.pathname);
  } catch {
    return s;
  }
}

const THEME_LABEL: Record<string, string> = {
  light: "浅色",
  dark: "深色",
  "light-purple": "浅紫",
  "dark-purple": "深紫",
  "light-green": "浅绿",
  "dark-green": "深绿",
};

const VIEWS: Record<string, ToolView> = {
  bash: { icon: Terminal, kind: "command", describe: (i) => str(i.command) && `$ ${str(i.command)}` },
  web_search: { icon: Globe, kind: "search", describe: (i) => str(i.query) && `“${str(i.query)}”` },
  read_url: { icon: Link2, kind: "page", describe: (i) => hostPath(i.url) },
  update_theme: {
    icon: Palette,
    kind: "tool",
    describe: (i) =>
      str(i.theme) ? `切换主题：${THEME_LABEL[str(i.theme)!] ?? str(i.theme)}` : i.mode === "dark" ? "切换到深色" : i.mode === "light" ? "切换到浅色" : undefined,
  },
  show_notification: { icon: Bell, kind: "tool", describe: (i) => str(i.message) },
  copy_to_clipboard: { icon: Clipboard, kind: "tool", describe: () => "复制到剪贴板" },
  open_url: { icon: ExternalLink, kind: "tool", describe: (i) => hostPath(i.url) },
  show_confirm: { icon: Bell, kind: "tool", describe: (i) => str(i.title) },
  open_panel: { icon: PanelRight, kind: "tool", describe: (i) => str(i.panel) && `打开面板：${str(i.panel)}` },
  close_panel: { icon: PanelRight, kind: "tool", describe: () => "关闭面板" },
  get_goal: { icon: Target, kind: "tool", describe: () => "查看目标" },
  update_goal: { icon: Target, kind: "tool", describe: (i) => (i.action === "complete" ? "把目标标记为完成" : i.action === "blocked" ? "目标受阻" : "更新目标") },
  schedule_create: { icon: AlarmClock, kind: "tool", describe: (i) => (str(i.title) ?? str(i.prompt)) && `设置提醒：${str(i.title) ?? str(i.prompt)}` },
  schedule_list: { icon: AlarmClock, kind: "tool", describe: () => "查看提醒" },
  schedule_delete: { icon: AlarmClock, kind: "tool", describe: () => "删除提醒" },
};

/** 通用视图：工具名 + 第一个字符串参数 */
const GENERIC: ToolView = {
  icon: Wrench,
  kind: "tool",
  describe: (i) => {
    const first = Object.values(i).find((v) => typeof v === "string" && v.trim());
    return typeof first === "string" ? first : undefined;
  },
};

export function toolView(name: string): ToolView {
  return VIEWS[name] ?? GENERIC;
}

/** DeepSeek 原生联网搜索（server_tool）：{action:"search", queries:[…]} / {action:"open_page", url} / 旧格式 {query} */
export function serverToolDescribe(input: unknown): { kind: StepKind; text?: string } {
  const i = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (i.action === "open_page") return { kind: "page", text: hostPath(i.url) };
  const queries = Array.isArray(i.queries) ? i.queries.filter((q): q is string => typeof q === "string") : [];
  const q = queries.length ? queries.join(" / ") : str(i.query);
  return { kind: "search", text: q && `“${q}”` };
}

/** MCP 工具的结果常是整段 JSON（{ _meta, content: [{ type: "text", text }] }），展示时只取文字 */
export function displayOutput(text: string): string {
  if (!text.trimStart().startsWith("{")) return text;
  try {
    const v = JSON.parse(text) as { content?: unknown; structuredContent?: unknown };
    if (Array.isArray(v.content)) {
      const texts = v.content.flatMap((c) =>
        c && typeof c === "object" && (c as { type?: unknown }).type === "text" ? [String((c as { text?: unknown }).text ?? "")] : [],
      );
      if (texts.length) return texts.join("\n");
    }
  } catch {
    // 不是 JSON，原样显示
  }
  return text;
}
