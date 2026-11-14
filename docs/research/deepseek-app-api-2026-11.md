# DeepSeek 应用级 API 整理（2026-11）

> 整理日期：2026-11-14。来源：api-docs.deepseek.com（链接见文末）。价格和限额会变，接入前以官方页面为准。

## 1. 时间线

| 日期 | 事件 |
|---|---|
| 2026-09-10 | DeepSeek-V4.1-Flash 发布，原生多模态视觉，模型名 `deepseek-flash`。`deepseek-v4-flash` / `deepseek-v4-flash-vision-exp` 暂时路由到 V4.1 Flash |
| 2026-10-17 | 自研搜索 API 开放（`/v1/tools/search`）；模型升级为 V4.1-Flash-1017，调用名不变 |
| 2026-11-13 | "App 能力全量 API 化"：内置联网搜索、深度思考搜索、文件输入、URL 读取、安全检查；独立 Search / Fetch / OCR / ASR / TTS API |

## 2. 模型与计价（每百万 token）

| 模型 | 时段 | 输入（缓存命中） | 输入（未命中） | 输出 |
|---|---|---|---|---|
| deepseek-flash | 闲时 | $0.003 | $0.15 | $0.6 |
| | 忙时 | $0.006 | $0.3 | $1.2 |
| deepseek-v4-pro | 闲时 | $0.022 | $0.66 | $1.98 |
| | 忙时 | $0.044 | $1.32 | $3.96 |

- 忙时：周一至周五 UTC 01:00–04:00、06:00–10:00（中国法定节假日除外）
- 上下文 1M token，最大输出 384K
- 并发上限：flash 2500，v4-pro 500
- **缓存命中比未命中便宜 50 倍**，这一点直接影响 compact 的设计（见第 6 节）

## 3. 三种兼容端点（同一模型）

| 风格 | 端点 |
|---|---|
| Chat Completions（OpenAI） | `POST https://api.deepseek.com/chat/completions` |
| Responses（OpenAI） | `POST https://api.deepseek.com/responses` |
| Messages（Anthropic） | `POST https://api.deepseek.com/anthropic/v1/messages` |

## 4. 内置（服务端）工具

在请求里声明，工具调用和上下文拼装都由服务端完成，客户端不需要执行。

```json
"tools": [
  { "type": "deepseek_web_search", "name": "deepseek_web_search" },
  { "type": "deepseek_read_url",   "name": "deepseek_read_url" }
]
```
（Responses 风格只写 `type`。）

| 能力 | 开法 |
|---|---|
| 联网搜索（带引用） | 关闭 thinking 并加 `deepseek_web_search` |
| 深度思考搜索 | `"thinking": {"type": "enabled"}`（Responses 用 `"reasoning": {"effort": "high"}`）并加 `deepseek_web_search` |
| URL 读取 | `deepseek_read_url`，自动抓取用户消息中的链接 |
| 文件输入 | 消息内容块 `{"type": "file", "file_id": "..."}`（见第 5.4 节） |
| 安全检查 | `"safety_check": {"level": "high"}`；触发时 `stop_reason: "refusal"`。**面向公众的应用必须开启** |
| 会话标题 | `"title": {"enabled": true}`，在 `message_delta` 里返回 |

**流式返回的块（Messages 风格）**
- `server_tool_use`：`name`、`input`（如 `action: "search"` 加 `queries`）、`caller`、`kind`（如 `deep_search`）
- `web_search_tool_result`：`web_search_result[]`，字段为 `title`、`url`、`encrypted_content`、`page_age`、`snippet`、`site_name`、`site_icon`
- `text` 块：`text_delta` 和 `citations_delta`（`web_search_result_location`：`url`、`title`、`encrypted_index`、`cited_text`）
- `thinking` 块：`thinking_delta`、`signature_delta`
- `message_delta`：`stop_reason`、`title`、`usage.server_tool_use`（`web_search_requests`、`web_fetch_requests`、`tool_search`、`tool_fetch`、`tool_image_search`）

