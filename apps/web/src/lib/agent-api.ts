/**
 * 会话接口（server 的 routes/conversations.ts，harness 第三期：会话收件箱）。
 * 输入都写进会话的收件箱（立即返回），由 server 上每个会话一个的处理者按顺序跑；
 * 每个打开的会话一条事件流（core 事件，toPublicEvent 之后），前端交给 @leochat/core/view 的 reduce()。
 */
import type { AgentEvent, Goal, Message } from "@leochat/core";
import { getServerBaseUrl } from "./api";
import type { LoopRule } from "./loop-command";

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
  /** 权限预设（dsh 的 permission-presets，暂无沙箱）：ask 询问，full 完全信任、不再询问 */
  permission?: "ask" | "full";
}

/** 收件箱里待处理的输入（server 推送的 inbox 事件） */
export interface InboxView {
  nextTurn: Array<{ id: string; source: "user" | "reminder" | "goal"; text: string }>;
  nextStep: Array<{ id: string; source: "user" | "reminder" | "goal"; text: string }>;
}

/** 目标 + 是否正在自动推进（armed，只在 server 进程内） */
export type GoalView = Goal & { armed?: boolean };

export interface LoadedConversation {
  meta: ConversationMeta;
  transcript: Message[];
  /** 当前目标（/goal） */
  goal: Goal | null;
  /** 处理者正在跑 */
  running: boolean;
  /** 目标正在自动推进 */
  goalArmed: boolean;
}

export type GoalAction = "edit" | "pause" | "resume" | "complete" | "clear";

/** 定时提醒（/loop），与 server 的 Schedule 相同的结构（只列出界面用到的字段） */
export interface ScheduleView {
  id: string;
  conversationId: string;
  title: string;
  prompt: string;
  rule: LoopRule;
  timeZone: string;
  state: "active" | "ended";
  nextAt: number | null;
}

/** 已上传的附件（与 server 的 AttachmentMeta 相同） */
export interface AttachmentMeta {
  id: string;
  filename: string;
  mediaType: string;
  bytes: number;
  kind: "image" | "file";
}

/** 消息里的附件引用（server 写进会话日志的形式）："attachment:<id>" */
export const ATTACHMENT_PREFIX = "attachment:";

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

/** 附件的地址（图片缩略图、文件下载） */
export async function attachmentUrl(id: string): Promise<string> {
  return `${await base()}/attachments/${encodeURIComponent(id)}`;
}

export const agentApi = {
  /** 上传一个附件；相同内容返回同一个 id */
  uploadAttachment: async (file: File): Promise<AttachmentMeta> => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${await base()}/attachments`, { method: "POST", body: form });
    if (res.status === 413) throw new Error("文件太大（图片最大 20 MB，其它文件最大 50 MB）");
    if (!res.ok) throw new Error(`上传失败（${res.status}）`);
    return (await res.json()) as AttachmentMeta;
  },
  listConversations: () => call<{ conversations: ConversationMeta[] }>("GET", "/conversations").then((r) => r.conversations),
  createConversation: (title?: string) => call<ConversationMeta>("POST", "/conversations", title ? { title } : {}),
  loadConversation: (id: string) => call<LoadedConversation>("GET", `/conversations/${encodeURIComponent(id)}`),
  renameConversation: (id: string, title: string) => call<unknown>("PATCH", `/conversations/${encodeURIComponent(id)}`, { title }),
  deleteConversation: (id: string) => call<unknown>("DELETE", `/conversations/${encodeURIComponent(id)}`),

  /** 发一条消息：写进收件箱后立即返回。next-turn 发送 / 排队，next-step 插话（送进正在运行的这一轮） */
  sendMessage: (conversationId: string, input: { text: string; target: "next-turn" | "next-step"; settings: RunSettings; attachments?: string[] }) =>
    call<{ item: { id: string } }>("POST", `/conversations/${encodeURIComponent(conversationId)}/messages`, input),
  /** 撤回一条还没处理的输入 */
  withdraw: (conversationId: string, itemId: string) =>
    call<unknown>("DELETE", `/conversations/${encodeURIComponent(conversationId)}/inbox/${encodeURIComponent(itemId)}`),
  /** 停止：中止当前运行并清空收件箱；停止的是目标轮次则暂停目标 */
  stop: (conversationId: string) => call<unknown>("POST", `/conversations/${encodeURIComponent(conversationId)}/stop`, {}),

  /** 会话事件流（长连接）：这个会话所有运行的事件；连上时先收到 reset（重建视图用）、状态、收件箱、目标 */
  async *events(conversationId: string, signal: AbortSignal): AsyncGenerator<AgentEvent> {
    const res = await fetch(`${await base()}/conversations/${encodeURIComponent(conversationId)}/events`, {
      headers: { Accept: "text/event-stream" },
      signal,
    });
    if (!res.ok || !res.body) throw new Error(`events failed: ${res.status}`);
    yield* parseEventStream(res.body);
  },

  getGoal: (id: string) => call<{ goal: Goal | null; armed: boolean }>("GET", `/conversations/${encodeURIComponent(id)}/goal`),
  /** 创建目标并开始自动推进；settings 是目标轮次用的设置 */
  createGoal: (id: string, input: { objective: string; maxRounds?: number; settings: RunSettings }) =>
    call<{ goal: Goal; armed: boolean }>("POST", `/conversations/${encodeURIComponent(id)}/goal`, input),
  /** 修改目标（resume 时可带新的 settings） */
  updateGoal: (id: string, input: { action: GoalAction; revision: number; objective?: string; maxRounds?: number; settings?: RunSettings }) =>
    call<{ goal: Goal | null; armed: boolean }>("PATCH", `/conversations/${encodeURIComponent(id)}/goal`, input),

  listSchedules: (conversationId: string) =>
    call<{ schedules: ScheduleView[] }>("GET", `/schedules?conversationId=${encodeURIComponent(conversationId)}`).then((r) => r.schedules),
  createSchedule: (conversationId: string, input: { prompt: string; rule: LoopRule; title?: string; timeZone?: string; settings?: RunSettings }) =>
    call<{ schedule: ScheduleView }>("POST", `/conversations/${encodeURIComponent(conversationId)}/schedules`, input).then((r) => r.schedule),
  deleteSchedule: (id: string) => call<unknown>("DELETE", `/schedules/${encodeURIComponent(id)}`),

};
