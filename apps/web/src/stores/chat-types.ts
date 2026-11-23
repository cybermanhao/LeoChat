import type { LLMConfig, MCPTool } from "@ai-chatbox/shared";
import type { RunViewState } from "@leochat/core/view";
import type { AttachmentMeta, ConversationMeta, GoalView, InboxView, ScheduleView } from "../lib/agent-api";
import type { LoopRule } from "../lib/loop-command";

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
  /** 权限预设（dsh 的 permission-presets，暂无沙箱）：ask 询问（默认），full 完全信任、不再询问 */
  permission: "ask" | "full";
  maxEpochs: number;
  unlimitedEpochs: boolean;
  contextLevel: number;
  uiMode: "simple" | "professional";
  /** 工作细节（按 dsh）：concise = 已完成回合的过程收起；detailed = 全部展开 */
  workDetails: "concise" | "detailed";
  temperature: number;
  llmConfig: LLMConfig | null;
  mcpTools: MCPTool[];

  setProviderKey: (provider: LLMProvider, key: string, opts?: { sync?: boolean }) => void;
  setCurrentProvider: (provider: LLMProvider) => void;
  setCurrentModel: (model: string) => void;
  setEnableMarkdown: (enable: boolean) => void;
  setWebSearch: (on: boolean) => void;
  setPermission: (p: "ask" | "full") => void;
  setMaxEpochs: (n: number) => void;
  setUnlimitedEpochs: (v: boolean) => void;
  setContextLevel: (level: number) => void;
  setUiMode: (mode: "simple" | "professional") => void;
  setWorkDetails: (mode: "concise" | "detailed") => void;
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
  /** 当前会话的目标（/goal，含是否正在自动推进）；没有时为 null */
  goal: GoalView | null;
  /** 当前会话收件箱里待处理的输入 */
  inbox: InboxView;
  /** 当前会话的定时提醒（/loop） */
  schedules: ScheduleView[];
  input: string;

  setInput: (input: string) => void;
  /** 从 server 拉会话列表（启动时调用） */
  loadConversations: () => Promise<void>;
  /** 在 server 上建一个新会话并切换过去 */
  createConversation: () => Promise<string>;
  setCurrentConversation: (id: string | null) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  /** 重命名会话（先改本地，server 失败时改回） */
  renameConversation: (id: string, title: string) => Promise<void>;
  clearAllConversations: () => Promise<void>;
  /** 清空当前会话：删掉它，回到空白状态 */
  clearCurrentConversation: () => Promise<void>;
}

// ─── Generation slice ────────────────────────────────────────────

export interface GenerationSlice {
  /** 当前会话的处理者正在跑（server 推送的 agent 事件） */
  isGenerating: boolean;
  /** 本次会话内总是允许的工具（不持久化，刷新即清空） */
  sessionAllowedTools: Set<string>;
  /** 已经回答过、等待 server 确认的审批（防止重复点击） */
  answeredApprovals: Set<string>;

  /** 连上 / 断开当前会话的事件流（打开会话时连上，断线自动重连）；null 表示断开 */
  connect: (id: string | null) => void;
  /** 发送：空闲时开始新的一轮；运行中作为插话送进当前这一轮 */
  /** 发消息（运行中是插话）；返回是否送出 */
  sendMessage: (content: string, systemPrompt?: string, attachments?: AttachmentMeta[]) => Promise<boolean>;
  /** 排队：当前这一轮结束后处理 */
  queueFollowUp: (content: string, systemPrompt?: string, attachments?: AttachmentMeta[]) => Promise<boolean>;
  /** 撤回收件箱里一条还没处理的输入 */
  withdraw: (itemId: string) => Promise<void>;
  /** 停止：中止当前这一轮并清空收件箱（目标轮次则暂停目标） */
  cancelGeneration: () => void;
  executeAction: (actionName: string, attributes: Record<string, string>) => void;
  /** /goal：创建目标并开始自动推进 */
  startGoal: (objective: string, opts?: { maxRounds?: number; systemPrompt?: string }) => Promise<void>;
  pauseGoal: () => Promise<void>;
  /** 恢复暂停 / 卡住 / 待继续的目标；extraRounds 用于轮数用完时先加轮数 */
  resumeGoal: (opts?: { extraRounds?: number; systemPrompt?: string }) => Promise<void>;
  completeGoal: () => Promise<void>;
  clearGoal: () => Promise<void>;
  /** /loop：给当前会话建一个定时提醒（没有会话就先建一个）；成功返回 true */
  createSchedule: (prompt: string, rule: LoopRule, systemPrompt?: string) => Promise<boolean>;
  deleteSchedule: (id: string) => Promise<void>;
  refreshSchedules: () => Promise<void>;
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
