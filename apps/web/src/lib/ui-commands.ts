/**
 * UI Command DSL System
 *
 * 可扩展的 UI 命令系统，允许 MCP 工具通过 DSL 控制前端 UI
 *
 * ## DSL 格式
 *
 * ```json
 * {
 *   "__ui_command__": true,
 *   "command": "命令名称",
 *   "payload": { ... }
 * }
 * ```
 *
 * ## 添加新命令
 *
 * 1. 在 CommandPayloadMap 中添加命令类型和 payload 类型
 * 2. 实现命令处理函数
 * 3. 在 commandHandlers 中注册处理函数
 */

import { useThemeStore } from "../stores/theme";

// ============================================================================
// 类型定义
// ============================================================================

/**
 * 命令 payload 类型映射
 * 添加新命令时在这里定义 payload 类型
 */
export interface CommandPayloadMap {
  // 主题控制
  update_theme: {
    themeId?: string;
    mode?: "light" | "dark";
  };

  // 通知
  show_notification: {
    message: string;
    type?: "info" | "success" | "warning" | "error";
    duration?: number;
  };

  // 确认对话框
  show_confirm: {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    onConfirmCommand?: UICommand;  // 确认后执行的命令
  };

  // 打开面板
  open_panel: {
    panel: "mcp" | "settings" | "history";
    tab?: string;
  };

  // 关闭面板
  close_panel: {
    panel: "mcp" | "settings" | "history" | "all";
  };

  // 复制到剪贴板
  copy_to_clipboard: {
    text: string;
    showNotification?: boolean;
  };

  // 打开外部链接
  open_url: {
    url: string;
    newTab?: boolean;
  };

  // 滚动到消息
  scroll_to_message: {
    messageId?: string;
    position?: "top" | "bottom";
  };

  // 设置输入框内容
  set_input: {
    text: string;
    append?: boolean;
  };
}

/**
 * 所有支持的命令名称
 */
export type CommandName = keyof CommandPayloadMap;

/**
 * UI 命令接口
 */
export interface UICommand<T extends CommandName = CommandName> {
  __ui_command__: true;
  command: T;
  payload: CommandPayloadMap[T];
}

/**
 * 命令执行结果
 */
export interface CommandResult {
  executed: boolean;
  message: string;
  data?: unknown;
}

/**
 * 命令处理函数类型
 */
type CommandHandler<T extends CommandName> = (
  payload: CommandPayloadMap[T]
) => CommandResult | Promise<CommandResult>;

// ============================================================================
// 命令处理器注册表
// ============================================================================

/**
 * 命令处理器映射
 */
const commandHandlers: {
  [K in CommandName]?: CommandHandler<K>;
} = {};

/**
 * 注册命令处理器
 */
export function registerCommandHandler<T extends CommandName>(
  command: T,
  handler: CommandHandler<T>
): void {
  commandHandlers[command] = handler as CommandHandler<CommandName>;
}

/**
 * 获取已注册的命令列表
 */
export function getRegisteredCommands(): CommandName[] {
  return Object.keys(commandHandlers) as CommandName[];
}

// ============================================================================
// 内置命令处理器
// ============================================================================

/**
 * update_theme - 更新主题
 */
registerCommandHandler("update_theme", (payload) => {
  const { mode, themeId } = payload;
  const themeStore = useThemeStore.getState();

  if (themeId) {
    themeStore.setTheme(themeId);
    const newTheme = useThemeStore.getState().currentTheme;
    return {
      executed: true,
      message: `Theme switched to: ${newTheme}`,
    };
  }

  if (mode) {
    themeStore.setThemeByMode(mode);
    const newTheme = useThemeStore.getState().currentTheme;
    return {
      executed: true,
      message: `Theme switched to: ${newTheme}`,
    };
  }

  return {
    executed: false,
    message: "No theme changes specified",
  };
});

/**
 * show_notification - 显示通知
 */
registerCommandHandler("show_notification", (payload) => {
  const { message, type = "info", duration = 3000 } = payload;

  const notification = document.createElement("div");
  notification.className = `
    fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg
    animate-in slide-in-from-right-full duration-300
    ${type === "success" ? "bg-green-500 text-white" : ""}
    ${type === "warning" ? "bg-yellow-500 text-black" : ""}
    ${type === "error" ? "bg-red-500 text-white" : ""}
    ${type === "info" ? "bg-primary text-primary-foreground" : ""}
  `;
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    notification.classList.add("animate-out", "slide-out-to-right-full");
    setTimeout(() => notification.remove(), 300);
  }, duration);

  return {
    executed: true,
    message: `Notification shown: ${message}`,
  };
});

