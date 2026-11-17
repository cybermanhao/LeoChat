/**
 * 会话与运行接口（server 的 routes/conversations.ts）。
 * 运行的响应是 core 事件（toPublicEvent 之后）的 SSE 流，前端直接交给 @leochat/core/view 的 reduce()。
 */
import type { AgentEvent, Goal, Message } from "@leochat/core";
import { getServerBaseUrl } from "./api";

export interface ConversationMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

/** 运行设置（普通运行和目标运行共用） */
export interface RunSettings {
  system?: string;
  model?: string;
  provider?: string;
  maxSteps?: number;
  temperature?: number;
  /** 允许模型使用的工具名（用户在 MCP 面板里启用的），不传表示全部 */
  tools?: string[];
  /** 打开 DeepSeek 联网搜索 */
  webSearch?: boolean;
  /** 运行环境：桌面端才提供 resize_window 等窗口工具 */
  host?: "web" | "electron";
  /** 是否提供进程内的界面操作工具，默认 true */
  uiTools?: boolean;
}

export interface RunRequest extends RunSettings {
  text: string;
}

export interface LoadedConversation {
  meta: ConversationMeta;
  transcript: Message[];
  /** 当前目标（/goal） */
  goal: Goal | null;
  /** server 上是否有正在推进这个目标的驱动 */
  goalRunning: boolean;
}

export type GoalAction = "edit" | "pause" | "resume" | "complete" | "clear";

const VITE_BACKEND_URL = typeof import.meta !== "undefined" ? import.meta.env?.VITE_BACKEND_URL : undefined;

async function base(): Promise<string> {
  return `${VITE_BACKEND_URL || (await getServerBaseUrl())}/api`;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${await base()}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

/** 解析 SSE 文本流：每个事件的 data 行是一条 JSON 编码的 AgentEvent */
export async function* parseEventStream(body: ReadableStream<Uint8Array>): AsyncGenerator<AgentEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let sep: number;
      // 事件之间用空行分隔
      while ((sep = buf.search(/\r?\n\r?\n/)) >= 0) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep).replace(/^\r?\n\r?\n/, "");
        const data = raw
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data) yield JSON.parse(data) as AgentEvent;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const agentApi = {
  listConversations: () => call<{ conversations: ConversationMeta[] }>("GET", "/conversations").then((r) => r.conversations),
  createConversation: (title?: string) => call<ConversationMeta>("POST", "/conversations", title ? { title } : {}),
  loadConversation: (id: string) => call<LoadedConversation>("GET", `/conversations/${encodeURIComponent(id)}`),
  renameConversation: (id: string, title: string) => call<unknown>("PATCH", `/conversations/${encodeURIComponent(id)}`, { title }),
  deleteConversation: (id: string) => call<unknown>("DELETE", `/conversations/${encodeURIComponent(id)}`),

  /** 发起一次运行，逐个产出事件；signal 中止只断开连接（server 收到断开会中止运行） */
  async *run(conversationId: string, req: RunRequest, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const res = await fetch(`${await base()}/conversations/${encodeURIComponent(conversationId)}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(req),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok || !res.body) throw new Error(`run failed: ${res.status}`);
    yield* parseEventStream(res.body);
  },

  getGoal: (id: string) => call<{ goal: Goal | null; running: boolean }>("GET", `/conversations/${encodeURIComponent(id)}/goal`),
  createGoal: (id: string, input: { objective: string; maxRounds?: number }) =>
    call<{ goal: Goal }>("POST", `/conversations/${encodeURIComponent(id)}/goal`, input),
  updateGoal: (id: string, input: { action: GoalAction; revision: number; objective?: string; maxRounds?: number }) =>
    call<{ goal: Goal | null; running: boolean }>("PATCH", `/conversations/${encodeURIComponent(id)}/goal`, input),

  /** 开始推进目标，或连上正在推进的驱动；signal 中止只断开连接，驱动在 server 上继续 */
  async *runGoal(conversationId: string, settings: RunSettings, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const res = await fetch(`${await base()}/conversations/${encodeURIComponent(conversationId)}/goal/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(settings),
      ...(signal ? { signal } : {}),
    });
    if (!res.ok || !res.body) throw new Error(`goal run failed: ${res.status}`);
    yield* parseEventStream(res.body);
  },

  steer: (runId: string, text: string) => call<{ result: unknown }>("POST", `/runs/${encodeURIComponent(runId)}/steer`, { text }),
  followUp: (runId: string, text: string) => call<{ result: unknown }>("POST", `/runs/${encodeURIComponent(runId)}/follow-up`, { text }),
  abort: (runId: string) => call<unknown>("POST", `/runs/${encodeURIComponent(runId)}/abort`, {}),
};
