import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { themePresets } from "@ai-chatbox/shared";
import { exec } from "child_process";

/**
 * LeoChat MCP Server
 *
 * 提供 bash、测试工具和示例工具。界面操作工具（主题、通知、面板、剪贴板……）
 * 已移到 LeoChat server 进程内（packages/server/src/ui-tools.ts），不再经过 MCP。
 * leochat_tool_guide 提示词仍然描述那些界面工具的用法（工具名不变）。
 */

// ============================================================================
// 主题配置 - 从 @ai-chatbox/shared 导入，自动同步
// ============================================================================

// 获取主题描述列表（用于 prompt）
function getThemeDescriptions(): string {
  return themePresets
    .map((t) => `  - ${t.id}: ${t.name}${t.isDark ? " (深色)" : " (浅色)"}`)
    .join("\n");
}

// ============================================================================
// Bash 工具
// ============================================================================

const BASH_BANNED_COMMANDS = [
  "rm", "rmdir", "del", "rd", "format", "mkfs",
  "shutdown", "reboot", "halt", "poweroff",
  "dd", "fdisk", "parted",
  "chmod", "chown", "sudo", "su",
  "passwd", "useradd", "userdel",
];

const BASH_MAX_OUTPUT = 30000;

function truncateBashOutput(text: string): { content: string; totalLines: number } {
  const lines = text.split("\n");
  const totalLines = lines.length;
  if (text.length <= BASH_MAX_OUTPUT) return { content: text, totalLines };
  const half = Math.floor(BASH_MAX_OUTPUT / 2);
  const head = text.slice(0, half);
  const tail = text.slice(-half);
  const skippedLines = text.slice(half, -half).split("\n").length;
  return {
    content: `${head}\n\n... [${skippedLines} lines truncated] ...\n\n${tail}`,
    totalLines,
  };
}

function runBash(command: string, timeoutMs: number): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    // cmd.exe 在中文 Windows 上默认活动代码页是 GBK(CP936)，本地化的系统消息
    // （比如报错文案）会按 GBK 输出字节；但 Node 的 exec 默认按 UTF-8 解码
    // stdout/stderr，两边编码对不上就是乱码。先切到 UTF-8 代码页(65001)再跑
    // 真正的命令，让 cmd.exe 自己输出 UTF-8 字节，跟 Node 的默认解码对上。
    const effectiveCommand =
      process.platform === "win32" ? `chcp 65001>nul & ${command}` : command;
    const child = exec(effectiveCommand, { timeout: timeoutMs, shell: process.platform === "win32" ? "cmd.exe" : "/bin/bash" }, (err, stdout, stderr) => {
      resolve({
        stdout: stdout || "",
        stderr: stderr || (err && !stdout ? err.message : ""),
        code: err?.code ?? 0,
      });
    });
    // 防御性收尾：如果命令本身意外地进入了等待交互输入的状态（比如生成了
    // Windows cmd.exe 会当成"设置新日期"的 Unix 风格 date 命令，内置 date
    // 遇到无法识别的参数会弹出"输入新日期:"提示卡住），没有东西连着它的
    // stdin 就永远等不到输入——立刻关掉 stdin，让这类阻塞在读取输入的命令
    // 马上拿到 EOF 报错退出，而不是干等到 timeoutMs 才被强杀。
    child.stdin?.end();
    // Ensure child is killed on timeout
    child.on("close", () => {});
  });
}

// ============================================================================
// MCP 服务器配置
// ============================================================================
//
// 注意：构造 + 全部工具/prompt 注册都包在 createServer() 工厂函数里，而不是
// 模块级单例——serveStdio() 需要一个工厂，为每次连接的开场交换（legacy/modern
// 握手协商）产出一个全新实例，避免连接之间状态串味。