/**
 * copy_to_clipboard - 复制到剪贴板
 */
registerCommandHandler("copy_to_clipboard", async (payload) => {
  const { text, showNotification = true } = payload;

  try {
    await navigator.clipboard.writeText(text);

    if (showNotification) {
      executeUICommand({
        __ui_command__: true,
        command: "show_notification",
        payload: {
          message: "已复制到剪贴板",
          type: "success",
          duration: 2000,
        },
      });
    }

    return {
      executed: true,
      message: `Copied to clipboard: ${text.substring(0, 50)}${text.length > 50 ? "..." : ""}`,
    };
  } catch {
    return {
      executed: false,
      message: "Failed to copy to clipboard",
    };
  }
});

/**
 * open_url - 打开外部链接
 */
registerCommandHandler("open_url", (payload) => {
  const { url, newTab = true } = payload;

  if (newTab) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    window.location.href = url;
  }

  return {
    executed: true,
    message: `Opened URL: ${url}`,
  };
});

/**
 * scroll_to_message - 滚动到消息
 */
registerCommandHandler("scroll_to_message", (payload) => {
  const { messageId, position = "bottom" } = payload;

  if (messageId) {
    const element = document.querySelector(`[data-message-id="${messageId}"]`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      return {
        executed: true,
        message: `Scrolled to message: ${messageId}`,
      };
    }
    return {
      executed: false,
      message: `Message not found: ${messageId}`,
    };
  }

  // 滚动到顶部或底部
  const container = document.querySelector("[data-chat-container]");
  if (container) {
    if (position === "bottom") {
      container.scrollTop = container.scrollHeight;
    } else {
      container.scrollTop = 0;
    }
    return {
      executed: true,
      message: `Scrolled to ${position}`,
    };
  }

  return {
    executed: false,
    message: "Chat container not found",
  };
});

/**
 * set_input - 设置输入框内容
 */
registerCommandHandler("set_input", (payload) => {
  const { text, append = false } = payload;

  // 触发自定义事件，由 ChatArea 监听处理
  const event = new CustomEvent("ui-command:set-input", {
    detail: { text, append },
  });
  window.dispatchEvent(event);

  return {
    executed: true,
    message: `Input ${append ? "appended" : "set"}: ${text.substring(0, 30)}${text.length > 30 ? "..." : ""}`,
  };
});

/**
 * open_panel - 打开面板
 * 需要由具体组件监听事件来实现
 */
registerCommandHandler("open_panel", (payload) => {
  const { panel, tab } = payload;

  const event = new CustomEvent("ui-command:open-panel", {
    detail: { panel, tab },
  });
  window.dispatchEvent(event);

  return {
    executed: true,
    message: `Panel opened: ${panel}${tab ? ` (tab: ${tab})` : ""}`,
  };
});

/**
 * close_panel - 关闭面板
 */
registerCommandHandler("close_panel", (payload) => {
  const { panel } = payload;

  const event = new CustomEvent("ui-command:close-panel", {
    detail: { panel },
  });
  window.dispatchEvent(event);

  return {
    executed: true,
    message: `Panel closed: ${panel}`,
  };
});

/**
 * show_confirm - 显示确认对话框
 */
registerCommandHandler("show_confirm", (payload) => {
  const { title, message, confirmText = "确认", cancelText = "取消", onConfirmCommand } = payload;

  const event = new CustomEvent("ui-command:show-confirm", {
    detail: { title, message, confirmText, cancelText, onConfirmCommand },
  });
  window.dispatchEvent(event);

  return {
    executed: true,
    message: `Confirm dialog shown: ${title}`,
  };
});

// ============================================================================
// 命令解析与执行
// ============================================================================

/**
 * 检查是否为 UI 命令
 */
export function isUICommand(value: unknown): value is UICommand {
  return (
    typeof value === "object" &&
    value !== null &&
    "__ui_command__" in value &&
    (value as UICommand).__ui_command__ === true
  );
}

/**
 * 从字符串解析 UI 命令
 */
