// API endpoints
export const API_ENDPOINTS = {
  OPENROUTER: "https://openrouter.ai/api/v1",
  DEEPSEEK: "https://api.deepseek.com",
  OPENAI: "https://api.openai.com/v1",
  ANTHROPIC: "https://api.anthropic.com/v1",
  MCP_LOCAL: "http://localhost:3001",
} as const;

// Default models
export const DEFAULT_MODELS = {
  CHAT: "deepseek-chat",          // DeepSeek 为默认
  FAST: "deepseek-chat",
  REASONING: "deepseek-reasoner", // DeepSeek R1
  // OpenRouter 模型
  OPENROUTER_CHAT: "anthropic/claude-3.5-sonnet",
  OPENROUTER_FAST: "anthropic/claude-3-haiku",
} as const;

// LLM 提供商配置
export const LLM_PROVIDERS = {
  deepseek: {
    name: "DeepSeek",
    baseURL: "https://api.deepseek.com",
    models: ["deepseek-chat", "deepseek-reasoner"],
    envKey: "DEEPSEEK_API_KEY",
  },
  openrouter: {
    name: "OpenRouter",
    baseURL: "https://openrouter.ai/api/v1",
    models: [], // 动态获取
    envKey: "OPENROUTER_API_KEY",
  },
  openai: {
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    envKey: "OPENAI_API_KEY",
  },
} as const;

// IPC channels for Electron
export const IPC_CHANNELS = {
  // Server communication
  SERVER_START: "server:start",
  SERVER_STOP: "server:stop",
  SERVER_STATUS: "server:status",

  // MCP communication
  MCP_CONNECT: "mcp:connect",
  MCP_DISCONNECT: "mcp:disconnect",
  MCP_LIST_TOOLS: "mcp:list-tools",
  MCP_CALL_TOOL: "mcp:call-tool",

  // LLM communication
  LLM_CHAT: "llm:chat",
  LLM_STREAM: "llm:stream",
  LLM_CANCEL: "llm:cancel",

  // Theme
  THEME_UPDATE: "theme:update",
  THEME_GET: "theme:get",
} as const;

// SSE event types
export const SSE_EVENTS = {
  MESSAGE: "message",
  STREAM_START: "stream:start",
  STREAM_CHUNK: "stream:chunk",
  STREAM_END: "stream:end",
  TOOL_CALL: "tool:call",
  TOOL_RESULT: "tool:result",
  ERROR: "error",
} as const;

// Storage keys
export const STORAGE_KEYS = {
  THEME: "ai-chatbox-theme",
  MCP_SERVERS: "ai-chatbox-mcp-servers",
  CHAT_HISTORY: "ai-chatbox-chat-history",
  SETTINGS: "ai-chatbox-settings",
} as const;

// Timeouts (in ms)
export const TIMEOUTS = {
  MCP_CONNECT: 10000,
  LLM_REQUEST: 60000,
  STREAM_HEARTBEAT: 30000,
} as const;
