/**
 * 界面操作工具（进程内）。以前放在 leochat MCP 服务里，工具结果里带 __ui_command__ JSON、由前端解析；
 * 现在由 server 直接提供：执行时发出 core 的 custom 事件（name = "ui_command"），前端收到后执行。
 * 好处：不依赖 MCP 连接，前端不用从工具输出里猜命令，模型拿到的结果也是简短的文字。
 */
import { z } from "zod";
import { defineTool, type AnyTool, type ToolContext } from "@leochat/core";
import { themePresets } from "@ai-chatbox/shared";

/** custom 事件名；前端按这个名字执行界面命令 */
export const UI_COMMAND_EVENT = "ui_command";

export type UiCommandName =
  | "update_theme"
  | "show_notification"
  | "show_confirm"
  | "open_panel"
  | "close_panel"
  | "copy_to_clipboard"
  | "open_url"
  | "scroll_to_message"
  | "set_input"
  | "resize_window";

export interface UiCommandEvent {
  command: UiCommandName;
  payload: Record<string, unknown>;
}

/** 主题别名（自然语言） */
const THEME_ALIASES: Record<string, string> = {
  默认: "light",
  浅色: "light",
  深色: "dark",
  紫色: "light-purple",
  深紫: "dark-purple",
  绿色: "light-green",
  深绿: "dark-green",
  purple: "light-purple",
  green: "light-green",
};

export function resolveThemeId(input: string): string | null {
  if (themePresets.some((t) => t.id === input)) return input;
  if (THEME_ALIASES[input]) return THEME_ALIASES[input]!;
  const lower = input.toLowerCase();
  for (const t of themePresets) {
    if (t.id.includes(lower) || lower.includes(t.id) || t.name.toLowerCase().includes(lower)) return t.id;
  }
  return null;
}

const themeList = () => themePresets.map((t) => t.id).join(", ");

/** 发出界面命令并返回给模型的简短结果 */
function send(ctx: ToolContext, command: UiCommandName, payload: Record<string, unknown>, result: string) {
  ctx.emit(UI_COMMAND_EVENT, { command, payload } satisfies UiCommandEvent);
  return { content: result };
}

/**
 * @param opts.electron 桌面端才提供 resize_window
 */
export function uiTools(opts: { electron?: boolean } = {}): AnyTool[] {
  const tools: AnyTool[] = [
    defineTool({
      name: "update_theme",
      description: `更新界面主题，或只切换明暗模式。可用主题: ${themeList()}`,
      input: z.object({
        theme: z.string().describe(`主题 ID: ${themeList()}`).optional(),
        mode: z.enum(["light", "dark"]).describe("切换明暗模式（保持当前色系）").optional(),
      }),
      execute: ({ theme, mode }, ctx) => {
        if (theme) {
          const id = resolveThemeId(theme);
          if (!id) return { content: `未知主题: ${theme}。可用: ${themeList()}`, isError: true };
          return send(ctx, "update_theme", { themeId: id }, `已切换到主题 ${id}`);
        }
        if (mode) return send(ctx, "update_theme", { mode }, `已切换到${mode === "dark" ? "深色" : "浅色"}模式`);
        return { content: "请指定 theme 或 mode 参数", isError: true };
      },
    }),
    defineTool({
      name: "show_notification",
      description: "在界面上显示一条通知",
      input: z.object({
        message: z.string().describe("通知内容"),
        type: z.enum(["info", "success", "warning", "error"]).describe("通知类型").optional(),
        duration: z.number().describe("显示时长(ms)，默认 3000").optional(),
      }),
      execute: ({ message, type = "info", duration = 3000 }, ctx) =>
        send(ctx, "show_notification", { message, type, duration }, "通知已显示"),
    }),
    defineTool({
      name: "show_confirm",
      description: "显示确认对话框（只负责展示，结果不会返回给你）",
      input: z.object({
        title: z.string().describe("标题"),
        message: z.string().describe("确认消息"),
        confirmText: z.string().describe("确认按钮文字").optional(),
        cancelText: z.string().describe("取消按钮文字").optional(),
      }),
      execute: (input, ctx) => send(ctx, "show_confirm", input, "确认框已显示"),
    }),
    defineTool({
      name: "open_panel",
      description: "打开界面面板",
      input: z.object({
        panel: z.enum(["mcp", "settings", "history"]).describe("面板类型"),
        tab: z.string().describe("要激活的标签页").optional(),
      }),
      execute: (input, ctx) => send(ctx, "open_panel", input, `已打开 ${input.panel} 面板`),
    }),
    defineTool({
      name: "close_panel",
      description: "关闭界面面板",
      input: z.object({ panel: z.enum(["mcp", "settings", "history", "all"]).describe("面板类型，或 all 关闭全部") }),
      execute: (input, ctx) => send(ctx, "close_panel", input, "面板已关闭"),
    }),
    defineTool({
      name: "copy_to_clipboard",
      description: "把文本复制到用户的剪贴板",
      input: z.object({
        text: z.string().describe("要复制的文本"),
        showNotification: z.boolean().describe("是否显示成功通知").optional(),
      }),
      execute: ({ text, showNotification = true }, ctx) =>
        send(ctx, "copy_to_clipboard", { text, showNotification }, "已复制到剪贴板"),
    }),
    defineTool({
      name: "open_url",
      description: "在浏览器中打开链接（仅 http/https）",
      input: z.object({
        url: z.string().describe("URL 地址"),
        newTab: z.boolean().describe("是否在新标签页打开").optional(),
      }),
      execute: ({ url, newTab = true }, ctx) => {
        if (!/^https?:\/\//i.test(url)) return { content: "只能打开 http/https 链接", isError: true };
        return send(ctx, "open_url", { url, newTab }, `已打开 ${url}`);
      },
    }),
    defineTool({
      name: "set_input",
      description: "设置聊天输入框内容（不会自动发送）",
      input: z.object({
        text: z.string().describe("要设置的文本"),
        append: z.boolean().describe("是否追加而非替换").optional(),
      }),
      execute: ({ text, append = false }, ctx) => send(ctx, "set_input", { text, append }, "已填入输入框"),
    }),
    defineTool({
      name: "scroll_to_message",
      description: "滚动到指定消息，或滚到顶部 / 底部",
      input: z.object({
        messageId: z.string().describe("消息 ID").optional(),
        position: z.enum(["top", "bottom"]).describe("滚动到顶部或底部").optional(),
      }),
      execute: (input, ctx) => send(ctx, "scroll_to_message", input, "已滚动"),
    }),
  ];
  if (opts.electron) {
    tools.push(
      defineTool({
        name: "resize_window",
        description: "调整桌面应用窗口大小：预设尺寸，或同时给出宽和高",
        input: z.object({
          preset: z
            .enum(["small", "medium", "large", "fullscreen"])
            .describe("预设: small(800×600), medium(1200×800), large(1600×1000), fullscreen(最大化)")
            .optional(),
          width: z.number().describe("自定义宽度（px），需同时提供 height").optional(),
          height: z.number().describe("自定义高度（px），需同时提供 width").optional(),
        }),
        execute: (input, ctx) => send(ctx, "resize_window", input, "窗口大小已调整"),
      }),
    );
  }
  return tools;
}

export const UI_TOOL_NAMES: ReadonlySet<string> = new Set([...uiTools({ electron: true }).map((t) => t.name)]);