**开启 web 工具 / 高安全 / 标题后会被忽略的参数**
- Chat Completions：`temperature`、`top_p`、`frequency_penalty`、`presence_penalty`、`stop`、`seed`、`n`、`preserve_thinking`、`parallel_tool_calls`
- Messages：`temperature`、`top_p`、`top_k`、`stop_sequences`、`thinking.budget_tokens`、`preserve_thinking`、`tool_choice.disable_parallel_tool_use`、`metadata`（`user_id` 除外）
- Responses：`temperature`、`top_p`、`reasoning.summary`、`text.verbosity`、`include`、`max_tool_calls`、`truncation`、`metadata`、`parallel_tool_calls`、`store`
- `max_tokens` 限制的是一轮里的**每一步**推理，不是整轮总量

> 对 LeoChat 的意义：服务端工具让 "搜索" 不再需要客户端 tool loop，但事件形态（`server_tool_use`、citations）和普通 function call 不同，TaskLoop / UI 需要新增一种 "服务端工具" 内容项来展示。

## 5. 独立工具 API

认证：`Authorization: Bearer <key>`。错误格式与 OpenAI 兼容（`param` 恒为 `null`）。

### 5.1 Search — `POST /v1/tools/search`

| 请求字段 | 说明 |
|---|---|
| `query`（必填） | 1–128 字符。支持 `site:`、`-site:`、`-词`、`"短语"`、`-"短语"`、`lang:`、`after:`、`before:` |
| `count` | 1–50，默认 10，不影响价格 |
| `ori_question` | 原始问题，1–128 字符，可选 |
| `localization` | 用于本地化结果的 IP |
| `need_content` | 默认 false；为 true 时返回正文 |

响应 `results[]`：`rerank_score`（0–3，≥1.5 为高质量）、`title`、`url`、`snippet`（100–200 字，给 UI）、`summary`（600–800 字，**给模型**）、`content`、`site_name`、`site_icon`、`date`（RFC 3339）、`authority`（0–4，-1 表示未知，≥3 为高权威）。

限额：账号级 100 QPS。价格：$0.75 / 千次成功请求（空结果、失败、超时不计费）。

### 5.2 Fetch — `POST /v1/tools/fetch`

请求：`{ "url": "..." }`，最长 8192 字符，仅 http/https，URL 中不能带账号密码。
响应：`{ "title", "content" }`，`content` 为 Markdown。
限额：账号级 25 QPS，另有按域名的 QPS 限制。403 表示被安全策略拒绝，404 表示无可用内容。价格：$0.75 / 千次。

### 5.3 OCR — `POST /v1/tools/ocr`（multipart）

| 字段 | 说明 |
|---|---|
| `file`（必填） | PDF、DOC、DOCX、PPT、PPTX、PNG、JPEG、WebP、GIF、BMP、TIFF |
| `purpose`（必填） | `text_recognition`：Word/PPT 直接抽文本，其他逐页识别；`rich_layout_recognition`：全部逐页、带版面 |

- 响应：`pages[]`，每页 `index`、`text`、`finish_reason`（`length` 表示该页被截断）；另有 `page_count`、`usage`
- 版面模式的文本带 `<｜ref｜>`、`<｜box｜>[[x1,y1,x2,y2]]` 标记，坐标归一化到 0–1000
- 限制：100 MiB、1000 页；上传须在 120 秒内完成，期间停顿不超过 30 秒；总时长 180 秒；同时进行的识别最多 15 个
- 识别开始后出错仍返回 **HTTP 200 + error body**，客户端要检查 body 里的 `error`
- 断开连接不会取消识别，任务仍会跑完并计费
- 价格：$0.225 / 千页

> 对比 `feat/ocr-mcp` 分支的本地 PaddleOCR：不需要本地安装，千页成本约 1.6 元人民币。缺点是需要联网，文件要上传到 DeepSeek，涉及隐私的文档要考虑这一点。

### 5.4 Files — `/files`（OpenAI 兼容）

