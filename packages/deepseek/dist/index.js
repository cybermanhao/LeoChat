import { ProviderError, parseToolArguments, defineTool, ToolError } from '@leochat/core';
import { z } from 'zod';

// src/provider.ts

// src/pricing.ts
var OFF_PEAK_RATES = {
  "deepseek-flash": { cacheHit: 3e-3, cacheMiss: 0.15, output: 0.6 },
  "deepseek-v4-pro": { cacheHit: 0.022, cacheMiss: 0.66, output: 1.98 }
};
var TOOL_FEES = {
  search: 0.75 / 1e3,
  fetch: 0.75 / 1e3,
  /** 美元 / 页 */
  ocrPage: 0.225 / 1e3
};
function isPeak(at) {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const h = at.getUTCHours();
  return h >= 1 && h < 4 || h >= 6 && h < 10;
}
function priceUsage(model, usage, at) {
  const base = OFF_PEAK_RATES[model];
  if (!base) return void 0;
  const k = isPeak(at) ? 2 : 1;
  const hit = usage.cacheHitTokens ?? 0;
  const miss = usage.cacheMissTokens ?? Math.max(0, usage.inputTokens - hit);
  const tokens = (hit * base.cacheHit + miss * base.cacheMiss + usage.outputTokens * base.output) * k;
  const st = usage.serverToolCalls;
  const tools = ((st?.web_search ?? 0) + (st?.image_search ?? 0)) * TOOL_FEES.search + (st?.read_url ?? 0) * TOOL_FEES.fetch;
  return tokens / 1e6 + tools;
}