export function parseUICommand(text: string): UICommand | null {
  try {
    const parsed = JSON.parse(text);
    if (isUICommand(parsed)) {
      return parsed;
    }
  } catch {
    // Not JSON or not a UI command
  }
  return null;
}

/**
 * 执行 UI 命令
 */
export function executeUICommand(command: UICommand): CommandResult | Promise<CommandResult> {
  const handler = commandHandlers[command.command];

  if (!handler) {
    return {
      executed: false,
      message: `Unknown UI command: ${command.command}`,
    };
  }

  return handler(command.payload as never);
}

/**
 * 从 MCP 工具结果中提取文本内容
 */
function extractTextFromMCPResult(result: unknown): string | null {
  if (typeof result === "object" && result !== null && "content" in result) {
    const content = (result as { content: unknown[] }).content;
    if (Array.isArray(content)) {
      for (const item of content) {
        if (typeof item === "object" && item !== null && "type" in item && "text" in item) {
          const textItem = item as { type: string; text: string };
          if (textItem.type === "text") {
            return textItem.text;
          }
        }
      }
    }
  }
  return null;
}

/**
 * 从工具结果中提取并执行 UI 命令
 * 返回处理后的结果（移除 UI 命令 JSON）
 */
export async function processToolResultForUICommands(
  result: unknown
): Promise<{ processedResult: unknown; uiCommandExecuted: boolean }> {
  // 尝试从 MCP 结果格式中提取文本
  const mcpText = extractTextFromMCPResult(result);
  if (mcpText) {
    const command = parseUICommand(mcpText);
    if (command) {
      const commandResult = await executeUICommand(command);
      return {
        processedResult: commandResult.message,
        uiCommandExecuted: commandResult.executed,
      };
    }
  }

  // 如果结果是字符串，尝试多种解析方式
  if (typeof result === "string") {
    // 先尝试直接解析为 UICommand
    const directCommand = parseUICommand(result);
    if (directCommand) {
      const commandResult = await executeUICommand(directCommand);
      return {
        processedResult: commandResult.message,
        uiCommandExecuted: commandResult.executed,
      };
    }

    // 再尝试：字符串可能是 JSON 序列化的 MCP 结果对象（含 content[]）
    // 解析后用 extractTextFromMCPResult 提取内部文本再解析 UICommand
    try {
      const parsedObj = JSON.parse(result);
      const innerText = extractTextFromMCPResult(parsedObj);
      if (innerText) {
        const command = parseUICommand(innerText);
        if (command) {
          const commandResult = await executeUICommand(command);
          return {
            processedResult: commandResult.message,
            uiCommandExecuted: commandResult.executed,
          };
        }
      }
      if (isUICommand(parsedObj)) {
        const commandResult = await executeUICommand(parsedObj);
        return {
          processedResult: commandResult.message,
          uiCommandExecuted: commandResult.executed,
        };
      }
    } catch {
      // 不是合法 JSON，忽略
    }
  }

  // 如果结果是对象，检查是否直接是 UI 命令
  if (isUICommand(result)) {
    const commandResult = await executeUICommand(result);
    return {
      processedResult: commandResult.message,
      uiCommandExecuted: commandResult.executed,
    };
  }

  // 不是 UI 命令，原样返回
  return {
    processedResult: result,
    uiCommandExecuted: false,
  };
}

// ============================================================================
// 便捷函数 - 用于前端直接调用
// ============================================================================

/**
 * 显示通知
 */
export function showNotification(
  message: string,
  type: "info" | "success" | "warning" | "error" = "info",
  duration = 3000
): void {
  executeUICommand({
    __ui_command__: true,
    command: "show_notification",
    payload: { message, type, duration },
  });
}

/**
 * 复制文本到剪贴板
 */
export function copyToClipboard(text: string, showToast = true): Promise<CommandResult> {
  return executeUICommand({
    __ui_command__: true,
    command: "copy_to_clipboard",
    payload: { text, showNotification: showToast },
  }) as Promise<CommandResult>;
}

/**
 * 打开面板
 */
export function openPanel(panel: "mcp" | "settings" | "history", tab?: string): void {
  executeUICommand({
    __ui_command__: true,
    command: "open_panel",
    payload: { panel, tab },
  });
}

/**
 * 关闭面板
 */
export function closePanel(panel: "mcp" | "settings" | "history" | "all"): void {
  executeUICommand({
    __ui_command__: true,
    command: "close_panel",
    payload: { panel },
  });
}
