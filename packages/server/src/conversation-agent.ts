/**
 * 每个会话一个处理者（参考 dsh 的 agent-loop 与 goal-round-driver；设计：docs/superpowers/specs/2026-11-17-conversation-inbox-design.md）。
 *
 * - 所有输入先写进会话的收件箱（@leochat/node conversationLog 的 inbox 记录），再由处理者按顺序取出来跑
 * - 空闲时：领取全部插话（next-step）+ 一条排队提示（next-turn），开始新的一轮
 * - 运行中：插话交给当前运行的 steer()，送达时记为已领取；排队项留到这一轮结束
 * - 目标：处理者空闲、收件箱为空、目标 active 且 armed 时，往收件箱放一条 <goal_round> 提示（用户消息永远优先）
 * - 停止：中止当前运行并清空收件箱（dsh 的 cancel() 默认不保留收件箱）；停止的是目标轮次则暂停目标
 * - 事件：推给所有订阅者；新订阅者先收到状态、收件箱、目标，以及当前这一轮已经发生的全部事件
 */
import {
  goalTools,
  newId,
  renderGoalRoundPrompt,
  run,
  UNATTENDED_APPROVAL_MESSAGE,
  type AgentEvent,
  type AnyTool,
  type ApprovalConfig,
  type Goal,
  type GoalController,
  type GoalToolsState,
  type Message,
  type RunHandle,
  type RunOptions,
} from "@leochat/core";
import type { ConversationLog, InboxItem, InboxSource, InboxState, InboxTarget } from "@leochat/node";

/** 发给客户端的收件箱视图 */
export interface InboxView {
  nextTurn: Array<{ id: string; source: InboxSource; text: string }>;
  nextStep: Array<{ id: string; source: InboxSource; text: string }>;
}

export interface TurnSetup {
  /** run() 的选项（provider、model、tools……），不含 messages / approval / persist */
  options: Omit<RunOptions, "messages" | "approval" | "persist">;
  approval: ApprovalConfig;
  /** 把事件转成发给客户端的形式（隐去上游错误等） */
  publicEvent(e: AgentEvent): AgentEvent;
}

export interface AgentDeps<S> {
  id: string;
  log: ConversationLog;
  goals: () => Promise<GoalController>;
  /** 用一条输入的设置准备这一轮；source 为 goal 时是无人值守的目标轮次 */
  setup(settings: S | undefined, source: InboxSource, extraTools: AnyTool[]): Promise<TurnSetup>;
  /** 设置不合法等：这条输入无法运行时的说明（仍会被领取，避免卡住收件箱） */
  onTurnError?(error: unknown): void;
}

const textOf = (m: Message) =>
  m.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("")
    .slice(0, 300);

export class ConversationAgent<S = unknown> {
  private running: { handle: RunHandle; source: InboxSource; goalId?: string } | null = null;
  /** 当前这一轮已发生的事件（中途连上的客户端用） */
  private buffer: AgentEvent[] = [];
  /** 当前这一轮开始前的 transcript：中途连上的客户端从这里重建视图，再回放 buffer（不会重复） */
  private base: Message[] = [];
  private readonly subscribers = new Set<(e: AgentEvent) => void>();
  /** 已交给当前运行、等待送达的插话：message id → inbox item id */
  private readonly steering = new Map<string, string>();
  private armed = false;
  private goalSettings: S | undefined;
  private lastSettings: S | undefined;
  private readonly goalToolsState: GoalToolsState = { blockedAttempted: false, blockedStreak: 0 };
  private queue: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private disposed = false;

  constructor(private readonly deps: AgentDeps<S>) {}

  get isRunning(): boolean {
    return this.running !== null;
  }
  get isArmed(): boolean {
    return this.armed;
  }

