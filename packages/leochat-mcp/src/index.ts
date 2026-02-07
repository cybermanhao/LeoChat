import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { themePresets, type ThemePreset } from "@ai-chatbox/shared";

/**
 * LeoChat MCP Server
 *
 * 通过 MCP 协议为 LeoChat 提供 UI 控制能力
 * 前端通过解析工具结果中的 __ui_command__ 字段来执行 UI 操作
 */

// ============================================================================
// UI Command DSL 类型定义
// ============================================================================

type CommandName =
  | "update_theme"
  | "show_notification"
  | "show_confirm"
  | "open_panel"
  | "close_panel"
  | "copy_to_clipboard"
  | "open_url"
  | "scroll_to_message"
  | "set_input"
  | "render_cards";

interface UICommand {
  __ui_command__: true;
  command: CommandName;
  payload: Record<string, unknown>;
}

function createUICommand(
  command: CommandName,
  payload: Record<string, unknown>
): UICommand {
  return {
    __ui_command__: true,
    command,
    payload,
  };
}

/**
 * 转义 HTML 属性值中的特殊字符
 */
function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ============================================================================
// 主题配置 - 从 @ai-chatbox/shared 导入，自动同步
// ============================================================================

// 从 themePresets 生成主题映射
const THEME_MAP = new Map<string, ThemePreset>(
  themePresets.map((t) => [t.id, t])
);

// 主题别名（用于自然语言匹配）
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

function resolveThemeId(input: string): string | null {
  // 直接匹配
  if (THEME_MAP.has(input)) return input;
  // 别名匹配
  if (THEME_ALIASES[input]) return THEME_ALIASES[input];
  // 模糊匹配
  const lowerInput = input.toLowerCase();
  for (const preset of themePresets) {
    if (preset.id.includes(lowerInput) || lowerInput.includes(preset.id)) {
      return preset.id;
    }
    if (preset.name.toLowerCase().includes(lowerInput)) {
      return preset.id;
    }
  }
  return null;
}

// 获取主题列表字符串（用于工具描述）
function getThemeListString(): string {
  return themePresets.map((t) => t.id).join(", ");
}

// 获取主题描述列表（用于 prompt）
function getThemeDescriptions(): string {
  return themePresets
    .map((t) => `  - ${t.id}: ${t.name}${t.isDark ? " (深色)" : " (浅色)"}`)
    .join("\n");
}

// ============================================================================
// MCP 服务器配置
// ============================================================================

const server = new Server(
  {
    name: "leochat-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
      prompts: {},
    },
  }
);

// ============================================================================
// Prompts
// ============================================================================

server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "leochat_assistant",
        description: "LeoChat UI 控制助手 - 启用主题、通知、面板等 UI 控制能力",
      },
    ],
  };
});

server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  const { name } = request.params;

  if (name === "leochat_assistant") {
    return {
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `你是 LeoChat 的 UI 控制助手，具有以下能力：

## 主题控制
可用主题:
${getThemeDescriptions()}

使用方法:
- 切换到具体主题: update_theme(theme: "dark-purple")
- 只切换明暗模式: update_theme(mode: "dark") - 智能保持当前色系

## 通知系统
- show_notification(message, type, duration) - 显示通知
  type: "info" | "success" | "warning" | "error"

## 对话框
- show_confirm(title, message) - 显示确认对话框

## 面板控制
- open_panel(panel, tab) - 打开面板 (mcp/settings/history)
- close_panel(panel) - 关闭面板

## 卡片展示
- render_cards(cards, columns) - 渲染卡片组件
  适用场景：搜索结果、产品展示、文章列表等
  cards: [{title, description, image, link, linkText}, ...]
  columns: 1 | 2 | 3 (默认 2)

## 其他能力
- copy_to_clipboard(text) - 复制到剪贴板
- open_url(url, newTab) - 打开链接
- set_input(text, append) - 设置输入框内容

重要规则：
1. 当用户请求 UI 操作时，必须调用对应工具，不要只是口头回复
2. 操作成功后会自动显示视觉反馈
3. 可以组合多个工具完成复杂操作`,
          },
        },
      ],
    };
  }

  throw new Error(`Unknown prompt: ${name}`);
});

