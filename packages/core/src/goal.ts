/**
 * /goal：每个会话一个持久的完成目标，以及把它变成连续多轮运行的驱动（参考 dsh 的 packages/goal）。
 * 设计文档：docs/superpowers/specs/2026-11-17-harness-design.md
 *
 * - 状态：active（进行中）/ paused（暂停）/ blocked（卡住）/ complete（完成）
 * - 每次变更追加一条记录（变更后的完整快照），回放记录得到当前目标；revision 必须连续
 * - 修改要带 { id, revision }，旧视图的修改会被拒绝（stale）
 * - 只有用户能创建 / 编辑 / 暂停 / 恢复 / 清除；模型只能完成或报告卡住（goalTools）
 * - "允许自动续行"不持久化：进程重启后不会自己继续，要用户明确再启动 runGoal()
 */
import { z } from "zod";
import type { Message } from "./blocks";
import type { AgentEvent } from "./events";
import { EventChannel } from "./internal/channel";
import type { RunHandle, RunOptions } from "./run-types";
import { run } from "./run";
import { defineTool, type AnyTool } from "./tool";
import { addUsage, emptyUsage, type Usage } from "./usage";
import { newId } from "./messages";

export type GoalPhase = "active" | "paused" | "blocked" | "complete";

export interface GoalBlocker {
  /** model-reported：模型连续多轮报告同一障碍；round-limit：轮数用完；error：运行出错 */
  code: "model-reported" | "round-limit" | "error";
  reason: string;
}

export interface Goal {
  id: string;
  revision: number;
  objective: string;
  phase: GoalPhase;
  roundsStarted: number;
  maxRounds: number;
  blocker?: GoalBlocker;
  createdAt: number;
  updatedAt: number;
}

export interface GoalRef {
  id: string;
  revision: number;
}

export type GoalOp = "create" | "edit" | "pause" | "resume" | "complete" | "block" | "clear" | "round";

/** 持久化的变更记录：变更后的完整快照；clear 记录 goal 为 null，并带被清除目标的 ref */
export interface GoalRecord {
  op: GoalOp;
  goal: Goal | null;
  cleared?: GoalRef;
  at: number;
}

/** 目标记录的存储（@leochat/node 的 conversationLog 把它写进会话的 JSONL） */
export interface GoalStore {
  load(): Promise<GoalRecord[]>;
  append(record: GoalRecord): Promise<void>;
}

export type GoalErrorCode = "no_goal" | "stale" | "invalid_transition" | "goal_exists" | "invalid_input" | "replay";

export class GoalError extends Error {
  constructor(
    readonly code: GoalErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "GoalError";
  }
}

/** dsh 的默认值 */
export const DEFAULT_MAX_GOAL_ROUNDS = 256;
export const MAX_GOAL_ROUNDS_LIMIT = 10_000;
export const MAX_OBJECTIVE_LENGTH = 8_000;

const NEXT: Record<Exclude<GoalOp, "create" | "clear" | "edit">, Partial<Record<GoalPhase, GoalPhase>>> = {
  pause: { active: "paused" },
  resume: { paused: "active", blocked: "active" },
  complete: { active: "complete", paused: "complete", blocked: "complete" },
  block: { active: "blocked" },
  round: { active: "active" },
};

function checkObjective(objective: unknown): string {
  if (typeof objective !== "string" || !objective.trim()) throw new GoalError("invalid_input", "objective must be a non-empty string");
  if (objective.length > MAX_OBJECTIVE_LENGTH) throw new GoalError("invalid_input", `objective is longer than ${MAX_OBJECTIVE_LENGTH} characters`);
  return objective.trim();
}

function checkMaxRounds(n: unknown): number {
  if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1 || n > MAX_GOAL_ROUNDS_LIMIT) {
    throw new GoalError("invalid_input", `maxRounds must be an integer between 1 and ${MAX_GOAL_ROUNDS_LIMIT}`);
  }
  return n;
}

