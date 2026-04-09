/**
 * LeoChat Card Action Runtime
 *
 * 负责分派 LeoCardAction：
 * - ui-command: 委托给 executeUICommand
 * - agent-event: 派发浏览器 CustomEvent
 * - link: 在新标签页中打开
 *
 * 如果 action 包含 confirm，先弹出确认对话框。
 */

import type { LeoCardAction } from "@ai-chatbox/shared";
import { executeUICommand, type CommandName } from "./ui-commands";
import { LEO_CARD_ACTION_EVENT, type LeoCardActionEventDetail } from "./card-events";

/**
 * 执行卡片动作
 */
export async function executeLeoCardAction(action: LeoCardAction): Promise<void> {
  // 确认对话框（如果需要）
  if (action.confirm) {
    const message = action.confirm.message || action.confirm.title;
    const confirmed = window.confirm(message);
    if (!confirmed) {
      return;
    }
  }

  const target = action.action;

  switch (target.type) {
    case "ui-command": {
      // 卡片动作的 command 字符串映射到 UI 命令系统
      // 未知命令会被 executeUICommand 安全处理
      const cmd = {
        __ui_command__: true as const,
        command: target.command as CommandName,
        payload: target.payload ?? {},
      };
      await executeUICommand(cmd as Parameters<typeof executeUICommand>[0]);
      break;
    }

    case "agent-event": {
      const detail: LeoCardActionEventDetail = {
        actionId: action.id,
        name: target.name,
        payload: target.payload,
      };
      window.dispatchEvent(
        new CustomEvent(LEO_CARD_ACTION_EVENT, { detail })
      );
      break;
    }

    case "link": {
      window.open(target.url, "_blank", "noopener,noreferrer");
      break;
    }

    default: {
      console.warn("[CardAction] 未知的 action type:", (target as { type: string }).type);
      break;
    }
  }
}
