/**
 * 内部消息模型：content-block（设计文档 §1）。
 * 一条消息的 content 是有序的、带类型的块数组；provider adapter 负责翻译成各家的线上格式。
 */
import type { UiHint } from "./ui/types";

export type Role = "system" | "user" | "assistant" | "tool";

export interface Message {
  /** 引擎生成的稳定 ID，用于视图、重放和压缩时定位 */
  id: string;
  role: Role;
  content: Block[];
}

export type Block =
  | TextBlock
  | ThinkingBlock
  | ToolUseBlock
  | ToolResultBlock
  | ServerToolUseBlock
  | ServerToolResultBlock
  | ImageBlock
  | FileBlock;

export type BlockType = Block["type"];

export interface BlockBase {
  /**
   * provider 私有的往返数据（thinking 的 signature、搜索结果的 encrypted_content 等）。
   * core 不解释它的内容，只保证原样回传给同一个 provider。
   */
  providerData?: Record<string, unknown>;
}

export interface Citation {
  url: string;
  title?: string;
  citedText?: string;
  providerData?: Record<string, unknown>;
}

export interface SearchResult {
  url: string;
  title: string;
  snippet?: string;
  siteName?: string;
  date?: string;
  providerData?: Record<string, unknown>;
}

export interface TextBlock extends BlockBase {
  type: "text";
  text: string;
  citations?: Citation[];
}

/** 推理内容。DeepSeek 的 reasoning_content、Anthropic 的 thinking 都映射到这里 */
export interface ThinkingBlock extends BlockBase {
  type: "thinking";
  text: string;
}

export interface ToolUseBlock extends BlockBase {
  type: "tool_use";
  id: string;
  name: string;
  /**
   * 准确值（C2）：模型产出的原始 JSON 字符串。
   * 回传给 provider 时逐字节原样发送，以保证前缀缓存命中。
   */
  arguments: string;
  /** 由 arguments 解析出的派生值；解析失败时为 undefined */
  input?: unknown;
}

export interface ToolResultBlock extends BlockBase {
  type: "tool_result";
  toolUseId: string;
  /** 给模型看的内容 */
  content: Array<TextBlock | ImageBlock>;
  isError?: boolean;
  /** 不发给模型：结构化数据。provider adapter 必须去掉 */
  data?: unknown;
  /** 不发给模型：UI 提示。provider adapter 必须去掉 */
  ui?: UiHint;
}

/** 服务端工具调用（例如 DeepSeek 的 deepseek_web_search），由 provider 执行 */
export interface ServerToolUseBlock extends BlockBase {
  type: "server_tool_use";
  id: string;
  name: string;
  input: unknown;
}

export interface ServerToolResultBlock extends BlockBase {
  type: "server_tool_result";
  toolUseId: string;
  name: string;
  results: SearchResult[];
}

export interface ImageBlock extends BlockBase {
  type: "image";
  source: { kind: "url" | "base64" | "file_id"; value: string; mediaType?: string };
}

export interface FileBlock extends BlockBase {
  type: "file";
  fileId: string;
  filename?: string;
}

/** 解析工具参数；解析失败或结果不是对象时返回 undefined（原始字符串仍保留在 arguments 里） */
export function parseToolArguments(raw: string): unknown {
  if (raw.trim() === "") return {};
  try {
    const value: unknown = JSON.parse(raw);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
  } catch {
    return undefined;
  }
}