function createServer(): McpServer {
  const server = new McpServer({
    name: "leochat-mcp",
    version: "0.1.0",
  });

// ============================================================================
// Prompts
// ============================================================================

server.registerPrompt(
  "leochat_tool_guide",
  {
    description: "LeoChat UI 工具使用指南 - 描述主题、通知、面板等 UI 控制工具的用法模板",
  },
  () => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
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

## 其他能力
- copy_to_clipboard(text) - 复制到剪贴板
- open_url(url, newTab) - 打开链接
- set_input(text, append) - 设置输入框内容
- resize_window(preset) - 调整窗口大小 (small/medium/large/fullscreen)

重要规则：
1. 当用户请求 UI 操作时，必须调用对应工具，不要只是口头回复
2. 操作成功后会自动显示视觉反馈
3. 可以组合多个工具完成复杂操作`,
        },
      },
    ],
  })
);

// ============================================================================
// 工具处理辅助函数
// ============================================================================

const makeError = (message: string) => ({
  content: [{ type: "text" as const, text: message }],
});

// ============================================================================
// 工具定义
// ============================================================================
// 注意：tools/list 由 registerTool 自动生成，不再需要手写 ListToolsRequestSchema
// handler。themeList 在每次调用时读取，保持和旧版一致的"实时主题列表"行为。

/**
 * @deprecated 此工具已废弃，将在未来版本中移除。
 */
server.registerTool(
  "test_tool_call",
  {
    description: "【已废弃】测试工具调用 UI 渲染。用于测试工具调用的读条动画效果。当用户说'测试tool调用'时使用此工具。",
    inputSchema: z.object({
      duration: z.number().describe("模拟执行时间（秒），默认 3").optional(),
      shouldFail: z.boolean().describe("是否模拟失败，默认 false").optional(),
      message: z.string().describe("自定义返回消息").optional(),
    }),
  },
  async ({ duration = 3, shouldFail = false, message }) => {
    // 模拟延迟
    await new Promise((resolve) => setTimeout(resolve, duration * 1000));

    if (shouldFail) {
      // 抛出错误让 MCP 协议返回错误状态
      throw new Error(message || `测试工具调用失败（模拟）`);
    }

    // 返回一个示例 leo-card 结构化卡片 payload，用于验证卡片渲染管线
    const cardPayload = {
      type: "leochat-card",
      card: {
        id: `test_card_${Date.now()}`,
        kind: "summary",
        title: "工具调用测试完成",
        subtitle: `用时 ${duration} 秒`,
        tone: "success",
        body: [
          {
            type: "fields",
            fields: [
              { label: "状态", value: "成功" },
              { label: "耗时", value: `${duration}s` },
              { label: "消息", value: message || "默认测试" },
            ],
          },
          {
            type: "text",
            text: "这是一张由 test_tool_call 生成的示例卡片，用于验证 LeoChat 卡片系统。",
          },
        ],
        actions: [
          {
            id: "action_notify",
            label: "发送通知",
            kind: "primary",
            action: {
              type: "ui-command",
              command: "show_notification",
              payload: { message: "卡片动作测试成功！", type: "success" },
            },
          },
          {
            id: "action_link",
            label: "打开文档",
            kind: "secondary",
            action: {
              type: "link",
              url: "https://github.com",
            },
          },
        ],
      },
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(cardPayload) }],
    };
  }
);

// render_cards — PERMANENTLY REMOVED. DO NOT RESTORE.
//
// Cards are now structured message content (see card-spec.md), not UI
// commands.  The command-based render_cards approach is superseded by
// first-class card content items in the message schema.  Any future
// card rendering must go through the structured content path, not
// through this MCP tool.

const BASH_SHELL_DESCRIPTION =
  process.platform === "win32"
    ? "Windows cmd.exe（不是 POSIX bash/sh！用 Windows 命令语法，例如日期用 `date /t`，不要用 `date \"+%Y-%m-%d\"` 这种 Unix 写法——cmd.exe 的内置 date 命令遇到无法识别的参数会进入交互式'输入新日期'提示并一直阻塞到超时）"
    : "POSIX shell (/bin/bash)";

server.registerTool(
  "bash",
  {
    description: `在 ${BASH_SHELL_DESCRIPTION} 中执行命令并返回输出。禁止命令: ${BASH_BANNED_COMMANDS.join(", ")}`,
    inputSchema: z.object({
      command: z.string().describe("要执行的 shell 命令"),
      timeout: z.number().describe("超时时间(ms)，默认 30000，最大 600000").optional(),
    }),
  },
  async ({ command, timeout: timeoutMs = 30000 }) => {
    const baseCmd = command.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
    if (BASH_BANNED_COMMANDS.includes(baseCmd)) {
      return makeError(`命令 '${baseCmd}' 因安全原因被禁止`);
    }

    const clampedTimeout = Math.min(Math.max(timeoutMs, 1000), 600000);
    const result = await runBash(command, clampedTimeout);

    const { content: stdoutContent, totalLines: stdoutLines } = truncateBashOutput(result.stdout.trim());
    const { content: stderrContent } = truncateBashOutput(result.stderr.trim());

    const parts: string[] = [];
    if (stdoutContent) parts.push(stdoutContent);
    if (stderrContent) parts.push(`[stderr]\n${stderrContent}`);
    if (result.code !== 0 && result.code !== null) parts.push(`[exit code: ${result.code}]`);
    if (parts.length === 0) parts.push("(no output)");

    const summary = stdoutLines > 50 ? ` (共 ${stdoutLines} 行)` : "";
    return {
      content: [{ type: "text" as const, text: parts.join("\n") + summary }],
    };
  }
);

server.registerTool(
  "generate_waifu",
  {
    description: "生成随机二次元图片（waifu/头像等），以 LeoCard 卡片形式返回。",
    inputSchema: z.object({
      category: z
        .enum(["waifu", "neko", "shinobu", "megumin", "awoo", "smile", "happy", "wink", "blush", "smug", "dance"])
        .describe("图片类型。waifu=随机美少女, neko=猫娘, 其他为特定角色/表情")
        .optional(),
      count: z.number().describe("生成数量(1-5)，默认1").optional(),
    }),
  },
  async ({ category = "waifu", count = 1 }) => {
    const num = Math.min(Math.max(count, 1), 5);

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

    // 并发请求 waifu.pics API
    const results = await Promise.allSettled(
      Array.from({ length: num }, () =>
        fetch(`https://api.waifu.pics/sfw/${category}`)
          .then(r => r.ok ? r.json() as Promise<{ url: string }> : null)
      )
    );
    const urls = results
      .filter((r): r is PromiseFulfilledResult<{ url: string }> => r.status === "fulfilled" && r.value !== null)
      .map(r => r.value.url);

    if (urls.length === 0) {
      return makeError("获取图片失败，请稍后重试");
    }

    // 构建 LeoCard
    const card = {
      id: `waifu_${Date.now()}`,
      kind: "media",
      title: `${categoryNames[category] || category}`,
      subtitle: urls.length > 1 ? `${urls.length} 张图片` : undefined,
      tone: "default",
      body: urls.length === 1
        ? [{ type: "image", image: { url: urls[0], alt: categoryNames[category] || category } }]
        : [{ type: "images", images: urls.map((url, i) => ({ url, alt: `${categoryNames[category] || category} #${i + 1}` })) }],
      actions: urls.map((url, i) => ({
        id: `view_${i}`,
        label: urls.length === 1 ? "查看原图" : `原图 #${i + 1}`,
        kind: "secondary",
        action: { type: "link", url },
      })),
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(card) }],
    };
  }
  );

  return server;
}

// ============================================================================
// 启动服务器
// ============================================================================
//
// serveStdio 内部默认用 StdioServerTransport 接管当前进程的 stdin/stdout，
// 并负责开场交换的时代协商（legacy 'serve' 默认值：老客户端按 2025 握手正常
// 服务，新客户端可协商 2026-07-28 modern era）。同步启动，不需要 await。

serveStdio(createServer);
console.error("LeoChat MCP Server running on stdio");
