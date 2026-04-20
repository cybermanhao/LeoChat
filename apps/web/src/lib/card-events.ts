/**
 * LeoChat Card Action Browser Events
 *
 * 定义 agent-event 类型卡片动作的浏览器事件契约。
 * 事件名称和 detail 形状是稳定的公共契约。
 */

// 事件名称（稳定契约）
export const LEO_CARD_ACTION_EVENT = "leochat:card-action";

// action 按钮未知命令的 fallback 事件
export const LEO_ACTION_EVENT = "leochat:action";

// 事件 detail 形状
export interface LeoCardActionEventDetail {
  actionId: string;
  cardId?: string;
  name: string;
  payload?: Record<string, unknown>;
}
