# Image Studio 设计文档

**日期：** 2026-09-12
**状态：** 已批准设计，待实施（不含在本次提交范围内）

## 背景

`feat/image-generation` 分支（4 个月前，落后 master 94 个提交）实现了一版基于 MCP 工具（`generate_image`，经 `leochat-mcp`）的聊天内嵌图片生成功能。重新评估后决定不直接复用该分支：
- master 上"图片生成"目前只是空壳——`chat-toolbar.tsx` 有 `onImageGenClick`/`imageGenEnabled` 的按钮接口，但从未被接线
- master 的 `/proxy/image` 是图片抓取代理（SSRF 防护），与"生成图片"无关，不重叠
- 用户希望改为**独立的图片生成工作台**为主，同时兼顾聊天内嵌交互
- 多轮改图（基于 `thoughtSignature`）的实现路径需要重新评估技术选型（参考 `gemini-imagen-patterns` skill 的当前最佳实践）

## 范围

**In：**
- 独立页面（图片项目列表 + 生成/改图工作区）
- 仅 Gemini 图片生成 API（`gemini-3.1-flash-image-preview` 默认，`gemini-3-pro-image-preview` 可选）
- 新建 REST 接口（`packages/server`），不走 MCP 工具调用路径
- 多轮改图（refine），本地持久化画廊（图片文件 + 生成记录，跨重启可查看历史）
- 两个聊天内嵌接入点（见下）

**Out（本次不做）：**
- Auto-refine / LAAJ 自动评分迭代循环（MCP 参考实现的编排层，工作台是人工交互，不需要自动收敛）
- 多 provider 抽象（只接 Gemini，不预留 OpenRouter 等其它图片模型接口）
- 跨重启的"继续改图"能力（见下方决策记录）

## 核心架构决策

### 决策 1：用 `ai.chats` 内存会话，不做持久化重建

原计划是数据驱动的重建方案：每轮把 `{prompt, imagePath, thoughtSignature}` 存到磁盘，refine 时从磁盘读最近一轮的图片文件和签名，现场拼 3-turn contents 重新发给 Gemini，换来项目能跨应用重启继续改图的能力。

但这里有隐蔽的正确性风险：`thoughtSignature` 在生成时是和"当次请求里那组原封不动的图片字节"绑定的语义上下文。一旦改为从磁盘重新读文件重建 contents，就没法保证文件自上次写入后没被增删改（用户可能在文件系统里手动移动、替换、或用外部工具编辑过）。如果图片内容变了但签名还在，重建出的 3-turn contents 会是"签名说的是 A，图片已经是 A′"——这种不一致不会报错，而是悄悄让模型产生语义漂移，难以排查。

要堵住这个漏洞需要额外做文件完整性校验（存 hash、每次重建前比对，不一致则拒绝信任签名并退化单轮），工作量超出当前目标范围。

**结论：** 用 `@google/genai` 的 `ai.chats`（SDK 自动维护 history 和 `thoughtSignature` 传递），状态只存在 server 本次运行期间的内存里（`Map<projectId, ChatSession>`）。重启后旧项目的"继续改图"能力自然失效——这是一个**干净的失效边界**，而不是悄悄产生错误结果。前端通过 `NO_LIVE_SESSION` 错误码感知，提供"基于当前图重新开始"的恢复路径（把最后一张图当参考图重新 generate，这也是官方文档里签名缺失时的同一套单轮 fallback）。

### 决策 2：服务端落盘用 `~/.leochat/image-studio/`，不依赖 Electron `app.getPath('userData')`

`packages/server` 是独立 Hono 进程，`app.getPath('userData')` 只在 Electron 主进程可用。沿用 law-kb（`~/.leochat-for-law/law.db`）的先例，用 `os.homedir()` 下的 dot 目录，dev 模式和打包模式都适用，不需要额外的 IPC 传参。

### 决策 3：复用已配置的 `google` provider API Key

不单独为工作台配一个 key 输入框，直接用 Settings 里已经配置好的 `google` provider apiKey（和聊天用 Gemini 是同一个 key）。

## 数据模型 / 存储

```
~/.leochat/image-studio/
  <projectId>/
    project.json          # { id, name, model, aspectRatio, imageSize, thinkingLevel, createdAt, updatedAt }
    rounds/
      <roundId>.json        # { id, type: "generate"|"refine", prompt/instruction, createdAt, hasThoughtSignature }
      <roundId>.png          # 图片文件本体
```

