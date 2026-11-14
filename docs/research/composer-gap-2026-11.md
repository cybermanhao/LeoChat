# 输入框（composer）差距分析：LeoChat vs dsh vs Codex

> 2026-11-14 整理。状态：分析完成，还没开始改。决策点见文末。

## LeoChat 现状（`packages/ui/src/components/chat-input.tsx`）

| 问题 | 位置 | 后果 |
|---|---|---|
| 回车前不检查输入法是否正在组字 | `handleKeyDown` 只判断 `Enter && !shiftKey` | 中文拼音选词时按回车会直接发送 |
| 运行中禁用输入框 | `disabled={disabled \|\| isBusy}` | 运行时不能输入，没有插话或排队；很可能是之前 sendMessage 竞态、审批横幅 bug 的根源 |
| 附件、语音按钮没有接功能 | `Paperclip`、`Mic` 没有 onClick | 点了没反应 |
| 工具栏空壳按钮 | `chat-toolbar.tsx` 的 `onImageGenClick`、`onWebSearchClick` 等 | 同上 |
| 没有 `/` 命令和 `@` 引用 | — | 功能入口只在工具栏 |
| 草稿不保存 | 草稿是一个 string prop | 切换会话或刷新后丢失 |
| 没有上下文用量显示 | — | compact 的状态用户看不到 |

## 参考对象

**dsh**（`deepseek-harness/packages/client/ui-conversation`、`ui-input-trigger`、`ui-commands`、`ui-reference`、`ui-attachment`、`ui-goal`）：
- 编辑器用 Lexical，每个会话一个实例；`/` 命令和 `@` 引用显示为整体的标签块（第一次退格选中整块，第二次才删除）；组字期间不显示提示
- 运行中按 Enter 投递为排队还是插话，可以配置；Ctrl/Cmd+Enter 走另一种；排队消息显示在输入框上方的队列区，可以编辑、删除、转成插话
- 乐观提交：按 Enter 立即清空草稿、后台发送，失败时把内容还回输入框
- 发送和停止是同一个按钮，随草稿内容切换；连按两次 Esc 停止
- 每个会话单独保存草稿，刷新后能恢复
- 附件：图片上传；在桌面端，文件和文件夹变成 `@路径` 引用
- 输入框下方有上下文用量圆环；上方有 goal 条和 Todo 区
- 空间不够时，模型选择器缩成图标

**Codex**：运行中 Enter 插话、Tab 排队；排队消息可以编辑、排序、删除；`/` 命令（`/goal`、`/plan`、`/review`、`/status`、`/mcp`…）；`@` 附加文件；Esc 打断；预测下一句话（测试中，不跟进）。

## 分期

- **第 0 期**（不依赖 core，可以直接在 master 上改）：回车前检查组字状态；运行中不禁用输入框；隐藏没有接功能的按钮；连按两次 Esc 停止
- **第 1 期**（跟 core 一起做）：插话和排队（core 已在设计文档里加了 `RunHandle.steer()`）、队列显示区、发送和停止合并、乐观提交、按会话保存草稿
- **第 2 期**：换编辑器，加 `/` 命令和 `@` 引用
- **第 3 期**：附件（DeepSeek Files API，文档走 OCR 选项）、上下文用量圆环、模型选择器放进输入框

## 待决策

1. 编辑器：建议用 Lexical（和 dsh 一致）
2. 运行中按 Enter 的默认行为：建议插话（和 Codex 一致），Ctrl/Cmd+Enter 走另一种，设置里可以对调
3. 第 0 期是否先单独修：建议先修

## 来源

- dsh 源码与 README（本地 `C:\code\deepseek-harness`）
- https://developers.openai.com/codex/cli/slash-commands
- https://releasebot.io/updates/openai/codex
