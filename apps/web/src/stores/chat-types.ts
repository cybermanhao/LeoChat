import type { LLMConfig, MCPTool } from "@ai-chatbox/shared";
import type { Goal } from "@leochat/core";
import type { RunViewState } from "@leochat/core/view";
import type { ConversationMeta } from "../lib/agent-api";

export type LLMProvider = "deepseek" | "openrouter" | "openai" | "moonshot" | "kimi" | "google";

/** 会话列表项。会话内容（transcript）保存在本地 server 的 JSONL 日志里，前端只持有当前会话的视图状态 */
export type Conversation = ConversationMeta;

// ─── Settings slice ──────────────────────────────────────────────

export interface SettingsSlice {
  providerKeys: Record<LLMProvider, string>;
  currentProvider: LLMProvider;
  currentModel: string;
  enableMarkdown: boolean;
  /** 联网搜索（DeepSeek 的服务端工具；其它提供商忽略） */
  webSearch: boolean;
  maxEpochs: number;
  unlimitedEpochs: boolean;
  contextLevel: number;
  uiMode: "simple" | "professional";
  temperature: number;
  llmConfig: LLMConfig | null;
  mcpTools: MCPTool[];

  setProviderKey: (provider: LLMProvider, key: string, opts?: { sync?: boolean }) => void;
  setCurrentProvider: (provider: LLMProvider) => void;
  setCurrentModel: (model: string) => void;
  setEnableMarkdown: (enable: boolean) => void;
  setWebSearch: (on: boolean) => void;
  setMaxEpochs: (n: number) => void;
  setUnlimitedEpochs: (v: boolean) => void;
  setContextLevel: (level: number) => void;
  setUiMode: (mode: "simple" | "professional") => void;
  setTemperature: (t: number) => void;
  setLLMConfig: (config: LLMConfig) => void;
  setMCPTools: (tools: MCPTool[]) => void;
  initFromBackendConfig: (config: { availableProviders: string[]; defaultProvider: string }) => void;
}

// ─── Conversations slice ─────────────────────────────────────────

export interface ConversationsSlice {
  conversations: Conversation[];
  currentConversationId: string | null;
  /** 当前会话的视图（core 的 reduce() 推导） */
  view: RunViewState;
  /** 正在加载当前会话的内容 */
  loadingConversation: boolean;
  /** 当前会话的目标（/goal）；没有时为 null */
  goal: Goal | null;
  input: string;

  setInput: (input: string) => void;
  /** 从 server 拉会话列表（启动时调用） */
  loadConversations: () => Promise<void>;
  /** 在 server 上建一个新会话并切换过去 */
  createConversation: () => Promise<string>;
  setCurrentConversation: (id: string | null) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  clearAllConversations: () => Promise<void>;
  /** 清空当前会话：删掉它，回到空白状态 */
  clearCurrentConversation: () => Promise<void>;
}

// ─── Generation slice ────────────────────────────────────────────

export interface GenerationSlice {
  isGenerating: boolean;
  /** 进行中的运行 id（插话 / 排队 / 中止用） */
  activeRunId: string | null;
  /** 本次会话内总是允许的工具（不持久化，刷新即清空） */
  sessionAllowedTools: Set<string>;
  /** 已经回答过、等待 server 确认的审批（防止重复点击） */
  answeredApprovals: Set<string>;
  /** 当前连着的是目标驱动（而不是一次普通运行） */
  goalAttached: boolean;

  /** 空闲时开始新的运行；运行中时作为插话（steer）送入当前运行 */
  sendMessage: (content: string, systemPrompt?: string) => Promise<void>;
  /** 运行中排队：本轮结束后接着处理 */
  queueFollowUp: (content: string) => Promise<void>;
  cancelGeneration: () => void;
  executeAction: (actionName: string, attributes: Record<string, string>) => void;
  /** 离开当前会话（切换 / 新建 / 删除）：普通运行会被取消；目标只断开连接，在 server 上继续推进 */
  leaveConversation: () => void;
  /** /goal：创建目标并开始自动推进 */
  startGoal: (objective: string, opts?: { maxRounds?: number; systemPrompt?: string }) => Promise<void>;
  /** 开始推进当前 active 的目标，或连上 server 上正在推进的驱动 */
  attachGoal: (systemPrompt?: string) => Promise<void>;
  pauseGoal: () => Promise<void>;
  /** 恢复暂停 / 卡住的目标并继续推进；extraRounds 用于轮数用完时先加轮数 */
  resumeGoal: (opts?: { extraRounds?: number; systemPrompt?: string }) => Promise<void>;
  completeGoal: () => Promise<void>;
  clearGoal: () => Promise<void>;
  /** 回答审批；forSession 表示本次会话内这个工具都自动允许 */
  respondApproval: (callId: string, toolName: string, approved: boolean, forSession?: boolean) => Promise<void>;
}

// ─── Combined store ──────────────────────────────────────────────

export type ChatState = SettingsSlice & ConversationsSlice & GenerationSlice;

/** Zustand slice creator type — receives set/get for the full combined store */
export type SliceCreator<T> = (
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
) => T;
