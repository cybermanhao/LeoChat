/**
 * 声明式 UI 提示（设计文档 §9）。
 * 工具只返回数据；UI 提示由服务端从数据生成，随 ToolOutput.ui 一起返回，不发给模型。
 * 经 MCP 传输时放在工具结果的 `_meta["leochat/ui"]` 里（`_meta.ui` 已被 MCP Apps 规范占用）。
 */

export const UI_META_KEY = "leochat/ui";

export type UiHint = CardsHint | CustomHint | McpAppHint;

export interface CardsHint {
  type: "cards";
  label?: string;
  cards: Card[];
}

export interface Card {
  id?: string;
  title: string;
  subtitle?: string;
  avatar?: { text: string; hue: number } | { imageUrl: string };
  /** 语义色调，由宿主主题映射成具体颜色 */
  badges?: Array<{ text: string; tone?: "success" | "warning" | "neutral" }>;
  tags?: Array<{ text: string; code?: string }>;
  lines?: string[];
  note?: string;
  href?: string;
  actions?: CardAction[];
}

export type CardAction =
  /** 把一句话填进对话并发送 */
  | { kind: "ask"; label: string; text: string }
  /** 直接调用 visibility 包含 'app' 的工具 */
  | { kind: "tool"; label: string; tool: string; input: unknown }
  /** 回答一个待审批的调用（approvalId 是不透明 ID） */
  | { kind: "approve"; label: string; approvalId: string; outcome: "allowed-once" | "rejected" }
  | { kind: "link"; label: string; url: string };

/** 应用私有的富组件，例如 'expo.route_map'。宿主不认识就忽略，显示文字降级 */
export interface CustomHint {
  type: "custom";
  kind: string;
  data: unknown;
}

/** 预留给第二期 MCP Apps 宿主：指向 ui:// 资源 */
export interface McpAppHint {
  type: "mcp_app";
  resourceUri: string;
}