// ============================================================================
// 工具定义
// ============================================================================

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const themeList = getThemeListString();

  return {
    tools: [
      {
        name: "update_theme",
        description: `更新界面主题。可用: ${themeList}`,
        inputSchema: {
          type: "object",
          properties: {
            theme: {
              type: "string",
              description: `主题 ID: ${themeList}`,
            },
            mode: {
              type: "string",
              enum: ["light", "dark"],
              description: "切换明暗模式（保持当前色系）",
            },
          },
        },
      },
      {
        name: "show_notification",
        description: "显示通知消息",
        inputSchema: {
          type: "object",
          properties: {
            message: { type: "string", description: "通知内容" },
            type: {
              type: "string",
              enum: ["info", "success", "warning", "error"],
              description: "通知类型",
            },
            duration: { type: "number", description: "显示时长(ms)，默认 3000" },
          },
          required: ["message"],
        },
      },
      {
        name: "show_confirm",
        description: "显示确认对话框",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "标题" },
            message: { type: "string", description: "确认消息" },
            confirmText: { type: "string", description: "确认按钮文字" },
            cancelText: { type: "string", description: "取消按钮文字" },
          },
          required: ["title", "message"],
        },
      },
      {
        name: "open_panel",
        description: "打开 UI 面板",
        inputSchema: {
          type: "object",
          properties: {
            panel: {
              type: "string",
              enum: ["mcp", "settings", "history"],
              description: "面板类型",
            },
            tab: { type: "string", description: "要激活的标签页" },
          },
          required: ["panel"],
        },
      },
      {
        name: "close_panel",
        description: "关闭 UI 面板",
        inputSchema: {
          type: "object",
          properties: {
            panel: {
              type: "string",
              enum: ["mcp", "settings", "history", "all"],
              description: "面板类型，或 'all' 关闭全部",
            },
          },
          required: ["panel"],
        },
      },
      {
        name: "copy_to_clipboard",
        description: "复制文本到剪贴板",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "要复制的文本" },
            showNotification: { type: "boolean", description: "是否显示成功通知" },
          },
          required: ["text"],
        },
      },
      {
        name: "open_url",
        description: "在浏览器中打开链接",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL 地址" },
            newTab: { type: "boolean", description: "是否在新标签页打开" },
          },
          required: ["url"],
        },
      },
      {
        name: "set_input",
        description: "设置聊天输入框内容",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "要设置的文本" },
            append: { type: "boolean", description: "是否追加而非替换" },
          },
          required: ["text"],
        },
      },
      {
        name: "scroll_to_message",
        description: "滚动到指定消息或位置",
        inputSchema: {
          type: "object",
          properties: {
            messageId: { type: "string", description: "消息 ID" },
            position: {
              type: "string",
              enum: ["top", "bottom"],
              description: "滚动到顶部或底部",
            },
          },
        },
      },
      {
        name: "test_tool_call",
        description: "测试工具调用 UI 渲染。用于测试工具调用的读条动画效果。当用户说'测试tool调用'时使用此工具。",
        inputSchema: {
          type: "object",
          properties: {
            duration: {
              type: "number",
              description: "模拟执行时间（秒），默认 3",
            },
            shouldFail: {
              type: "boolean",
              description: "是否模拟失败，默认 false",
            },
            message: {
              type: "string",
              description: "自定义返回消息",
            },
          },
        },
      },
      {
        name: "render_cards",
        description: "渲染卡片组件，用于展示结构化信息（如搜索结果、产品、文章等）。支持左图右信息布局，可点击跳转。",
        inputSchema: {
          type: "object",
          properties: {
            cards: {
              type: "array",
              description: "卡片数据数组",
              items: {
                type: "object",
                properties: {
                  title: { type: "string", description: "卡片标题" },
                  description: { type: "string", description: "卡片描述" },
                  image: { type: "string", description: "图片 URL" },
                  link: { type: "string", description: "点击跳转链接" },
                  linkText: { type: "string", description: "链接文字，默认'查看详情'" },
                },
              },
            },
            columns: {
              type: "number",
              enum: [1, 2, 3],
              description: "列数，默认 2",
            },
          },
          required: ["cards"],
        },
      },
      {
        name: "generate_waifu",
        description: "生成随机二次元图片（waifu/头像等）。返回图片URL，可直接用于头像、示例图片等场景。",
        inputSchema: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: ["waifu", "neko", "shinobu", "megumin", "awoo", "smile", "happy", "wink", "blush", "smug", "dance"],
              description: "图片类型。waifu=随机美少女, neko=猫娘, 其他为特定角色/表情",
            },
            count: {
              type: "number",
              description: "生成数量(1-5)，默认1",
            },
            asCard: {
              type: "boolean",
              description: "是否以卡片形式返回（包含预览），默认true",
            },
          },
        },
      },
    ],
  };
});

