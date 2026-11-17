# Harness 设计：/goal 与 /loop

**日期：** 2026-11-17
**状态：** 草案，等待用户决定第 5 节的问题
**参考：** deepseek-harness（dsh，本地 `C:\code\deepseek-harness`）的 `packages/goal`、`packages/schedule`；Claude Code 的 `/loop`

## 1. Harness 是什么

到目前为止，LeoChat 的每次运行都是"你发一条消息 → 模型做到停下来 → 等你下一条"。Harness 指的是**让 agent 在没有人逐条发消息的情况下持续工作**的那一层：

| 能力 | 一句话 | 例子 |
|---|---|---|
| `/goal` 目标 | 给一个完成目标，agent 一轮接一轮地推进，直到它确认完成或卡住 | "把这个文件夹里所有合同的到期日整理成表格" |
| `/loop` 定时 | 按时间重复把一条消息送进对话 | "每天早上 9 点汇总一下昨天的邮件" |
| 无人值守的安全 | 没人在场时，危险操作怎么处理、花多少钱封顶 | bash 一律拒绝；超过 $1 停止 |

Harness 不是新的 agent 循环。它是**套在 `run()` 外面的调度器**：决定什么时候再跑一次 `run()`、带什么消息、什么时候停。

## 2. dsh 怎么做

### 2.1 /goal：四个包

| 包 | 职责 |
|---|---|
| `goal` | 每个会话**一个**当前目标。状态：`active`（进行中）/ `paused`（暂停）/ `blocked`（卡住）/ `complete`（完成）。每次变更作为事件追加到会话日志（事件溯源），修改要带 `revision`，旧视图的修改会被拒绝 |
| `tool-goal` | 给模型的工具：`get_goal`、`create_goal`、`update_goal(complete / blocked / ...)` |
| `command-goal` | 给用户的 `/goal` 命令：查看、创建、编辑、暂停、恢复、清除，不消耗模型调用 |
| `goal-round-driver` | 自动续行：agent 空闲、目标 active、还有轮数额度时，送一条 `<goal_round>` 提示进去，开始下一轮 |

关键规则（都值得照搬）：

1. **每轮提示词很短且固定**：目标原文、第几轮 / 上限，以及"以当前工作区和工具结果为准，不要相信之前的叙述；声称完成前先收集证据、读一遍目标，再标记完成"。
2. **完成由模型自己标记**，没有独立评估器。
3. **"卡住"有门槛**：模型要连续 3 轮遇到同一个障碍才能报告 blocked（防止它一遇到困难就放弃）。用户随时可以直接停。
4. **只有用户能创建 / 修改目标**；模型（以及子 agent）只能完成或报告卡住。
5. **轮数上限**（默认 256），用完记为 blocked（`round-limit`）。只算轮数，不算钱和时间。
6. **重启后不会自己继续**：目标状态持久化，但"允许自动续行"只在进程内有效。重启、恢复会话后必须用户明确 resume。
7. **人优先**：用户发的消息会让自动轮次让路；用户取消当前轮次后，目标自动暂停，不会立刻再起一轮。
8. **写盘失败就停**：排下一轮之前先确认持久化成功（和我们已经做的 persist 原则一致）。

### 2.2 /loop：dsh 叫 schedule（定时提醒）

- 种类：一次性、固定间隔、每天、每周、cron（最小 1 分钟）。
- 到期时，以一条 user 消息（`[SCHEDULE REMINDER] ...`）送进**原来那个会话**，就像用户自己发的一样。
- 宿主（我们这里是本地 server / Electron）必须在运行；重启后补发**最近一次**错过的提醒，不会把错过的全部补一遍。
- 模型也有工具可以自己建 / 改 / 删提醒；子 agent 不能。
- 不保证恰好一次（崩溃时可能重复一次）。

Claude Code 的 `/loop` 是同一类东西：按间隔重复一个提示，或者让模型自己决定下次什么时候醒。

### 2.3 dsh 还有、但第一期不做的

后台任务（jobs，长时间命令不阻塞当前轮）、子 agent、工作流脚本、计划模式、todo 列表、bash 沙箱。这些是 harness 的后续能力，放到第 6 节。

## 3. 我们已经有的

GUI 迁移完成后，harness 需要的底座大部分已经在 `@leochat/core` 和 `@leochat/node` 里：

| 需要 | 已有 |
|---|---|
| 一次运行跑到停 | `run()`，带 `stopWhen`（`stepCount` / `costAbove`）、重试、中止 |
| 排队续行 | `followUp()`：本轮结束接着跑排队的消息 |
| 写盘再继续、崩溃不重复执行工具 | `run({ persist })` + `conversationLog`（dsh 同款检查点） |
| 上下文不会爆 | `createCompactor()`（dsh 同款压缩） |
| 无人值守的审批 | 审批策略 `policy: 'never'`（直接拒绝）、应答者链 |
| 花费 | `Usage` + DeepSeek 价格表 `priceUsage`，`costAbove(usd)` |
| 会话 | server 的 `/api/conversations`，每会话一份 JSONL |

