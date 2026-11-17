/**
 * DeepSeek provider：走 Anthropic 兼容的 Messages 端点（设计文档 D13、§13 Spike 2）。
 * 这个端点会返回完整的服务端搜索结果块和带原文片段的引用，和 core 的 content-block 模型几乎一一对应。
 */
import {
  ProviderError,
  parseToolArguments,
  type Block,
  type Capabilities,
  type Citation,
  type FinishReason,
  type ImageBlock,
  type Message,
  type ModelRequest,
  type Provider,
  type ProviderErrorKind,
  type ProviderEvent,
  type SearchResult,
  type TextBlock,
  type Usage,
} from "@leochat/core";
import { priceUsage } from "./pricing";
import { parseSse } from "./sse";

export interface DeepSeekOptions {
  apiKey: string;
  /** 默认 https://api.deepseek.com */
  baseURL?: string;
  fetch?: typeof fetch;
  /** Anthropic 端点要求 max_tokens；请求没指定时用这个值，默认 8192 */
  defaultMaxTokens?: number;
}

type Json = Record<string, unknown>;

const SERVER_TOOL_WIRE = { web_search: "deepseek_web_search", read_url: "deepseek_read_url" } as const;

/** 线上的服务端工具名（deepseek_web_search）→ 通用名（web_search），界面不用认识各家的名字；原始块仍在 providerData.raw 里用于重放 */
function fromWireToolName(name: string): string {
  for (const [kind, wire] of Object.entries(SERVER_TOOL_WIRE)) if (wire === name) return kind;
  return name;
}

const IGNORED_WITH_SERVER_TOOLS = [
  "temperature",
  "top_p",
  "top_k",
  "stop_sequences",
  "thinking.budget_tokens",
  "tool_choice.disable_parallel_tool_use",
  "metadata",
];

export function deepseekCapabilities(model: string): Capabilities {
  const vision = model === "deepseek-flash";
  return {
    contextWindow: 1_000_000,
    maxOutput: 384_000,
    tools: true,
    parallelToolCalls: true,
    thinking: true,
    vision,
    files: true,
    serverTools: ["web_search", "read_url"],
    cacheStats: true,
    ignoredWhenServerTools: IGNORED_WITH_SERVER_TOOLS,
  };
}

// ── 请求映射 ─────────────────────────────────────────────────────────────

function imageToWire(b: ImageBlock): Json {
  if (b.source.kind === "base64") {
    return { type: "image", source: { type: "base64", media_type: b.source.mediaType ?? "image/png", data: b.source.value } };
  }
  if (b.source.kind === "url") return { type: "image", source: { type: "url", url: b.source.value } };
  // 未经实测：Anthropic Files API 的写法（见待确认问题 Q7）
  return { type: "image", source: { type: "file", file_id: b.source.value } };
}

function blockToWire(b: Block): Json | null {
  switch (b.type) {
    case "text":
      return { type: "text", text: b.text };
    case "thinking":
      return {
        type: "thinking",
        thinking: b.text,
        ...(typeof b.providerData?.signature === "string" ? { signature: b.providerData.signature } : {}),
      };
    case "tool_use": {
      // Messages 端点的 input 是 JSON 对象；core 保存的原始字符串在这里解析（解析失败时退回 {}）
      const input = b.input ?? parseToolArguments(b.arguments) ?? {};
      return { type: "tool_use", id: b.id, name: b.name, input };
    }
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: b.toolUseId,
        content: b.content.map((c) => (c.type === "text" ? { type: "text", text: c.text } : imageToWire(c))),
        ...(b.isError ? { is_error: true } : {}),
      };
    case "server_tool_use":
      return (b.providerData?.raw as Json | undefined) ?? { type: "server_tool_use", id: b.id, name: b.name, input: b.input };
    case "server_tool_result":
      return (
        (b.providerData?.raw as Json | undefined) ?? {
          type: "web_search_tool_result",
          tool_use_id: b.toolUseId,
          content: b.results.map((r) => ({ type: "web_search_result", title: r.title, url: r.url, ...(r.providerData ?? {}) })),
        }
      );
    case "image":
      return imageToWire(b);
    case "file":
      // 未经实测：Anthropic Files API 的写法（见待确认问题 Q7）
      return { type: "document", source: { type: "file", file_id: b.fileId } };
  }
}