/** 严格回放：revision 连续、状态转换合法、轮数只增 1；任何不一致都抛 GoalError("replay") */
export function replayGoal(records: Iterable<GoalRecord>): Goal | null {
  let current: Goal | null = null;
  let lastCleared: GoalRef | undefined;
  for (const r of records) {
    const prev: Goal | null = current;
    if (r.op === "clear") {
      if (!prev || !r.cleared || r.cleared.id !== prev.id || r.cleared.revision !== prev.revision + 1 || r.goal !== null) {
        throw new GoalError("replay", "invalid clear record");
      }
      lastCleared = r.cleared;
      current = null;
      continue;
    }
    const g = r.goal;
    if (!g || typeof g.id !== "string" || typeof g.revision !== "number") throw new GoalError("replay", `invalid ${r.op} record`);
    if (r.op === "create") {
      if (prev && prev.phase !== "complete") throw new GoalError("replay", "create while a goal is unfinished");
      if (g.revision !== 1 || g.roundsStarted !== 0 || g.phase !== "active") throw new GoalError("replay", "invalid create record");
      if (lastCleared && lastCleared.id === g.id) throw new GoalError("replay", "goal id reused");
      current = g;
      continue;
    }
    if (!prev || g.id !== prev.id || g.revision !== prev.revision + 1) throw new GoalError("replay", `discontinuous ${r.op} record`);
    if (r.op === "edit") {
      if (g.phase !== prev.phase || g.roundsStarted !== prev.roundsStarted) throw new GoalError("replay", "edit changed phase or rounds");
    } else {
      const to = NEXT[r.op]?.[prev.phase];
      if (to !== g.phase) throw new GoalError("replay", `illegal ${r.op} from ${prev.phase}`);
      const rounds = r.op === "round" ? prev.roundsStarted + 1 : prev.roundsStarted;
      if (g.roundsStarted !== rounds) throw new GoalError("replay", "rounds out of sequence");
    }
    current = g;
  }
  return current;
}

export interface GoalController {
  get(): Goal | null;
  create(input: { objective: string; maxRounds?: number }): Promise<Goal>;
  edit(ref: GoalRef, patch: { objective?: string; maxRounds?: number }): Promise<Goal>;
  pause(ref: GoalRef): Promise<Goal>;
  resume(ref: GoalRef): Promise<Goal>;
  complete(ref: GoalRef): Promise<Goal>;
  block(ref: GoalRef, blocker: GoalBlocker): Promise<Goal>;
  clear(ref: GoalRef): Promise<void>;
  /** 开始新的一轮：roundsStarted + 1（驱动用） */
  admitRound(ref: GoalRef): Promise<Goal>;
  /** 每次变更后通知（变更已写盘）；返回取消订阅函数 */
  subscribe(listener: (goal: Goal | null, op: GoalOp) => void): () => void;
}