图片项目元数据/文件不走聊天用的 Zustand `persist`（localStorage / Electron 文件存储）——那套是给文本状态用的，图片是二进制大文件，且生成发生在服务端，天然适合服务端直接落盘，前端按需 fetch URL 展示。

## REST API（`packages/server`，挂法类似现有 `/api/kb/*`）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/image-studio/projects` | 项目列表 |
| POST | `/api/image-studio/projects` | 新建项目 `{ name }` |
| GET | `/api/image-studio/projects/:id` | 项目详情 + 轮次列表 |
| DELETE | `/api/image-studio/projects/:id` | 删除项目（连带文件） |
| POST | `/api/image-studio/projects/:id/generate` | 首轮生成或重新开始 `{ prompt, refs?, aspectRatio?, imageSize?, thinkingLevel?, model? }`——总是新开一个内存 `ai.chats` 会话 |
| POST | `/api/image-studio/projects/:id/refine` | 续改 `{ instruction }`——要求内存里有该项目的活会话，否则返回 `NO_LIVE_SESSION` |
| GET | `/api/image-studio/projects/:id/rounds/:roundId/image` | 取图片二进制 |

### 输入校验（遵循 CLAUDE.md 后端规范）

- `model`、`aspectRatio`、`imageSize`、`thinkingLevel`：白名单枚举校验
- `prompt`/`instruction`：长度上限；参考图数组大小上限（flash 14 张、pro 11 张，按选中模型分别限制）
- `projectId`/`roundId`：路径穿越校验（禁止 `..`、`/`、`\`，参考 Electron storage 的 `sanitizeStorageKey` 做法）
- Gemini 报错只在服务端 `console.error`，前端只拿到泛化错误 `"Image generation failed"` 或结构化错误码（如 `NO_LIVE_SESSION`）
- generate/refine 接入 `AbortSignal`，客户端断开时取消请求

## 前端结构

- 新页面 `apps/web/src/pages/ImageStudio.tsx`，接入现有路由和侧边导航
  - 左侧：项目列表（新建/重命名/删除）
  - 主区：轮次时间线（缩略图条）+ 选中轮次大图
  - 底部输入栏：首轮是"生成"（prompt + 参考图上传 + 参数面板），之后自动切换为"续改"（instruction 输入框）；命中 `NO_LIVE_SESSION` 时提示"基于当前图重新开始"
- 新增 `apps/web/src/stores/image-studio.ts`：只放 UI 状态（当前选中项目/轮次、loading/error），不存实际数据
- 新增 `apps/web/src/lib/image-studio-api.ts`：封装 REST 调用，写法参考现有 `lib/kbApi.ts`

## 聊天内嵌接入点

1. **聊天 → 工作台**：`chat-toolbar.tsx` 里已存在但从未接线的"图片生成"按钮（`onImageGenClick`/`imageGenEnabled`）接上——打开 Image Studio，并把聊天输入框里已经打的字带过去作为新项目的初始 prompt。不新增 UI 入口，启用现有的悬空按钮。
2. **工作台 → 聊天**：每轮图片下加"发送到对话"按钮，点击后把图片作为附件**插入当前聊天输入框草稿**（不直接发消息），用户可配文字后走正常发送流程。复用现有 `MessageContent.tsx` 对 `type: 'image'` content item 的渲染，直接引用 `/api/image-studio/projects/:id/rounds/:roundId/image` 这个 URL，不重复存一份。

## 测试

- 后端：mock `@google/genai` SDK，测路由校验逻辑（枚举白名单、路径穿越拒绝、`NO_LIVE_SESSION` 分支、AbortSignal 取消）
- 前端：组件级测试覆盖生成/续改/发送到对话交互
- E2E：覆盖"生成 → 续改 → 发送到对话"整条链路（延续旧分支的 E2E 测试思路，换新架构）
- 测试全程 mock，不真打 Gemini API

## 未决事项 / 后续可扩展方向

- 跨重启续改能力：如果将来需要，要先做文件完整性校验（hash 比对）才能安全复用持久化重建方案
- 多 provider 抽象：如果以后要接其它图片模型，需要重新设计 provider 接口层（类似现有 LLM provider 的抽象）