  /** 同一个会话的状态变更按顺序执行 */
  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.queue.then(fn, fn);
    this.queue = p.catch(() => {});
    return p;
  }

  subscribe(fn: (e: AgentEvent) => void): () => void {
    this.subscribers.add(fn);
    return () => this.subscribers.delete(fn);
  }

  /**
   * 新订阅者需要的快照：reset（重建视图用的 transcript：运行中是这一轮开始前的，空闲时是全部）、
   * 状态、收件箱、目标、当前这一轮已发生的事件
   */
  async snapshot(): Promise<AgentEvent[]> {
    const conv = await this.deps.log.load(this.deps.id);
    const goal = (await this.deps.goals()).get();
    const running = this.running !== null;
    return [
      { type: "custom", name: "reset", data: { transcript: running ? this.base : (conv?.transcript ?? []) } },
      this.statusEvent(),
      { type: "custom", name: "inbox", data: conv ? this.inboxView(conv.inbox) : { nextTurn: [], nextStep: [] } },
      this.goalEvent(goal),
      ...this.buffer,
    ];
  }

  private emit(e: AgentEvent, buffered = true) {
    if (buffered && this.running) this.buffer.push(e);
    for (const fn of this.subscribers) {
      try {
        fn(e);
      } catch {
        /* 订阅者自己的问题 */
      }
    }
  }
  private statusEvent(): AgentEvent {
    return { type: "custom", name: "agent", data: { running: this.running !== null, source: this.running?.source ?? null } };
  }
  private goalEvent(goal: Goal | null): AgentEvent {
    return { type: "custom", name: "goal", data: goal ? { ...goal, armed: this.armed } : null };
  }
  private inboxView(inbox: InboxState): InboxView {
    const v = (x: InboxItem) => ({ id: x.id, source: x.source, text: textOf(x.message) });
    return { nextTurn: inbox["next-turn"].map(v), nextStep: inbox["next-step"].map(v) };
  }
  private async emitInbox() {
    const conv = await this.deps.log.load(this.deps.id);
    if (conv) this.emit({ type: "custom", name: "inbox", data: this.inboxView(conv.inbox) }, false);
  }
  async emitGoal() {
    this.emit(this.goalEvent((await this.deps.goals()).get()), false);
  }

  /** 放进收件箱（先写盘）；运行中的插话立刻交给当前运行 */
  async insert(target: InboxTarget, message: Message, source: InboxSource, settings?: S): Promise<InboxItem<S>> {
    const item: InboxItem<S> = { id: newId("in_"), message, source, ...(settings !== undefined ? { settings } : {}), at: Date.now() };
    await this.deps.log.inboxInsert(this.deps.id, target, item);
    this.stopped = false;
    await this.emitInbox();
    const cur = this.running;
    if (target === "next-step" && cur) {
      this.steering.set(message.id, item.id);
      void cur.handle.steer(message); // 没送达（这一轮已结束）就留在收件箱，下一轮领取
    }
    this.kick();
    return item;
  }

  /** 撤回一条待处理的输入 */
  async discard(itemId: string): Promise<boolean> {
    const conv = await this.deps.log.load(this.deps.id);
    if (!conv) return false;
    const pending = [...conv.inbox["next-turn"], ...conv.inbox["next-step"]].some((x) => x.id === itemId);
    if (!pending) return false;
    await this.deps.log.inboxRemove(this.deps.id, [itemId], "discarded");
    await this.emitInbox();
    return true;
  }

  /** 开始 / 继续自动推进目标（进程内，重启后不保留） */
  arm(settings: S | undefined) {
    this.armed = true;
    this.stopped = false;
    this.goalSettings = settings;
    void this.emitGoal();
    this.kick();
  }

  /** 停止自动推进；abortRound 时同时中止正在跑的目标轮次 */
  disarm(abortRound = false) {
    this.armed = false;
    if (abortRound && this.running?.source === "goal") this.running.handle.abort("goal paused");
    void this.emitGoal();
  }

  /** 停止：中止当前运行，清空收件箱；停止的是目标轮次则暂停目标 */
  async stop(): Promise<void> {
    // 在串行队列里先清空收件箱、再中止：被中止的这一轮结束后，处理者看到的已经是空收件箱
    await this.serial(async () => {
      this.stopped = true;
      const cur = this.running;
      if (cur?.source !== "goal") this.armed = false; // dsh：与目标无关的取消只解除续行
      const conv = await this.deps.log.load(this.deps.id);
      if (conv) {
        const ids = [...conv.inbox["next-turn"], ...conv.inbox["next-step"]].map((x) => x.id);
        await this.deps.log.inboxRemove(this.deps.id, ids, "discarded");
      }
      this.steering.clear();
      cur?.handle.abort("user");
    });
    await this.emitInbox();
    await this.emitGoal();
  }

  dispose() {
    this.disposed = true;
    this.running?.handle.abort("conversation deleted");
    this.subscribers.clear();
  }

  /** 有事可做就开始下一轮（已在运行则什么也不做） */
  kick() {
    void this.serial(async () => {
      while (!this.running && !this.disposed) {
        const started = await this.startTurn();
        if (!started) return;
        // startTurn 返回运行句柄后，这里不等待；运行结束时会再 kick
        return;
      }
    });
  }

  /** 领取输入并开始一轮；没有可做的事返回 false */
  private async startTurn(): Promise<boolean> {
    const { id, log } = this.deps;
    let conv = await log.load(id);
    if (!conv) return false;

    // 收件箱空了：目标驱动（dsh goal-round-driver）在空闲时补一条目标轮次提示
    if (!conv.inbox["next-turn"].length && !conv.inbox["next-step"].length) {
      if (!this.armed || this.stopped) return false;
      const goals = await this.deps.goals();
      const g = goals.get();
      if (!g || g.phase !== "active") {
        this.armed = false;
        await this.emitGoal();
        return false;
      }
      if (g.roundsStarted >= g.maxRounds) {
        await goals.block({ id: g.id, revision: g.revision }, { code: "round-limit", reason: `Used all ${g.maxRounds} rounds.` }).catch(() => {});
        this.armed = false;
        await this.emitGoal();
        return false;
      }
      const admitted = await goals.admitRound({ id: g.id, revision: g.revision });
      const message: Message = { id: newId("msg_"), role: "user", content: [{ type: "text", text: renderGoalRoundPrompt(admitted, admitted.roundsStarted) }] };
      const item: InboxItem<S> = { id: newId("in_"), message, source: "goal", ...(this.goalSettings !== undefined ? { settings: this.goalSettings } : {}), at: Date.now() };
      await log.inboxInsert(id, "next-turn", item);
      await this.emitGoal();
      conv = (await log.load(id))!;
    }

    // 领取：全部插话 + 一条排队提示
    const steps = conv.inbox["next-step"] as InboxItem<S>[];
    const turn = conv.inbox["next-turn"][0] as InboxItem<S> | undefined;
    const claimed = [...steps, ...(turn ? [turn] : [])];
    await log.inboxRemove(id, claimed.map((x) => x.id), "claimed");
    for (const x of claimed) await log.append(id, { kind: "append", message: x.message });
    await this.emitInbox();

    const source: InboxSource = turn?.source ?? "user";
    const settings = turn?.settings ?? this.lastSettings;
    if (source !== "goal" && settings !== undefined) this.lastSettings = settings;

    let setup: TurnSetup;
    let goalId: string | undefined;
    const extra: AnyTool[] = [];
    try {
      if (source === "goal") {
        const goals = await this.deps.goals();
        goalId = goals.get()?.id;
        this.goalToolsState.goalId = goalId;
        this.goalToolsState.blockedAttempted = false;
        extra.push(...goalTools(goals, this.goalToolsState));
      }
      setup = await this.deps.setup(settings, source, extra);
    } catch (e) {
      this.deps.onTurnError?.(e);
      return this.startTurn();
    }

    this.base = conv.transcript;
    const handle = run({
      ...setup.options,
      messages: [...conv.transcript, ...claimed.map((x) => x.message)],
      approval: setup.approval,
      persist: log.persistFor(id),
    });
    this.running = { handle, source, ...(goalId ? { goalId } : {}) };
    this.buffer = [];
    this.emit(this.statusEvent());
    // 被领取的输入先作为用户消息出现在客户端视图里
    for (const x of claimed) this.emit({ type: "user_message", message: x.message, via: "followUp" });
    if (source === "goal") this.emit({ type: "custom", name: "goal_round", data: { message: turn!.message } });

    void (async () => {
      for await (const e of handle) {
        if (e.type === "user_message" && e.via === "steer") {
          const itemId = this.steering.get(e.message.id);
          if (itemId) {
            this.steering.delete(e.message.id);
            await log.inboxRemove(id, [itemId], "claimed").catch(() => {});
            await this.emitInbox();
          }
        }
        this.emit(setup.publicEvent(e));
      }
      const r = await handle.result;
      if (source === "goal") await this.afterGoalRound(r.reason, r.error?.kind);
      this.running = null;
      this.buffer = [];
      this.emit(this.statusEvent());
      this.kick();
    })();
    return true;
  }

  /** 目标轮次结束后（dsh goal-round-driver）：取消 → 暂停；出错 → 卡住；其它看目标状态 */
  private async afterGoalRound(reason: string, errorKind?: string) {
    const goals = await this.deps.goals();
    const g = goals.get();
    if (!this.goalToolsState.blockedAttempted) this.goalToolsState.blockedStreak = 0;
    if (g?.phase === "active") {
      const ref = { id: g.id, revision: g.revision };
      if (reason === "aborted") {
        await goals.pause(ref).catch(() => {});
        this.armed = false;
      } else if (reason === "error" || reason === "refusal" || reason === "awaiting_approval") {
        await goals
          .block(ref, { code: "error", reason: reason === "error" ? `Run failed (${errorKind ?? "unknown"})` : `Run ended: ${reason}` })
          .catch(() => {});
        this.armed = false;
      }
    } else {
      this.armed = false; // 完成 / 卡住 / 暂停 / 清除：不再续行
    }
    await this.emitGoal();
  }
}

/** 无人值守（目标轮次）的审批：询问模式下一律拒绝，完全信任时直接允许 */
export function unattendedApproval(fullAccess: boolean): ApprovalConfig {
  return fullAccess ? { policy: "allow" } : { policy: "never", neverMessage: UNATTENDED_APPROVAL_MESSAGE };
}
