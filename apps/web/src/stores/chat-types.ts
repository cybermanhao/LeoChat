import type {
  ChatMessage,
  CardStatus,
  TaskLoopEvent,
  ToolCall,
  LLMConfig,
  MCPTool,
  DisplayMessage,
  ContextMessage,
} from "@ai-chatbox/shared";

export type LLMProvider = "deepseek" | "openrouter" | "openai" | "moonshot" | "kimi-code" | "google";

export interface Conversation {
  id: string;
  title: string;
  displayMessages: DisplayMessage[];
  contextMessages: ContextMessage[];
  internalMessages?: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export type ToolCallStatusType = "pending" | "running" | "success" | "error";

export interface ToolCallState {
  id: string;
  name: string;
  status: ToolCallStatusType;
  arguments?: Record<string, unknown>;
  result?: string;
  error?: string;
  uiCommandExecuted?: boolean;
  startTime: number;
  endTime?: number;
  duration?: number;
}

/** TaskLoop 实例接口（最小化，避免导入依赖） */
export interface TaskLoopInstance {
  abort: () => void;
  start: (content: string) => Promise<void>;
  subscribe: (listener: (event: TaskLoopEvent) => void) => () => void;
}

// ─── Settings slice ──────────────────────────────────────────────

export interface SettingsSlice {
  providerKeys: Record<LLMProvider, string>;
  currentProvider: LLMProvider;
  currentModel: string;
  enableMarkdown: boolean;
  maxEpochs: number;
  contextLevel: number;
  uiMode: "simple" | "professional";
  temperature: number;
  llmConfig: LLMConfig | null;
  mcpTools: MCPTool[];

  setProviderKey: (provider: LLMProvider, key: string) => void;
  setCurrentProvider: (provider: LLMProvider) => void;
  setCurrentModel: (model: string) => void;
  setEnableMarkdown: (enable: boolean) => void;
  setMaxEpochs: (n: number) => void;
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
  input: string;

  setInput: (input: string) => void;
  createConversation: () => string;
  setCurrentConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearAllConversations: () => void;

  _addMessage: (chatId: string, message: DisplayMessage, contextMessage: ContextMessage) => void;
  _updateMessage: (chatId: string, messageId: string, patch: Partial<DisplayMessage>) => void;
  _patchLastAssistantMessage: (
    chatId: string,
    delta: { content_delta?: string; reasoning_delta?: string; tool_calls?: ToolCall[] }
  ) => void;
}

// ─── Generation slice ────────────────────────────────────────────

export interface GenerationSlice {
  isGenerating: boolean;
  cardStatus: CardStatus;
  toolCallStates: Record<string, ToolCallState>;
  activeTaskLoop: TaskLoopInstance | null;

  sendMessage: (content: string, systemPrompt?: string) => Promise<void>;
  cancelGeneration: () => void;
  executeAction: (actionName: string, attributes: Record<string, string>) => void;
  _handleTaskLoopEvent: (chatId: string, event: TaskLoopEvent) => void;
}

// ─── Combined store ──────────────────────────────────────────────

export type ChatState = SettingsSlice & ConversationsSlice & GenerationSlice;

/** Zustand slice creator type — receives set/get for the full combined store */
export type SliceCreator<T> = (
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void,
  get: () => ChatState,
) => T;