- 接口：`POST /files`（上传，multipart：`purpose`、`file`、可选 `expires_after[anchor]=created_at` 和 `expires_after[seconds]`，范围 3600–2592000）、`GET /files`、`GET /files/{id}`、`DELETE /files/{id}`
- `purpose` 取值：
  - `user_data`：图片、纯文本/代码、xlsx/xls、epub/mobi。PDF/Word/PPT 用这个 purpose 会返回 400
  - `text_recognition`：文档，只抽文本
  - `rich_layout_recognition`：文档，文本加图表
- 文档在上传时解析，接口返回的 `file_id` 即可直接使用；原文件和解析结果都无法下载
- 大小上限：图片 64 MiB，文档 100 MiB，文本/表格/电子书 32 MiB。每个账号 25 GiB、最多 1 万个文件。默认永久保存
- 在消息中引用：`{"type": "file", "file_id": "..."}`；内联图片用 `file_data`（base64，32 MiB 以内）
- 走 Anthropic 风格端点：路径为 `/anthropic/v1/files`，需加 `anthropic-beta: files-api-2025-04-14`

### 5.5 TTS — `POST /v1/tools/tts`；流式 `wss://api.deepseek.com/v1/tools/tts`

- HTTP 请求：`text`（最多 10000 计费字符、64 KiB）、`voice_id`（`stella` 女声，默认 / `tide` 男声）、`format`（`wav` 或 `pcm`，24 kHz、16-bit 单声道）、`filter_markdown`（默认 true，朗读前去掉 Markdown）
- WebSocket：客户端逐段发送 `{"event": "text", "text": "..."}`，结束时发 `{"event": "finish_text"}`；服务端以二进制帧返回音频，最后发 `{"event": "finish", "code": "..."}`。输出格式为 `pcm` 或 `opus`（裸包，没有容器）
- 不传语言参数，自动识别；支持 10 种语言
- 同时进行的请求最多 50 个
- 价格：$0.45 / 万字符，限时 5 折 $0.225。中文字符按 2 个计

### 5.6 ASR — `POST /v1/tools/asr`（multipart `file`）

- 格式：16-bit PCM WAV 或 Ogg Opus
- 限制：8 MiB、120 秒；**不支持流式**
- 响应：`request_id`、`text`、`duration_ms`
- 价格：$0.116 / 小时，限时 5 折 $0.058。同时进行的请求最多 50 个

## 6. 对 LeoChat 架构的直接影响

1. **Provider 抽象层要区分三类能力**：
   - 模型推理（chat 端点）
   - 服务端工具（随推理请求声明，由服务端执行）
   - 独立工具服务（Search/Fetch/OCR/ASR/TTS，由客户端或 MCP 调用）

   DeepSeek 是第一个同时具备这三类能力的 provider。其他 provider（Kimi、OpenAI、Anthropic）各自只具备其中一部分，所以抽象层要用能力声明（capability）来描述 provider 支持什么，而不是假设所有 provider 都一样。
2. **独立工具做成 MCP server**（放在 `leochat-mcp` 或新建 `deepseek-tools-mcp`），这样 GUI、SDK、CLI、其他 agent 都能复用。Search 返回结果时给模型用 `summary` 字段，给 UI 用 `snippet` 字段。
3. **Compact 要利用前缀缓存**：缓存命中只要 $0.003/M。摘要请求应该原样重放最近一次请求的前缀（system、tools、历史消息），把 "请压缩" 的指令作为最后一条 user 消息追加。这样摘要调用几乎全部命中缓存，成本极低（这是 deepseek-harness 的做法）。
4. **1M 上下文改变了 compact 的动机**：主要目的不再是 "塞不下"，而是长任务的质量（注意力被稀释）和成本（未命中的部分很贵）。
5. **公开部署（例如博客 agent）必须开启 `safety_check`**。

## 来源

- https://api-docs.deepseek.com/news/news261113/
- https://api-docs.deepseek.com/updates
- https://api-docs.deepseek.com/guides/build_a_chatbot
- https://api-docs.deepseek.com/guides/search
- https://api-docs.deepseek.com/guides/ocr
- https://api-docs.deepseek.com/guides/files_api
- https://api-docs.deepseek.com/guides/tts
- https://api-docs.deepseek.com/guides/asr
- https://api-docs.deepseek.com/quick_start/pricing