// ============================================================================
// 工具处理
// ============================================================================

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  const makeResponse = (command: UICommand) => ({
    content: [{ type: "text" as const, text: JSON.stringify(command) }],
  });

  const makeError = (message: string) => ({
    content: [{ type: "text" as const, text: message }],
  });

  switch (name) {
    case "update_theme": {
      const { theme, mode } = args as { theme?: string; mode?: "light" | "dark" };

      if (theme) {
        const resolvedTheme = resolveThemeId(theme);
        if (resolvedTheme) {
          return makeResponse(createUICommand("update_theme", { themeId: resolvedTheme }));
        }
        return makeError(`未知主题: ${theme}。可用: ${getThemeListString()}`);
      }

      if (mode) {
        return makeResponse(createUICommand("update_theme", { mode }));
      }

      return makeError("请指定 theme 或 mode 参数");
    }

    case "show_notification": {
      const { message, type = "info", duration = 3000 } = args as {
        message: string;
        type?: string;
        duration?: number;
      };
      return makeResponse(createUICommand("show_notification", { message, type, duration }));
    }

    case "show_confirm": {
      const { title, message, confirmText, cancelText } = args as {
        title: string;
        message: string;
        confirmText?: string;
        cancelText?: string;
      };
      return makeResponse(createUICommand("show_confirm", { title, message, confirmText, cancelText }));
    }

    case "open_panel": {
      const { panel, tab } = args as { panel: string; tab?: string };
      return makeResponse(createUICommand("open_panel", { panel, tab }));
    }

    case "close_panel": {
      const { panel } = args as { panel: string };
      return makeResponse(createUICommand("close_panel", { panel }));
    }

    case "copy_to_clipboard": {
      const { text, showNotification = true } = args as { text: string; showNotification?: boolean };
      return makeResponse(createUICommand("copy_to_clipboard", { text, showNotification }));
    }

    case "open_url": {
      const { url, newTab = true } = args as { url: string; newTab?: boolean };
      return makeResponse(createUICommand("open_url", { url, newTab }));
    }

    case "set_input": {
      const { text, append = false } = args as { text: string; append?: boolean };
      return makeResponse(createUICommand("set_input", { text, append }));
    }

    case "scroll_to_message": {
      const { messageId, position } = args as { messageId?: string; position?: "top" | "bottom" };
      return makeResponse(createUICommand("scroll_to_message", { messageId, position }));
    }

    case "test_tool_call": {
      const { duration = 3, shouldFail = false, message } = args as {
        duration?: number;
        shouldFail?: boolean;
        message?: string;
      };

      // 模拟延迟
      await new Promise((resolve) => setTimeout(resolve, duration * 1000));

      if (shouldFail) {
        // 抛出错误让 MCP 协议返回错误状态
        throw new Error(message || `测试工具调用失败（模拟）`);
      }
      return {
        content: [{ type: "text" as const, text: message || `测试工具调用成功！用时 ${duration} 秒` }],
      };
    }

    case "render_cards": {
      const { cards, columns = 2 } = args as {
        cards: Array<{
          title?: string;
          description?: string;
          image?: string;
          link?: string;
          linkText?: string;
        }>;
        columns?: number;
      };

      if (!cards || cards.length === 0) {
        return makeError("请提供至少一张卡片");
      }

      // 生成 <card> 标签
      const cardTags = cards
        .map((card) => {
          const attrs: string[] = [];
          if (card.title) attrs.push(`title="${escapeAttr(card.title)}"`);
          if (card.description) attrs.push(`description="${escapeAttr(card.description)}"`);
          if (card.image) attrs.push(`image="${escapeAttr(card.image)}"`);
          if (card.link) attrs.push(`link="${escapeAttr(card.link)}"`);
          if (card.linkText) attrs.push(`linkText="${escapeAttr(card.linkText)}"`);
          return `<card ${attrs.join(" ")} />`;
        })
        .join("\n");

      // 如果有多张卡片，用 <cards> 包裹
      const output =
        cards.length > 1
          ? `<cards columns="${columns}">\n${cardTags}\n</cards>`
          : cardTags;

      return {
        content: [{ type: "text" as const, text: output }],
      };
    }

    case "generate_waifu": {
      const { category = "waifu", count = 1, asCard = true } = args as {
        category?: string;
        count?: number;
        asCard?: boolean;
      };

      const validCategories = ["waifu", "neko", "shinobu", "megumin", "awoo", "smile", "happy", "wink", "blush", "smug", "dance"];
      const cat = validCategories.includes(category) ? category : "waifu";
      const num = Math.min(Math.max(count, 1), 5);

      // 使用 waifu.pics API
      const urls: string[] = [];
      for (let i = 0; i < num; i++) {
        try {
          const response = await fetch(`https://api.waifu.pics/sfw/${cat}`);
          if (response.ok) {
            const data = await response.json() as { url: string };
            urls.push(data.url);
          }
        } catch {
          // 忽略单个请求错误
        }
      }

      if (urls.length === 0) {
        return makeError("获取图片失败，请稍后重试");
      }

      // 返回格式
      if (asCard) {
        const categoryNames: Record<string, string> = {
          waifu: "Waifu",
          neko: "猫娘",
          shinobu: "忍野忍",
          megumin: "惠惠",
          awoo: "Awoo",
          smile: "微笑",
          happy: "开心",
          wink: "眨眼",
          blush: "害羞",
          smug: "得意",
          dance: "跳舞",
        };

        const cards = urls.map((url, i) => {
          const attrs = [
            `title="${escapeAttr(categoryNames[cat] || cat)}${num > 1 ? ` #${i + 1}` : ""}"`,
            `image="${escapeAttr(url)}"`,
            `link="${escapeAttr(url)}"`,
            `linkText="查看原图"`,
          ];
          return `<card ${attrs.join(" ")} />`;
        });

        const output = cards.length > 1
          ? `<cards columns="2">\n${cards.join("\n")}\n</cards>`
          : cards[0];

        return {
          content: [{ type: "text" as const, text: output }],
        };
      }

      // 纯文本返回
      return {
        content: [{
          type: "text" as const,
          text: urls.length === 1
            ? `图片URL: ${urls[0]}`
            : `生成了 ${urls.length} 张图片:\n${urls.map((u, i) => `${i + 1}. ${u}`).join("\n")}`,
        }],
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// ============================================================================
// 启动服务器
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("LeoChat MCP Server running on stdio");
}

main().catch(console.error);