// src/sse.ts
async function* parseSse(body, signal) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event;
  let data = [];
  const flush = () => {
    if (data.length === 0) {
      event = void 0;
      return null;
    }
    const rec = { ...event !== void 0 ? { event } : {}, data: data.join("\n") };
    event = void 0;
    data = [];
    return rec;
  };
  try {
    for (; ; ) {
      signal?.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        let line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        if (line.endsWith("\r")) line = line.slice(0, -1);
        if (line === "") {
          const rec2 = flush();
          if (rec2) yield rec2;
        } else if (line.startsWith(":")) {
        } else {
          const colon = line.indexOf(":");
          const field = colon < 0 ? line : line.slice(0, colon);
          let value2 = colon < 0 ? "" : line.slice(colon + 1);
          if (value2.startsWith(" ")) value2 = value2.slice(1);
          if (field === "event") event = value2;
          else if (field === "data") data.push(value2);
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim() !== "") {
      for (const line of buffer.split("\n")) if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    const rec = flush();
    if (rec) yield rec;
  } finally {
    reader.releaseLock();
  }
}

// src/provider.ts
var SERVER_TOOL_WIRE = { web_search: "deepseek_web_search", read_url: "deepseek_read_url" };
function fromWireToolName(name) {
  for (const [kind, wire] of Object.entries(SERVER_TOOL_WIRE)) if (wire === name) return kind;
  return name;
}
var IGNORED_WITH_SERVER_TOOLS = [
  "temperature",
  "top_p",
  "top_k",
  "stop_sequences",
  "thinking.budget_tokens",
  "tool_choice.disable_parallel_tool_use",
  "metadata"
];
function deepseekCapabilities(model) {
  const vision = model === "deepseek-flash";
  return {
    contextWindow: 1e6,
    maxOutput: 384e3,
    tools: true,
    parallelToolCalls: true,
    thinking: true,
    vision,
    files: true,
    serverTools: ["web_search", "read_url"],
    cacheStats: true,
    ignoredWhenServerTools: IGNORED_WITH_SERVER_TOOLS
  };
}
function imageToWire(b) {
  if (b.source.kind === "base64") {
    return { type: "image", source: { type: "base64", media_type: b.source.mediaType ?? "image/png", data: b.source.value } };
  }
  if (b.source.kind === "url") return { type: "image", source: { type: "url", url: b.source.value } };
  return { type: "image", source: { type: "file", file_id: b.source.value } };
}
function blockToWire(b) {
  switch (b.type) {
    case "text":
      return { type: "text", text: b.text };
    case "thinking":
      return {
        type: "thinking",
        thinking: b.text,
        ...typeof b.providerData?.signature === "string" ? { signature: b.providerData.signature } : {}
      };
    case "tool_use": {
      const input = b.input ?? parseToolArguments(b.arguments) ?? {};
      return { type: "tool_use", id: b.id, name: b.name, input };
    }
    case "tool_result":
      return {
        type: "tool_result",
        tool_use_id: b.toolUseId,
        content: b.content.map((c) => c.type === "text" ? { type: "text", text: c.text } : imageToWire(c)),
        ...b.isError ? { is_error: true } : {}
      };
    case "server_tool_use":
      return b.providerData?.raw ?? { type: "server_tool_use", id: b.id, name: b.name, input: b.input };
    case "server_tool_result":
      return b.providerData?.raw ?? {
        type: "web_search_tool_result",
        tool_use_id: b.toolUseId,
        content: b.results.map((r) => ({ type: "web_search_result", title: r.title, url: r.url, ...r.providerData ?? {} }))
      };
    case "image":
      return imageToWire(b);
    case "file":
      return { type: "document", source: { type: "file", file_id: b.fileId } };
  }
}
function toWireMessages(messages, system) {
  const systems = system ? [system] : [];
  const out = [];
  for (const m of messages) {
    if (m.role === "system") {
      systems.push(m.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"));
      continue;
    }
    const role = m.role === "assistant" ? "assistant" : "user";
    const content = m.content.map(blockToWire).filter((x) => x !== null);
    if (content.length === 0) continue;
    const prev = out.at(-1);
    if (prev && prev.role === role) {
      if (role === "user" && m.role === "tool") prev.content.unshift(...content);
      else prev.content.push(...content);
    } else {
      out.push({ role, content });
    }
  }
  return { ...systems.length ? { system: systems.join("\n\n") } : {}, messages: out };
}
function buildBody(req, defaultMaxTokens) {
  const { system, messages } = toWireMessages(req.messages, req.system);
  const tools = (req.tools ?? []).map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
  for (const k of req.serverTools ?? []) tools.push({ type: SERVER_TOOL_WIRE[k], name: SERVER_TOOL_WIRE[k] });
  const thinking = req.thinking === void 0 ? void 0 : req.thinking === false ? { type: "disabled" } : { type: "enabled" };
  return {
    model: req.model,
    max_tokens: req.maxOutputTokens ?? defaultMaxTokens,
    stream: true,
    ...system !== void 0 ? { system } : {},
    messages,
    ...tools.length ? { tools } : {},
    ...thinking ? { thinking } : {},
    ...req.temperature !== void 0 ? { temperature: req.temperature } : {},
    ...req.safetyCheck ? { safety_check: { level: req.safetyCheck } } : {},
    ...req.providerOptions ?? {}
  };
}
var CONTEXT_OVERFLOW = /context (length|window)|maximum context|too many tokens|prompt is too long/i;
function errorFromStatus(status, message, retryAfter) {
  let kind;
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
    ...Number.isFinite(seconds) ? { retryAfterMs: seconds * 1e3 } : {}
  });
}
function errorFromSseType(type, message) {
  const map = {
    overloaded_error: "overloaded",
    rate_limit_error: "rate_limit",
    api_error: "overloaded",
    authentication_error: "auth",
    permission_error: "auth",
    invalid_request_error: CONTEXT_OVERFLOW.test(message) ? "context_overflow" : "invalid_request"
  };
  return new ProviderError(map[type ?? ""] ?? "unknown", message);
}
var STOP_REASONS = {
  end_turn: "end_turn",
  tool_use: "tool_use",
  max_tokens: "max_tokens",
  refusal: "refusal",
  stop_sequence: "stop_sequence"
};
function toUsage(u) {
  const num = (v) => typeof v === "number" ? v : 0;
  const miss = num(u.input_tokens);
  const hit = num(u.cache_read_input_tokens);
  const out = { inputTokens: miss + hit, outputTokens: num(u.output_tokens), cacheHitTokens: hit, cacheMissTokens: miss };
  const details = u.output_tokens_details;
  if (details && typeof details.thinking_tokens === "number") out.reasoningTokens = details.thinking_tokens;
  const st = u.server_tool_use;
  if (st) {
    out.serverToolCalls = {
      // 计费数字（官方 web_tools 文档）：tool_search 按查询词数计，tool_fetch 按成功抓取的页面数计；
      // web_search_requests / web_fetch_requests 只是结果块的数量，用于展示，不计费
      web_search: num(st.tool_search),
      read_url: num(st.tool_fetch),
      image_search: num(st.tool_image_search)
    };
  }
  return out;
}
function toCitation(c) {
  return {
    url: String(c.url ?? ""),
    ...typeof c.title === "string" ? { title: c.title } : {},
    ...typeof c.cited_text === "string" ? { citedText: c.cited_text } : {},
    providerData: c
  };
}
function toSearchResult(r) {
  const { title, url, encrypted_content, page_age, snippet, site_name, site_icon } = r;
  return {
    url: String(url ?? ""),
    title: String(title ?? ""),
    ...typeof snippet === "string" ? { snippet } : {},
    ...typeof site_name === "string" ? { siteName: site_name } : {},
    ...typeof page_age === "string" ? { date: page_age } : {},
    providerData: {
      ...encrypted_content !== void 0 ? { encrypted_content } : {},
      ...site_icon !== void 0 ? { site_icon } : {}
    }
  };
}
async function* mapMessagesStream(records) {
  const open = /* @__PURE__ */ new Map();
  let usage = {};
  let finish;
  for await (const rec of records) {
    let ev;
    try {
      ev = JSON.parse(rec.data);
    } catch {
      continue;
    }
    const type = ev.type ?? rec.event;
    const index = typeof ev.index === "number" ? ev.index : -1;
    if (type === "message_start") {
      usage = { ...ev.message?.usage ?? {} };
    } else if (type === "content_block_start") {
      const cb = ev.content_block ?? {};
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
      const d = ev.delta ?? {};
      if (!b) continue;
      if (d.type === "text_delta" && b.kind === "text") {
        b.text += String(d.text ?? "");
        yield { type: "block_delta", index, delta: { kind: "text", text: String(d.text ?? "") } };
      } else if (d.type === "citations_delta" && b.kind === "text") {
        const c = toCitation(d.citation ?? {});
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
      let block;
      if (b.kind === "text") {
        block = { type: "text", text: b.text, ...b.citations.length ? { citations: b.citations } : {} };
      } else if (b.kind === "thinking") {
        block = { type: "thinking", text: b.text, ...b.signature ? { providerData: { signature: b.signature } } : {} };
      } else if (b.kind === "tool_use") {
        const raw = b.json !== "" ? b.json : JSON.stringify(b.initial ?? {});
        const input = parseToolArguments(raw);
        block = { type: "tool_use", id: b.id, name: b.name, arguments: raw, ...input !== void 0 ? { input } : {} };
      } else if (b.kind === "server_tool_use") {
        const input = b.json !== "" ? parseToolArguments(b.json) ?? b.raw.input : b.raw.input;
        const raw = { ...b.raw, input };
        block = { type: "server_tool_use", id: String(raw.id), name: fromWireToolName(String(raw.name)), input, providerData: { raw } };
      } else {
        const content = Array.isArray(b.raw.content) ? b.raw.content : [];
        block = {
          type: "server_tool_result",
          toolUseId: String(b.raw.tool_use_id ?? ""),
          name: "web_search",
          results: content.filter((r) => r.type === "web_search_result").map(toSearchResult),
          providerData: { raw: b.raw }
        };
      }
      yield { type: "block_end", index, block };
    } else if (type === "message_delta") {
      const d = ev.delta ?? {};
      if (typeof d.stop_reason === "string") finish = STOP_REASONS[d.stop_reason] ?? "other";
      if (ev.usage) usage = { ...usage, ...ev.usage };
    } else if (type === "error") {
      const err = ev.error ?? {};
      throw errorFromSseType(err.type, String(err.message ?? "DeepSeek stream error"));
    }
  }
  yield { type: "usage", usage: toUsage(usage) };
  yield { type: "finish", reason: finish ?? "other" };
}
var FILES_BETA = "files-api-2025-04-14";
var CJK = /[　-〿぀-ヿ㐀-䶿一-鿿가-힯＀-￯]/g;
function estimateDeepSeekTokens(text) {
  const cjk = text.match(CJK)?.length ?? 0;
  return Math.ceil(cjk * 0.6 + (text.length - cjk) / 4);
}
function referencesUploadedFiles(messages) {
  const isFileImage = (b) => b.type === "image" && b.source?.kind === "file_id";
  return messages.some(
    (m) => m.content.some((b) => b.type === "file" || isFileImage(b) || b.type === "tool_result" && b.content.some(isFileImage))
  );
}
function deepseek(opts) {
  const base = (opts.baseURL ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const doFetch = opts.fetch ?? ((...a) => fetch(...a));
  const defaultMaxTokens = opts.defaultMaxTokens ?? 8192;
  return {
    id: "deepseek",
    capabilities: deepseekCapabilities,
    price: priceUsage,
    estimateTokens: estimateDeepSeekTokens,
    async *stream(req, signal) {
      let res;
      try {
        res = await doFetch(`${base}/anthropic/v1/messages`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
            // Q7：引用上传文件（file_id）时，Messages 端点要求这个头（官方 Files API / File Parsing 文档）
            ...referencesUploadedFiles(req.messages) ? { "anthropic-beta": FILES_BETA } : {}
          },
          body: JSON.stringify(buildBody(req, defaultMaxTokens)),
          ...signal ? { signal } : {}
        });
      } catch (e) {
        if (signal?.aborted) throw e;
        throw new ProviderError("network", e instanceof Error ? e.message : String(e), { cause: e });
      }
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        let message = text.slice(0, 500) || `HTTP ${res.status}`;
        try {
          const j = JSON.parse(text);
          if (j.error?.message) message = j.error.message;
        } catch {
        }
        throw errorFromStatus(res.status, message, res.headers.get("retry-after"));
      }
      yield* mapMessagesStream(parseSse(res.body, signal));
    }
  };
}
function client(opts) {
  const base = (opts.baseURL ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const doFetch = opts.fetch ?? ((...a) => fetch(...a));
  return async (path, init, signal) => {
    const res = await doFetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${opts.apiKey}`, ...init.headers ?? {} },
      signal
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = void 0;
    }
    const errMsg = json?.error?.message;
    if (!res.ok) {
      if (res.status === 400 || res.status === 404 || res.status === 403) throw new ToolError(errMsg ?? `Request rejected (HTTP ${res.status})`);
      throw errorFromStatus(res.status, errMsg ?? `HTTP ${res.status}`, res.headers.get("retry-after"));
    }
    if (errMsg) throw new ToolError(errMsg);
    return json;
  };
}
function deepseekSearch(opts) {
  const call = client(opts);
  return defineTool({
    name: "web_search",
    description: `Search the web with DeepSeek's search engine. Supports operators: site:, -site:, "phrase", -term, lang:, after:, before:. Query is at most 128 characters.`,
    input: z.object({
      query: z.string().min(1).max(128),
      count: z.number().int().min(1).max(50).optional()
    }),
    async execute({ query, count }, ctx) {
      const json = await call(
        "/v1/tools/search",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, count: count ?? 8 }) },
        ctx.signal
      );
      const results = json.results ?? [];
      const forModel = results.map((r, i) => `[${i + 1}] ${r.title}
${r.url}${r.date ? ` (${r.date})` : ""}
${r.summary ?? r.snippet ?? ""}`).join("\n\n");
      const cards = results.map((r) => ({
        title: r.title,
        ...r.site_name ? { subtitle: r.site_name } : {},
        ...r.snippet ? { lines: [r.snippet] } : {},
        href: r.url
      }));
      return {
        content: forModel || "No results.",
        data: { results },
        ...cards.length ? { ui: { type: "cards", label: "Search results", cards } } : {}
      };
    }
  });
}
function deepseekFetch(opts) {
  const call = client(opts);
  return defineTool({
    name: "read_url",
    description: "Fetch a public web page and return its main content as Markdown.",
    input: z.object({ url: z.url({ protocol: /^https?$/ }).max(8192) }),
    async execute({ url }, ctx) {
      const json = await call(
        "/v1/tools/fetch",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) },
        ctx.signal
      );
      return { content: `# ${json.title ?? url}

${json.content ?? ""}`, data: { url, title: json.title ?? "" } };
    }
  });
}
function deepseekOcr(opts) {
  const call = client(opts);
  return defineTool({
    name: "ocr",
    description: "Recognize text in a document or image (PDF, Word, PowerPoint, PNG, JPEG, ...). `file` is a file reference provided by the application. Set layout=true to keep tables and figures.",
    input: z.object({ file: z.string().min(1), layout: z.boolean().optional() }),
    executionMode: "parallel",
    async execute({ file, layout }, ctx) {
      const { blob, filename } = await opts.resolveFile(file, { app: ctx.app, signal: ctx.signal });
      const form = new FormData();
      form.append("purpose", layout ? "rich_layout_recognition" : "text_recognition");
      form.append("file", blob, filename);
      ctx.update({ stage: "uploading", filename });
      const json = await call("/v1/tools/ocr", { method: "POST", body: form }, ctx.signal);
      const pages = json.pages ?? [];
      const truncated = pages.filter((p) => p.finish_reason === "length").map((p) => p.index + 1);
      const text = pages.map((p) => `--- page ${p.index + 1} ---
${p.text}`).join("\n\n");
      return {
        content: truncated.length ? `${text}

(Note: pages ${truncated.join(", ")} were cut off and are incomplete.)` : text,
        data: { pageCount: json.page_count ?? pages.length, truncatedPages: truncated }
      };
    }
  });
}