/** 读取存储里的记录、回放出当前目标，返回控制器。所有变更先写盘再生效，按调用顺序串行 */
export async function goalController(
  store: GoalStore,
  opts: { defaultMaxRounds?: number; now?: () => number } = {},
): Promise<GoalController> {
  const now = opts.now ?? Date.now;
  const defaultMax = checkMaxRounds(opts.defaultMaxRounds ?? DEFAULT_MAX_GOAL_ROUNDS);
  let current = replayGoal(await store.load());
  const listeners = new Set<(goal: Goal | null, op: GoalOp) => void>();
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const p = queue.then(fn, fn);
    queue = p.catch(() => {});
    return p;
  };

  const requireRef = (ref: GoalRef): Goal => {
    if (!current) throw new GoalError("no_goal", "there is no current goal");
    if (ref.id !== current.id || ref.revision !== current.revision) {
      throw new GoalError("stale", `goal changed (current revision ${current.revision}); read it again`);
    }
    return current;
  };

  const commit = async (op: GoalOp, goal: Goal | null, cleared?: GoalRef) => {
    await store.append({ op, goal, ...(cleared ? { cleared } : {}), at: now() });
    current = goal;
    for (const l of listeners) {
      try {
        l(goal, op);
      } catch {
        /* 监听器失败不影响状态 */
      }
    }
  };

  const transition = (op: Exclude<GoalOp, "create" | "clear" | "edit">, ref: GoalRef, extra: Partial<Goal> = {}) =>
    serial(async () => {
      const g = requireRef(ref);
      const to = NEXT[op][g.phase];
      if (!to) throw new GoalError("invalid_transition", `cannot ${op} a ${g.phase} goal`);
      if (op === "round" && g.roundsStarted >= g.maxRounds) throw new GoalError("invalid_transition", "round limit reached");
      if (op === "resume" && g.roundsStarted >= g.maxRounds) {
        throw new GoalError("invalid_transition", "round limit reached; raise maxRounds with edit before resuming");
      }
      const { blocker: _old, ...rest } = g;
      const next: Goal = {
        ...(op === "block" ? g : rest),
        ...extra,
        phase: to,
        revision: g.revision + 1,
        roundsStarted: op === "round" ? g.roundsStarted + 1 : g.roundsStarted,
        updatedAt: now(),
      };
      await commit(op, next);
      return next;
    });

  return {
    get: () => current,
    create: (input) =>
      serial(async () => {
        if (current && current.phase !== "complete") {
          throw new GoalError("goal_exists", "finish, pause or clear the current goal before creating another");
        }
        const t = now();
        const goal: Goal = {
          id: newId("goal_"),
          revision: 1,
          objective: checkObjective(input.objective),
          phase: "active",
          roundsStarted: 0,
          maxRounds: input.maxRounds === undefined ? defaultMax : checkMaxRounds(input.maxRounds),
          createdAt: t,
          updatedAt: t,
        };
        await commit("create", goal);
        return goal;
      }),
    edit: (ref, patch) =>
      serial(async () => {
        const g = requireRef(ref);
        if (g.phase === "complete") throw new GoalError("invalid_transition", "cannot edit a complete goal");
        const maxRounds = patch.maxRounds === undefined ? g.maxRounds : checkMaxRounds(patch.maxRounds);
        if (maxRounds < g.roundsStarted) throw new GoalError("invalid_input", `maxRounds is below the ${g.roundsStarted} rounds already started`);
        const next: Goal = {
          ...g,
          objective: patch.objective === undefined ? g.objective : checkObjective(patch.objective),
          maxRounds,
          revision: g.revision + 1,
          updatedAt: now(),
        };
        await commit("edit", next);
        return next;
      }),
    pause: (ref) => transition("pause", ref),
    resume: (ref) => transition("resume", ref),
    complete: (ref) => transition("complete", ref),
    block: (ref, blocker) => transition("block", ref, { blocker: { code: blocker.code, reason: String(blocker.reason).slice(0, 2000) } }),
    admitRound: (ref) => transition("round", ref),
    clear: (ref) =>
      serial(async () => {
        const g = requireRef(ref);
        await commit("clear", null, { id: g.id, revision: g.revision + 1 });
      }),
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** 存在内存里的 GoalStore（测试、浏览器） */
export function memoryGoalStore(initial: GoalRecord[] = []): GoalStore & { records: GoalRecord[] } {
  const records = [...initial];
  return {
    records,
    load: async () => [...records],
    append: async (r) => void records.push(structuredClone(r)),
  };
}

// ── 每一轮的提示词（照搬 dsh 的 goal-round-driver） ─────────────────────────

export const GOAL_ROUND_TAG = "goal_round";

export function renderGoalRoundPrompt(goal: Goal, round: number): string {
  return (
    `<${GOAL_ROUND_TAG}>\n` +
    `Objective: ${JSON.stringify(goal.objective)}\n` +
    `Round: ${round}/${goal.maxRounds}\n\n` +
    "Continue working toward the objective in this same session. Treat the current workspace, " +
    "tool results, and durable session state as authoritative; inspect them instead of assuming " +
    "earlier narration is still current. Make concrete progress and verify the result. Before " +
    "claiming completion, gather evidence that the whole objective is achieved, read the current " +
    "goal with get_goal, and mark it complete with update_goal. If work remains, leave the goal active " +
    "for the next round. Only report blocked after the same obstacle has persisted for several consecutive rounds.\n" +
    `</${GOAL_ROUND_TAG}>`
  );
}

/** 消息是不是驱动生成的目标轮次提示（界面据此显示成"第 N 轮"而不是整段提示词） */
export function parseGoalRoundMessage(m: Message): { round: number; maxRounds: number; objective: string } | null {
  if (m.role !== "user") return null;
  const text = m.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  if (!text.startsWith(`<${GOAL_ROUND_TAG}>`)) return null;
  const round = /Round: (\d+)\/(\d+)/.exec(text);
  const obj = /Objective: (.*)\n/.exec(text);
  let objective = "";
  try {
    objective = obj ? (JSON.parse(obj[1]!) as string) : "";
  } catch {
    /* 保留空 */
  }
  return round ? { round: Number(round[1]), maxRounds: Number(round[2]), objective } : null;
}

// ── 模型工具 ──────────────────────────────────────────────────────────────

/** 给模型看的目标视图（紧凑 JSON） */
function goalView(g: Goal | null) {
  if (!g) return { goal: null };
  return {
    goal: {
      objective: g.objective,
      phase: g.phase,
      round: g.roundsStarted,
      maxRounds: g.maxRounds,
      ...(g.blocker ? { blocker: g.blocker } : {}),
    },
  };
}

export interface GoalToolsState {
  /** 本轮对应的目标 id（驱动设置）；不在目标轮次中时为 undefined，此时 update_goal 拒绝 */
  goalId?: string;
  /** 本轮是否尝试过报告 blocked（驱动据此计算连续轮数） */
  blockedAttempted: boolean;
  /** 截至本轮（含）连续尝试报告 blocked 的轮数 */
  blockedStreak: number;
}

/**
 * 模型的目标工具：get_goal、update_goal（complete / blocked）。
 * 创建、编辑、暂停、恢复、清除只给用户，不在这里。
 * blocked 要求同一障碍连续 blockedAfter 轮（默认 3），之前的尝试会被拒绝（dsh 的规则）。
 */
export function goalTools(goals: GoalController, state: GoalToolsState, opts: { blockedAfter?: number } = {}): AnyTool[] {
  const blockedAfter = opts.blockedAfter ?? 3;
  return [
    defineTool({
      name: "get_goal",
      description: "Read the current long-running goal of this session (objective, phase, round, maxRounds).",
      input: z.object({}),
      execute: () => ({ content: JSON.stringify(goalView(goals.get())) }),
    }),
    defineTool({
      name: "update_goal",
      description:
        "Mark the current goal complete once the whole objective is achieved and verified, or report it blocked " +
        `when the same obstacle has persisted for ${blockedAfter} consecutive rounds. Only usable inside a goal round.`,
      input: z.object({
        action: z.enum(["complete", "blocked"]),
        reason: z.string().describe("Required for blocked: what is blocking and what was tried").optional(),
      }),
      execute: async ({ action, reason }) => {
        const g = goals.get();
        if (!state.goalId || !g || g.id !== state.goalId) return { content: "No goal round is active.", isError: true };
        if (g.phase !== "active") return { content: `The goal is ${g.phase}; nothing to update.`, isError: true };
        const ref = { id: g.id, revision: g.revision };
        if (action === "complete") {
          await goals.complete(ref);
          return { content: "Goal marked complete. Now write a short final message to the user: what was done and the evidence it is complete." };
        }
        if (!reason?.trim()) return { content: "blocked requires a reason.", isError: true };
        if (!state.blockedAttempted) {
          state.blockedAttempted = true;
          state.blockedStreak += 1;
        }
        if (state.blockedStreak < blockedAfter) {
          return {
            content:
              `Not reported: blocked needs the same obstacle in ${blockedAfter} consecutive rounds (this is ${state.blockedStreak}). ` +
              "Try a different approach this round; if it is still blocked next round, report again.",
            isError: true,
          };
        }
        await goals.block(ref, { code: "model-reported", reason });
        return { content: "Goal marked blocked. Now write a short final message to the user explaining the blocker and what is needed." };
      },
    }),
  ];
}

// ── 续行驱动 ──────────────────────────────────────────────────────────────

export const UNATTENDED_APPROVAL_MESSAGE =
  "This tool needs user approval, but goal rounds run unattended, so it was not run. Find another way, or report blocked if this tool is essential.";

export type GoalRunEndReason = "complete" | "blocked" | "paused" | "cleared" | "not-active" | "error" | "aborted";

export interface GoalRunResult {
  reason: GoalRunEndReason;
  goal: Goal | null;
  transcript: Message[];
  usage: Usage;
  rounds: number;
}

export interface RunGoalOptions<Ctx = unknown> extends Omit<RunOptions<Ctx>, "messages" | "approval"> {
  /** 当前会话的 transcript */
  messages: Message[];
  goals: GoalController;
  /** 连续多少轮才允许报告 blocked，默认 3 */
  blockedAfter?: number;
  /** 每一轮开始时回调这一轮的 RunHandle（server 用来转发插话 / 排队 / 中止） */
  onRound?(handle: RunHandle, round: number): void;
}

export interface GoalRunHandle extends AsyncIterable<AgentEvent> {
  result: Promise<GoalRunResult>;
  /** pause：中止当前轮并暂停目标；abort：中止当前轮并结束（目标同样暂停，不会自己再起） */
  stop(kind?: "pause" | "abort"): void;
  /** 当前轮的句柄（插话、排队用） */
  current(): RunHandle | undefined;
}

/**
 * 把 active 的目标变成连续多轮运行：每轮追加一条 <goal_round> 用户消息再 run()，
 * 直到目标完成 / 卡住 / 暂停 / 清除、轮数用完或出错。
 * 事件：每轮 run() 的全部事件；另外发 custom 事件 goal（目标快照）和 goal_round（{ round, message }）。
 * 需要审批的工具在目标轮次里一律拒绝（无人值守）。
 */
export function runGoal<Ctx = unknown>(opts: RunGoalOptions<Ctx>): GoalRunHandle {
  const channel = new EventChannel<AgentEvent>();
  const { goals, blockedAfter, onRound, messages, ...runOpts } = opts;
  let stopKind: "pause" | "abort" | undefined;
  let currentHandle: RunHandle | undefined;
  const toolsState: GoalToolsState = { blockedAttempted: false, blockedStreak: 0 };
  const unsubscribe = goals.subscribe((goal) => channel.push({ type: "custom", name: "goal", data: goal }));

  const persist = async (m: Message) => {
    if (runOpts.persist) await runOpts.persist({ kind: "append", message: m });
  };
  const safely = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch {
      /* 目标已被别处改动，或写盘失败：按当前状态结束 */
    }
  };
  const refOf = (g: Goal): GoalRef => ({ id: g.id, revision: g.revision });

  const result = (async (): Promise<GoalRunResult> => {
    let transcript = [...messages];
    let usage = emptyUsage();
    let rounds = 0;
    const end = (reason: GoalRunEndReason): GoalRunResult => ({ reason, goal: goals.get(), transcript, usage, rounds });
    try {
      for (;;) {
        const g = goals.get();
        if (stopKind) {
          if (g?.phase === "active") await safely(() => goals.pause(refOf(g)));
          return end(stopKind === "abort" ? "aborted" : "paused");
        }
        if (!g) return end(rounds ? "cleared" : "not-active");
        if (g.phase === "complete") return end("complete");
        if (g.phase === "blocked") return end("blocked");
        if (g.phase === "paused") return end("paused");
        if (g.roundsStarted >= g.maxRounds) {
          await safely(() => goals.block(refOf(g), { code: "round-limit", reason: `Used all ${g.maxRounds} rounds.` }));
          return end("blocked");
        }

        const admitted = await goals.admitRound(refOf(g));
        rounds++;
        const message: Message = { id: newId("msg_"), role: "user", content: [{ type: "text", text: renderGoalRoundPrompt(admitted, admitted.roundsStarted) }] };
        await persist(message);
        transcript.push(message);
        channel.push({ type: "custom", name: "goal_round", data: { round: admitted.roundsStarted, message } });

        toolsState.goalId = admitted.id;
        toolsState.blockedAttempted = false;
        const handle = run({
          ...runOpts,
          messages: transcript,
          tools: [...(runOpts.tools ?? []), ...goalTools(goals, toolsState, blockedAfter === undefined ? {} : { blockedAfter })],
          approval: { policy: "never", neverMessage: UNATTENDED_APPROVAL_MESSAGE },
        } as RunOptions<Ctx>);
        currentHandle = handle;
        onRound?.(handle, admitted.roundsStarted);
        if (stopKind) handle.abort("goal stopped");
        for await (const e of handle) channel.push(e);
        const r = await handle.result;
        currentHandle = undefined;
        if (r.transcript.length) transcript = r.transcript;
        usage = addUsage(usage, r.usage);
        if (!toolsState.blockedAttempted) toolsState.blockedStreak = 0;

        if (r.reason === "aborted") {
          // 用户取消当前轮次：目标暂停，不会立刻再起一轮（dsh 的规则）
          const now = goals.get();
          if (now?.phase === "active") await safely(() => goals.pause(refOf(now)));
          return end(stopKind === "abort" ? "aborted" : "paused");
        }
        if (r.reason === "error" || r.reason === "refusal" || r.reason === "awaiting_approval") {
          const now = goals.get();
          const reason = r.reason === "error" ? `Run failed (${r.error?.kind ?? "unknown"})` : `Run ended: ${r.reason}`;
          if (now?.phase === "active") await safely(() => goals.block(refOf(now), { code: "error", reason }));
          return end("error");
        }
        // completed / max_steps / stop_condition：看目标状态决定是否下一轮
      }
    } catch (e) {
      // 写盘失败等：停在当前状态
      channel.push({ type: "error", error: { kind: "goal", message: e instanceof Error ? e.message : String(e), retryable: false } });
      return end("error");
    } finally {
      unsubscribe();
      channel.close();
    }
  })();

  return {
    result,
    stop(kind = "pause") {
      stopKind ??= kind;
      currentHandle?.abort(`goal ${kind}`);
    },
    current: () => currentHandle,
    [Symbol.asyncIterator]: () => channel[Symbol.asyncIterator](),
  };
}
