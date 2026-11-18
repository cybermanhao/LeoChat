# 会话收件箱（harness 第三期）

**日期：** 2026-11-17
**状态：** 已完成（2026-11-17）
**参考：** dsh `packages/core/agent-loop`（`src/inbox.ts`、`src/agent.ts`）、`packages/goal/goal-round-driver`、`packages/interaction/permission-presets`；Anthropic《Building always-on agents》（2026-11-13）；用户的 asset-manager（events + acked_at，只作参照）

## 1. 为什么改

现在一个会话的输入走四条路：普通运行（`POST /runs`，响应即事件流）、插话 / 排队（`/runs/:id/steer|follow-up`）、目标驱动（`/goal/run`，自己循环多轮）、定时提醒（调度器直接开运行，再从 `/watch` 推出去）。结果：

- 会话忙时普通消息 409、提醒 30 秒后重试、目标两轮之间的提醒要重试；
- 输入只在内存里：进程退出时排队中的消息和插话会丢；
- 浏览器要同时管三种流（运行、目标、watch），中途连上会缺当前这一步已输出的内容。

文章与 dsh 的共同结论：**所有输入先写进一个持久的收件箱，每个会话只有一个处理者按顺序取出来跑。**

## 2. 做法（照 dsh）

### 2.1 收件箱

- 每个会话一个收件箱，记录写在会话自己的 JSONL 日志里（`{ t: "inbox", op, ... }`），回放得到待处理内容。
- 两个列表（dsh 的 `next-turn` / `next-step`）：
  - **排队（next-turn）**：下一轮的提示——用户消息、定时提醒、目标的下一轮提示。
  - **插话（next-step）**：送进正在运行的这一轮，在下一个步骤边界生效。
- 每条：`{ id, message, source: user | reminder | goal, settings? }`。领取（claimed）或丢弃（discarded）时写一条移除记录。
- 先写盘再生效：`POST` 一条消息只是写进收件箱，立刻返回。

### 2.2 处理者（每个会话一个）

- 空闲且有排队项：开始新的一轮。领取全部插话 + 一条排队提示（dsh：每轮一条），写进 transcript，`run()`。
- 运行中来了插话：交给当前运行的 `steer()`；送达时（core 的 `user_message` 事件）记为已领取。运行结束仍未送达的插话留在收件箱，下一轮领取。
- 运行中来了排队项：留在收件箱，这一轮结束后处理。
- 停止（Esc / 停止按钮）：中止当前运行并**清空**待处理项（dsh `cancel()` 默认不保留收件箱）。
- 进程重启：启动时检查各会话的收件箱，有排队项就继续处理（用户和提醒的输入不丢）。目标不会自己恢复（见 2.4）。

### 2.3 事件流

- 每个会话一条流 `GET /conversations/:id/events`，推送这个会话的所有运行（不论由谁发起）。
- 连上时先补发：当前状态（空闲 / 运行中）、收件箱、目标，以及**当前这一轮已经发生的全部事件**，所以中途连上不再缺内容。
- 浏览器断线后重新读会话再连上（asset-manager 的做法：服务端是权威，推送只用于实时显示）。

### 2.4 目标（dsh 的 goal-round-driver）

- 目标本身不变（core `goalController`）。"允许自动续行"（armed）只在进程内，重启后不会自己继续。
- 处理者空闲、收件箱为空、目标 active 且 armed、还有轮数时：往收件箱放一条 `<goal_round>` 提示（source goal），按普通排队项处理。所以**用户消息永远优先**，目标轮次在用户消息之后才继续（dsh：人类输入到达时自动轮次让路）。
- 目标轮次的工具：加上 `get_goal` / `update_goal`；审批按权限预设（见 2.6）。
- 用户停止一个目标轮次：目标暂停（dsh）；停止的不是目标轮次：只解除 armed。
- 命令行（`@leochat/cli`）不经过 server，继续用 core 的 `runGoal()`。

### 2.5 定时提醒

调度器到期时只往收件箱放一条排队项（source reminder），不再自己开运行，也不会因为忙而失败。

### 2.6 权限预设（dsh 的 permission-presets，去掉沙箱）

- **询问**（默认）：需要审批的工具（bash）弹审批；目标轮次（无人值守）拒绝（第二期决定 2A）。
- **完全信任**：不再询问，目标轮次也直接执行（dsh 的 `danger-full-access`）。
- 沙箱（dsh 的 `workspace-write`：只能写工作区、不用审批）以后再做；Windows 上 dsh 用 ACL 受限写入。

## 3. 接口变化

| 新 | 取代 |
|---|---|
| `POST /conversations/:id/messages { text, target, settings }` | `POST /conversations/:id/runs`、`/runs/:id/steer`、`/runs/:id/follow-up` |
| `DELETE /conversations/:id/inbox/:itemId` | （新增：撤回排队中的消息） |
| `POST /conversations/:id/stop` | `/runs/:id/abort` |
| `GET /conversations/:id/events` | 运行响应流、`/goal/run`、`/watch` |
| `POST /conversations/:id/goal`（创建并开始）、`PATCH .../goal`（暂停 / 继续 / 编辑 / 完成 / 清除） | `/goal/run` |

## 4. 不做

- 审批暂缓（文章的 deferred tool call）：dsh 的 `ask` 是一直等到有人回答；我们保留现在的 60 秒超时拒绝，以后再改成暂缓。
- 学到的记忆：dsh 没有，只有指令文件（我们的系统提示面板对应）。

## 5. 结果

| 部分 | 提交 |
|---|---|
| node：会话日志里的收件箱记录（插入 / 领取 / 丢弃）与回放 | `9f00f3a` |
| core：审批策略 `allow`（完全信任，不发审批请求） | `9a1c2b6` |
| server：每个会话一个处理者（`conversation-agent.ts`）、新接口、目标改为收件箱的生产者、提醒写进收件箱、权限预设 | `9a1c2b6` |
| server：事件流以 reset（这一轮开始前的 transcript）开头，中途连上不重复 | `f86d251` |
| web：每个打开的会话一条事件流、收件箱栏（可撤回）、权限开关 | `8226580` |

测试中发现并修复：
- 停止时先中止、后清空收件箱，被中止的这一轮结束后会立刻跑下一条排队消息 → 改为在处理者的串行队列里先清空再中止。
- 同一进程里两个 conversationLog 实例共用同名临时文件，互相 rename 掉（调度器同样）→ 临时文件名加随机后缀。
- 目标刚开始新的一轮时点"暂停"，revision 过期被拒，目标继续跑 → 暂停 / 继续 / 完成 / 清除在过期时重新读取并重试一次（编辑不重试）。

验证：core 99、node 25、server 27、web 16、cli 6 个测试；真实模型端到端 16 个连续两轮全部通过（含排队与撤回、完全信任下 bash 不弹审批、目标暂停与继续、定时提醒实时送达）。

仍未做（见第 4 节）：审批暂缓、学到的记忆、沙箱。