// src/files.ts
function deepseekFiles(opts) {
  const base = (opts.baseURL ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const doFetch = opts.fetch ?? ((...a) => fetch(...a));
  const auth = { Authorization: `Bearer ${opts.apiKey}` };
  async function check(res) {
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = void 0;
    }
    if (!res.ok) {
      const msg = json?.error?.message ?? `HTTP ${res.status}`;
      throw errorFromStatus(res.status, msg, res.headers.get("retry-after"));
    }
    return json;
  }
  return {
    /**
     * 上传文件。文档在上传时解析，返回后 file_id 即可使用。
     * expiresAfterSeconds：3600–2592000；省略则永久保存（每个账号 25 GiB、1 万个文件上限）
     */
    async upload(file, filename, purpose, o = {}) {
      const form = new FormData();
      form.append("purpose", purpose);
      if (o.expiresAfterSeconds !== void 0) {
        form.append("expires_after[anchor]", "created_at");
        form.append("expires_after[seconds]", String(o.expiresAfterSeconds));
      }
      form.append("file", file, filename);
      const res = await doFetch(`${base}/files`, { method: "POST", headers: auth, body: form, ...o.signal ? { signal: o.signal } : {} });
      return await check(res);
    },
    async delete(fileId) {
      await check(await doFetch(`${base}/files/${encodeURIComponent(fileId)}`, { method: "DELETE", headers: auth }));
    }
  };
}

export { FILES_BETA, OFF_PEAK_RATES, TOOL_FEES, buildBody, deepseek, deepseekCapabilities, deepseekFetch, deepseekFiles, deepseekOcr, deepseekSearch, errorFromStatus, estimateDeepSeekTokens, isPeak, mapMessagesStream, parseSse, priceUsage, referencesUploadedFiles, toUsage, toWireMessages };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map