/** core Message[] → Anthropic messages；system 角色合并进 system；连续的 user 侧消息（tool + user）合并成一条 */
export function toWireMessages(messages: Message[], system?: string): { system?: string; messages: Json[] } {
  const systems: string[] = system ? [system] : [];
  const out: Array<{ role: "user" | "assistant"; content: Json[] }> = [];
  for (const m of messages) {
    if (m.role === "system") {
      systems.push(m.content.filter((b): b is TextBlock => b.type === "text").map((b) => b.text).join("\n"));
      continue;
    }
    const role = m.role === "assistant" ? "assistant" : "user";
    const content = m.content.map(blockToWire).filter((x): x is Json => x !== null);
    if (content.length === 0) continue;
    const prev = out.at(-1);
    if (prev && prev.role === role) {
      // tool_result 必须排在同一条 user 消息的最前面
      if (role === "user" && m.role === "tool") prev.content.unshift(...content);
      else prev.content.push(...content);
    } else {
      out.push({ role, content });
    }
  }
  return { ...(systems.length ? { system: systems.join("\n\n") } : {}), messages: out };
}

export function buildBody(req: ModelRequest, defaultMaxTokens: number): Json {
  const { system, messages } = toWireMessages(req.messages, req.system);
  const tools: Json[] = (req.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  for (const k of req.serverTools ?? []) tools.push({ type: SERVER_TOOL_WIRE[k], name: SERVER_TOOL_WIRE[k] });
  const thinking = req.thinking === undefined ? undefined : req.thinking === false ? { type: "disabled" } : { type: "enabled" };
  return {
    model: req.model,
    max_tokens: req.maxOutputTokens ?? defaultMaxTokens,
    stream: true,
    ...(system !== undefined ? { system } : {}),
    messages,
    ...(tools.length ? { tools } : {}),
    ...(thinking ? { thinking } : {}),
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.safetyCheck ? { safety_check: { level: req.safetyCheck } } : {}),
    ...(req.providerOptions ?? {}),
  };
}

// ── 错误映射 ─────────────────────────────────────────────────────────────

const CONTEXT_OVERFLOW = /context (length|window)|maximum context|too many tokens|prompt is too long/i;

export function errorFromStatus(status: number, message: string, retryAfter?: string | null): ProviderError {
  let kind: ProviderErrorKind;
  if (status === 400 && CONTEXT_OVERFLOW.test(message)) kind = "context_overflow";
  else if (status === 400 || status === 404 || status === 422) kind = "invalid_request";
  else if (status === 401 || status === 403) kind = "auth";
  else if (status === 402) kind = "insufficient_balance";
  else if (status === 429) kind = "rate_limit";
  else if (status >= 500) kind = "overloaded";
  else kind = "unknown";
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  return new ProviderError(kind, message, {
    status,
    ...(Number.isFinite(seconds) ? { retryAfterMs: seconds * 1000 } : {}),
  });
}

function errorFromSseType(type: string | undefined, message: string): ProviderError {
  const map: Record<string, ProviderErrorKind> = {
    overloaded_error: "overloaded",
    rate_limit_error: "rate_limit",
    api_error: "overloaded",
    authentication_error: "auth",
    permission_error: "auth",
    invalid_request_error: CONTEXT_OVERFLOW.test(message) ? "context_overflow" : "invalid_request",
  };
  return new ProviderError(map[type ?? ""] ?? "unknown", message);
}

// ── 流映射 ───────────────────────────────────────────────────────────────

const STOP_REASONS: Record<string, FinishReason> = {
  end_turn: "end_turn",
  tool_use: "tool_use",
  max_tokens: "max_tokens",
  refusal: "refusal",
  stop_sequence: "stop_sequence",
};

/** Anthropic 风格 usage → core Usage。inputTokens 统一为全部输入（含缓存命中） */
export function toUsage(u: Json): Usage {
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  const miss = num(u.input_tokens);
  const hit = num(u.cache_read_input_tokens);
  const out: Usage = { inputTokens: miss + hit, outputTokens: num(u.output_tokens), cacheHitTokens: hit, cacheMissTokens: miss };
  const details = u.output_tokens_details as Json | undefined;
  if (details && typeof details.thinking_tokens === "number") out.reasoningTokens = details.thinking_tokens;
  const st = u.server_tool_use as Json | undefined;
  if (st) {
    out.serverToolCalls = {
      // 计费数字（官方 web_tools 文档）：tool_search 按查询词数计，tool_fetch 按成功抓取的页面数计；
      // web_search_requests / web_fetch_requests 只是结果块的数量，用于展示，不计费
      web_search: num(st.tool_search),
      read_url: num(st.tool_fetch),
      image_search: num(st.tool_image_search),
    };
  }
  return out;
}

