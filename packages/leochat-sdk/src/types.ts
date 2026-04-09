import type { LLMConfig, LLMProvider } from "@ai-chatbox/shared";

export type { LLMConfig, LLMProvider };

/**
 * 上下文槽 - Context Assembly 层的基本单元
 *
 * 当前 v1 只使用 key + content。
 * priority / maxTokens 为未来记忆系统预留，v1 不实现裁剪逻辑。
 */
export interface ContextSlot {
  /** 语义 key，注入为 <context name="${key}">...</context> */
  key: string;
  content: string;
  /** 优先级（数字越大越重要）。v1 预留，不实现裁剪。 */
  priority?: number;
  /** 最大 token 预算。v1 预留，不实现。 */
  maxTokens?: number;
}

/**
 * 可回放的对话历史消息。
 * 只含 user / assistant / tool 消息，不含 system message。
 * 可安全传入下次 ainvoke({ history }) 实现多轮对话。
 */
export interface ReplayableMessage {
  role: "user" | "assistant" | "tool";
  content: string;
  tool_calls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
    status?: string;
    result?: unknown;
  }>;
  tool_call_id?: string;
  id?: string;
  timestamp?: number;
}

/** 单次工具调用记录 */
export interface ToolCallRecord {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  result?: unknown;
  error?: string;
  duration?: number;
}

/** ainvoke 返回值 */
export interface AgentResult {
  /** 最终文本输出 */
  text: string;
  /** 所有工具调用记录（含结果） */
  toolCalls: ToolCallRecord[];
  /** Token 消费统计 */
  usage: { input: number; output: number };
  /**
   * 可回放的对话历史。
   * 不含 system message 和 skill 注入内容（这些是宿主配置，不进公共历史）。
   * 可直接传入下次 ainvoke({ history }) 实现多轮对话。
   */
  history: ReplayableMessage[];
}

/** MCP server 配置（SDK 格式，兼容 Claude Desktop） */
export interface SdkMCPServerConfig {
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  transport?: "stdio" | "streamable-http";
}

/** SDK JSON 配置文件格式 */
export interface SdkConfig {
  mcpServers?: Record<string, SdkMCPServerConfig>;
  defaultLLM?: LLMConfig;
  systemPrompt?: string;
}

/** Skill 元数据 */
export interface SkillMeta {
  name: string;
  description: string;
  version?: string;
  model?: string;
  allowedTools?: string[];
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  /** Skill 所在目录的绝对路径 */
  dir: string;
}

/** ainvoke 的对象形式入参 */
export interface AinvokeOptions {
  messages: string;
  history?: ReplayableMessage[];
  /** 显式指定要激活的 skill 名称 */
  skill?: string;
}