缺的是：目标状态和它的持久化、续行调度器、目标工具、定时器、GUI 上的入口和状态显示。

## 4. 方案

### 4.1 目标状态（放在 `@leochat/core`，与运行时无关）

```ts
type GoalPhase = "active" | "paused" | "blocked" | "complete";
interface Goal {
  id: string;
  revision: number;
  objective: string;
  phase: GoalPhase;
  roundsStarted: number;
  maxRounds: number;
  budgetUsd?: number;     // 我们比 dsh 多一个：花费上限
  spentUsd: number;
  blocker?: { code: "model-reported" | "round-limit" | "budget" | "error"; reason: string };
}
```

- 纯函数 `applyGoalChange(goal, change)`，严格校验状态转换和 revision（照搬 dsh 的规则 2.1-4/5）。
- 持久化：作为一种新记录写进会话的 JSONL 日志（`{ t: "goal", change }`），和 transcript 操作在同一个文件里，回放得到当前目标。

### 4.2 目标工具（`@leochat/core` 的工具工厂）

`goalTools(store)` 返回 `get_goal`、`update_goal(complete | blocked)`。`create_goal` / 编辑 / 暂停 / 恢复只给用户（GUI 按钮或 `/goal` 命令），不给模型。`blocked` 要求连续 N 轮（默认 3）。

### 4.3 续行驱动（`@leochat/core` 的 `runGoal()`）

```ts
runGoal({ ...runOptions, goal, store, onRound }) // 返回一个句柄，可 pause / abort
```

循环：目标是 active 且有额度 → 追加 `<goal_round>` 消息 → `run()`（带 `persist`、压缩、`policy` 按决定 2）→ 累计花费 → 读目标状态 → 完成 / 卡住 / 暂停 / 额度用尽就停，否则下一轮。用户插话走现有的 `steer()`；用户取消 → 目标暂停。

和 dsh 一样：**进程重启后不自动继续**，GUI 上显示"目标进行中，已暂停，点继续"。

### 4.4 定时（`@leochat/node`，需要常驻进程）

`scheduler(dir)`：任务存成 JSON（每会话或全局一份），种类：一次性 / 间隔 / 每天 / 每周 / cron。到期时如果会话空闲就开一次运行，消息为 `[定时提醒] <内容>`；会话正在运行就排队（`followUp`）。重启补发最近一次。Electron 里随 server 一起跑。

### 4.5 GUI

- 输入框支持 `/goal <目标>`、`/loop <间隔> <内容>`（这是输入框第 2 期 `/` 命令的第一批）。
- 对话顶部的目标条：目标、第几轮 / 上限、已花费、状态，按钮：暂停 / 继续 / 编辑 / 清除。
- 侧栏或设置里的"定时任务"列表：查看、删除。

## 5. 需要你决定的

### 决定 1：harness 先在哪里跑？
- **A（推荐）：先在 GUI（本地 server / Electron）里。** server 本来就是常驻进程，会话、审批、显示都现成；定时任务也只能在常驻进程里跑。
- B：先做一个新的命令行工具（旧的 `leochat-cli` 已删除），适合脚本和 CI。
- C：两边同时做。core 部分本来就共用，区别只在外壳。

### 决定 2：无人值守时遇到需要审批的工具（比如 bash）怎么办？
- **A（推荐）：目标轮次里一律拒绝，并告诉模型"无人值守，不能执行"。** 最安全；需要 bash 的任务就不适合交给 /goal。
- B：暂停目标，等你回来审批（GUI 显示审批横幅；不在电脑前就一直停着）。
- C：加一个"让另一个模型审查"的自动审批（dsh 的 Auto review）。最灵活，但要多做一层，也多花钱。

### 决定 3：默认额度
- 轮数上限：dsh 默认 256。按量付费下我建议**默认 20 轮**，创建时可以改。
- 花费上限：dsh 没有。我建议**默认 $0.50**（DeepSeek flash 闲时很便宜，20 轮通常远低于这个数），超过就记为 blocked（`budget`）。
- 你觉得这两个默认值合适吗？

### 决定 4：/loop 的语义
- **A（推荐）：照 dsh 的定时提醒。** 到点把一条消息送进原会话，app 必须开着；错过的只补最近一次。
- B：照 Claude Code 的 `/loop`。重复执行一个提示，间隔可以固定，也可以让模型自己决定下次什么时候醒。
- 两者可以都做：A 是基础，B 的"模型自己定时间"可以以后加。

### 决定 5：第一期范围
- **推荐：先做 /goal（4.1–4.3 加 GUI 目标条），/loop 作为第二期。** /goal 更能体现 harness 的价值，而且 /loop 的投递也要复用 /goal 的"空闲时开一轮"逻辑。

## 6. 以后

- bash 沙箱（dsh 在 Windows 上用受限令牌 / ACL）：做完以后，决定 2 才能放开到"允许 bash"。
- 后台任务（长时间命令不阻塞当前轮，完成时通知）。
- 子 agent（把任务分给独立上下文的子 agent）。
- 独立的完成评估器（dsh 也还没有）。
- 命令行外壳（决定 1 选 A 的话）。