type OpenBlock =
  | { kind: "text"; text: string; citations: Citation[] }
  | { kind: "thinking"; text: string; signature: string }
  | { kind: "tool_use"; id: string; name: string; json: string; initial: unknown }
  | { kind: "server_tool_use"; raw: Json; json: string }
  | { kind: "server_tool_result"; raw: Json }
  | { kind: "ignored" };

function toCitation(c: Json): Citation {
  return {
    url: String(c.url ?? ""),
    ...(typeof c.title === "string" ? { title: c.title } : {}),
    ...(typeof c.cited_text === "string" ? { citedText: c.cited_text } : {}),
    providerData: c,
  };
}

function toSearchResult(r: Json): SearchResult {
  const { title, url, encrypted_content, page_age, snippet, site_name, site_icon } = r;
  return {
    url: String(url ?? ""),
    title: String(title ?? ""),
    ...(typeof snippet === "string" ? { snippet } : {}),
    ...(typeof site_name === "string" ? { siteName: site_name } : {}),
    ...(typeof page_age === "string" ? { date: page_age } : {}),
    providerData: {
      ...(encrypted_content !== undefined ? { encrypted_content } : {}),
      ...(site_icon !== undefined ? { site_icon } : {}),
    },
  };
}

/** 把 Messages 端点的 SSE 记录翻译成 core 的 ProviderEvent */
export async function* mapMessagesStream(records: AsyncIterable<{ event?: string; data: string }>): AsyncGenerator<ProviderEvent> {
  const open = new Map<number, OpenBlock>();
  let usage: Json = {};
  let finish: FinishReason | undefined;

  for await (const rec of records) {
    let ev: Json;
    try {
      ev = JSON.parse(rec.data) as Json;
    } catch {
      continue;
    }
    const type = (ev.type as string | undefined) ?? rec.event;
    const index = typeof ev.index === "number" ? ev.index : -1;

    if (type === "message_start") {
      usage = { ...(((ev.message as Json | undefined)?.usage as Json | undefined) ?? {}) };
    } else if (type === "content_block_start") {
      const cb = (ev.content_block ?? {}) as Json;
      switch (cb.type) {
        case "text":
          open.set(index, { kind: "text", text: String(cb.text ?? ""), citations: [] });
          yield { type: "block_start", index, block: { type: "text" } };
          break;
        case "thinking":
          open.set(index, { kind: "thinking", text: String(cb.thinking ?? ""), signature: String(cb.signature ?? "") });
          yield { type: "block_start", index, block: { type: "thinking" } };
          break;
        case "tool_use":
          open.set(index, { kind: "tool_use", id: String(cb.id), name: String(cb.name), json: "", initial: cb.input });
          yield { type: "block_start", index, block: { type: "tool_use", id: String(cb.id), name: String(cb.name) } };
          break;
        case "server_tool_use":
          open.set(index, { kind: "server_tool_use", raw: cb, json: "" });
          yield { type: "block_start", index, block: { type: "server_tool_use", id: String(cb.id), name: fromWireToolName(String(cb.name)) } };
          break;
        case "web_search_tool_result":
          open.set(index, { kind: "server_tool_result", raw: cb });
          yield { type: "block_start", index, block: { type: "server_tool_result" } };
          break;
        default:
          open.set(index, { kind: "ignored" });
      }
    } else if (type === "content_block_delta") {
      const b = open.get(index);
      const d = (ev.delta ?? {}) as Json;
      if (!b) continue;
      if (d.type === "text_delta" && b.kind === "text") {
        b.text += String(d.text ?? "");
        yield { type: "block_delta", index, delta: { kind: "text", text: String(d.text ?? "") } };
      } else if (d.type === "citations_delta" && b.kind === "text") {
        const c = toCitation((d.citation ?? {}) as Json);
        b.citations.push(c);
        yield { type: "block_delta", index, delta: { kind: "citation", citation: c } };
      } else if (d.type === "thinking_delta" && b.kind === "thinking") {
        b.text += String(d.thinking ?? "");
        yield { type: "block_delta", index, delta: { kind: "thinking", text: String(d.thinking ?? "") } };
      } else if (d.type === "signature_delta" && b.kind === "thinking") {
        b.signature += String(d.signature ?? "");
      } else if (d.type === "input_json_delta" && (b.kind === "tool_use" || b.kind === "server_tool_use")) {
        b.json += String(d.partial_json ?? "");
        if (b.kind === "tool_use") yield { type: "block_delta", index, delta: { kind: "input_json", partial: String(d.partial_json ?? "") } };
      }
    } else if (type === "content_block_stop") {
      const b = open.get(index);
      open.delete(index);
      if (!b || b.kind === "ignored") continue;
      let block: Block;
      if (b.kind === "text") {
        block = { type: "text", text: b.text, ...(b.citations.length ? { citations: b.citations } : {}) };
      } else if (b.kind === "thinking") {
        block = { type: "thinking", text: b.text, ...(b.signature ? { providerData: { signature: b.signature } } : {}) };
      } else if (b.kind === "tool_use") {
        // C2：原始字符串是拼接后的 partial_json；没有增量时退回 start 里给出的 input
        const raw = b.json !== "" ? b.json : JSON.stringify(b.initial ?? {});
        const input = parseToolArguments(raw);
        block = { type: "tool_use", id: b.id, name: b.name, arguments: raw, ...(input !== undefined ? { input } : {}) };
      } else if (b.kind === "server_tool_use") {
        const input = b.json !== "" ? (parseToolArguments(b.json) ?? b.raw.input) : b.raw.input;
        const raw: Json = { ...b.raw, input };
        block = { type: "server_tool_use", id: String(raw.id), name: fromWireToolName(String(raw.name)), input, providerData: { raw } };
      } else {
        const content = Array.isArray(b.raw.content) ? (b.raw.content as Json[]) : [];
        block = {
          type: "server_tool_result",
          toolUseId: String(b.raw.tool_use_id ?? ""),
          name: "web_search",
          results: content.filter((r) => r.type === "web_search_result").map(toSearchResult),
          providerData: { raw: b.raw },
        };
      }
      yield { type: "block_end", index, block };
    } else if (type === "message_delta") {
      const d = (ev.delta ?? {}) as Json;
      if (typeof d.stop_reason === "string") finish = STOP_REASONS[d.stop_reason] ?? "other";
      if (ev.usage) usage = { ...usage, ...(ev.usage as Json) };
    } else if (type === "error") {
      const err = (ev.error ?? {}) as Json;
      throw errorFromSseType(err.type as string | undefined, String(err.message ?? "DeepSeek stream error"));
    }
  }
  yield { type: "usage", usage: toUsage(usage) };
  yield { type: "finish", reason: finish ?? "other" };
}

