/**
 * 把 core 的视图消息按回合组织（重设计 P2）：
 *   回合 = 一条用户消息 + 之后所有的助手消息（一步一条：思考、工具调用、正文……）。
 * 每个回合再拆成"过程"（思考、工具、联网搜索、中间说明）和"最终回答"（最后一步工具之后的正文）。
 */
import type { ViewMessage, ViewPart } from "@leochat/core/view";
import type { Citation } from "@leochat/core";
import { serverToolDescribe, toolView, type StepKind } from "./tool-views";

export type ToolPart = Extract<ViewPart, { type: "tool" }>;
export type ServerToolPart = Extract<ViewPart, { type: "server_tool" }>;

export interface Turn {
  key: string;
  /** 回合开头的用户消息；对话以助手消息开头时没有 */
  user?: ViewMessage;
  assistant: ViewMessage[];
}

/** 目标驱动生成的每轮提示（<goal_round>，见 core 的 renderGoalRoundPrompt），显示成"第 N 轮"而不是整段提示词 */
export function goalRoundOf(m: ViewMessage): { round: number; maxRounds: number } | null {
  if (m.role !== "user") return null;
  const first = m.parts[0];
  if (first?.type !== "text" || !first.text.startsWith("<goal_round>")) return null;
  const r = /Round: (\d+)\/(\d+)/.exec(first.text);
  return r ? { round: Number(r[1]), maxRounds: Number(r[2]) } : null;
}

/** 定时提醒消息（server 的 renderReminder）："[定时提醒]" 开头，正文在第一个空行之后 */
export function reminderOf(text: string): { prompt: string } | null {
  if (!text.startsWith("[定时提醒]")) return null;
  const i = text.indexOf("\n\n");
  return { prompt: i >= 0 ? text.slice(i + 2) : text.slice("[定时提醒]".length).trim() };
}

export function groupTurns(messages: ViewMessage[]): Turn[] {
  const turns: Turn[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      turns.push({ key: m.id, user: m, assistant: [] });
    } else if (m.role === "assistant") {
      const last = turns[turns.length - 1];
      if (last) last.assistant.push(m);
      else turns.push({ key: m.id, assistant: [m] });
    }
  }
  return turns;
}

export type ProcessItem =
  | { type: "reasoning"; key: string; text: string; streaming: boolean }
  | { type: "tool"; key: string; part: ToolPart }
  | { type: "server_tool"; key: string; part: ServerToolPart }
  /** 工具调用之间的说明文字（"我先查一下……"） */
  | { type: "note"; key: string; text: string; streaming: boolean };

export interface TurnSplit {
  process: ProcessItem[];
  /** 最终回答：最后一个过程步骤之后的正文，加上图片、文件 */
  answer: ViewPart[];
  citations: Citation[];
}

const isProcess = (p: ViewPart) => p.type === "reasoning" || p.type === "tool" || p.type === "server_tool";

export function splitTurn(assistant: ViewMessage[]): TurnSplit {
  const flat = assistant.flatMap((m) => m.parts.map((p, i) => ({ p, key: `${m.id}:${i}` })));
  let lastProcess = -1;
  flat.forEach(({ p }, i) => {
    if (isProcess(p)) lastProcess = i;
  });
  const process: ProcessItem[] = [];
  const answer: ViewPart[] = [];
  flat.forEach(({ p, key }, i) => {
    switch (p.type) {
      case "reasoning":
        if (p.text || p.streaming) process.push({ type: "reasoning", key, text: p.text, streaming: p.streaming });
        return;
      case "tool":
        process.push({ type: "tool", key: p.callId, part: p });
        return;
      case "server_tool":
        process.push({ type: "server_tool", key: p.callId, part: p });
        return;
      case "text":
        if (i < lastProcess) {
          if (p.text.trim()) process.push({ type: "note", key, text: p.text, streaming: p.streaming });
        } else answer.push(p);
        return;
      case "custom":
        return;
      default:
        answer.push(p); // 图片、文件
    }
  });
  const citations = flat.flatMap(({ p }) => (p.type === "text" && p.citations ? p.citations : []));
  return { process, answer, citations };
}

export interface ProcessSummary {
  thought: boolean;
  counts: Record<StepKind, number>;
  failed: number;
  /** 工具耗时合计（毫秒）；没有耗时信息时为 0 */
  ms: number;
}

export function summarize(process: ProcessItem[]): ProcessSummary {
  const counts: Record<StepKind, number> = { command: 0, search: 0, page: 0, tool: 0 };
  let thought = false;
  let failed = 0;
  let ms = 0;
  for (const item of process) {
    if (item.type === "reasoning") thought = true;
    else if (item.type === "tool") {
      counts[toolView(item.part.name).kind]++;
      if (item.part.state === "output-error" || item.part.state === "denied") failed++;
      ms += item.part.ms ?? 0;
    } else if (item.type === "server_tool") counts[serverToolDescribe(item.part.input).kind]++;
  }
  return { thought, counts, failed, ms };
}

const KIND_LABEL: Record<StepKind, (n: number) => string> = {
  command: (n) => `${n} 条命令`,
  search: (n) => `搜索 ${n} 次`,
  page: (n) => `读取 ${n} 个网页`,
  tool: (n) => `${n} 个工具`,
};

/** "思考 · 1 条命令 · 搜索 2 次 · 1 步失败 · 3.2 秒" */
export function summaryText(s: ProcessSummary): string {
  const parts: string[] = [];
  if (s.thought) parts.push("思考");
  for (const k of ["command", "search", "page", "tool"] as const) if (s.counts[k]) parts.push(KIND_LABEL[k](s.counts[k]));
  if (s.failed) parts.push(`${s.failed} 步失败`);
  if (s.ms >= 100) parts.push(formatMs(s.ms));
  return parts.join(" · ");
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} 秒`;
}

/** 回合里所有正文（复制按钮用） */
export function answerText(split: TurnSplit): string {
  return split.answer
    .filter((p): p is Extract<ViewPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n\n");
}

/**
 * 结构共享：内容没变的回合沿用上一次的对象，让 memo 过的回合组件在流式输出时不重新渲染
 * （core 的 reduce 本身是结构共享的，没变的消息引用不变）
 */
export function reuseTurns(prev: Turn[], next: Turn[]): Turn[] {
  const byKey = new Map(prev.map((t) => [t.key, t]));
  return next.map((t) => {
    const old = byKey.get(t.key);
    if (
      old &&
      old.user === t.user &&
      old.assistant.length === t.assistant.length &&
      old.assistant.every((m, i) => m === t.assistant[i])
    ) {
      return old;
    }
    return t;
  });
}