// ── Provider ─────────────────────────────────────────────────────────────

export const FILES_BETA = "files-api-2025-04-14";

const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿가-힯＀-￯]/g;

/**
 * DeepSeek 分词的估算：中文约每字 0.6 token（2026-11-16 用真实 usage 校准：7838 个中文字 ≈ 4560 token），
 * 其余约每 4 个字符 1 token
 */
export function estimateDeepSeekTokens(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  return Math.ceil(cjk * 0.6 + (text.length - cjk) / 4);
}

/** 消息里是否引用了 Files API 上传的文件（图片 file_id 或文档 file 块，含工具结果里的图片） */
export function referencesUploadedFiles(messages: Message[]): boolean {
  const isFileImage = (b: { type: string; source?: { kind: string } }) => b.type === "image" && b.source?.kind === "file_id";
  return messages.some((m) =>
    m.content.some((b) => b.type === "file" || isFileImage(b) || (b.type === "tool_result" && b.content.some(isFileImage))),
  );
}

export function deepseek(opts: DeepSeekOptions): Provider {
  const base = (opts.baseURL ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const defaultMaxTokens = opts.defaultMaxTokens ?? 8192;
  return {
    id: "deepseek",
    capabilities: deepseekCapabilities,
    price: priceUsage,
    estimateTokens: estimateDeepSeekTokens,
    async *stream(req: ModelRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent> {
      let res: Response;
      try {
        res = await doFetch(`${base}/anthropic/v1/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            // Q7：引用上传文件（file_id）时，Messages 端点要求这个头（官方 Files API / File Parsing 文档）
            ...(referencesUploadedFiles(req.messages) ? { "anthropic-beta": FILES_BETA } : {}),
          },
          body: JSON.stringify(buildBody(req, defaultMaxTokens)),
          ...(signal ? { signal } : {}),
        });
      } catch (e) {
        if (signal?.aborted) throw e;
        throw new ProviderError("network", e instanceof Error ? e.message : String(e), { cause: e });
      }
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        let message = text.slice(0, 500) || `HTTP ${res.status}`;
        try {
          const j = JSON.parse(text) as { error?: { message?: string } };
          if (j.error?.message) message = j.error.message;
        } catch {
          // 不是 JSON，保留原文前 500 字
        }
        throw errorFromStatus(res.status, message, res.headers.get("retry-after"));
      }
      yield* mapMessagesStream(parseSse(res.body, signal));
    },
  };
}
