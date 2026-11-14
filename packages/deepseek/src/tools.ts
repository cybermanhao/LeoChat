/**
 * DeepSeek 独立工具 API 包装成 core 的 Tool（docs/research/deepseek-app-api-2026-11.md §5）。
 * 同一批工具也可以通过 @leochat/mcp-kit 暴露成 MCP server（第 5 步）。
 */
import { ToolError, defineTool, type Card } from "@leochat/core";
import { z } from "zod";
import { errorFromStatus } from "./provider";

export interface DeepSeekToolOptions {
  apiKey: string;
  baseURL?: string;
  fetch?: typeof fetch;
}

function client(opts: DeepSeekToolOptions) {
  const base = (opts.baseURL ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return async (path: string, init: RequestInit, signal: AbortSignal): Promise<unknown> => {
    const res = await doFetch(`${base}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${opts.apiKey}`, ...(init.headers ?? {}) },
      signal,
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const errMsg = (json as { error?: { message?: string } } | undefined)?.error?.message;
    // 400 一类的业务错误交给模型（例如搜索词过长）；其他错误按 provider 错误抛出，由 core 泛化
    if (!res.ok) {
      if (res.status === 400 || res.status === 404 || res.status === 403) throw new ToolError(errMsg ?? `Request rejected (HTTP ${res.status})`);
      throw errorFromStatus(res.status, errMsg ?? `HTTP ${res.status}`, res.headers.get("retry-after"));
    }
    // OCR：识别开始后出错仍返回 HTTP 200 + error body
    if (errMsg) throw new ToolError(errMsg);
    return json;
  };
}

interface SearchApiResult {
  rerank_score?: number;
  title: string;
  url: string;
  snippet?: string;
  summary?: string;
  content?: string;
  site_name?: string | null;
  date?: string | null;
  authority?: number;
}

/** 联网搜索：给模型看 summary（600–800 字），给 UI 看 snippet（卡片） */
export function deepseekSearch(opts: DeepSeekToolOptions) {
  const call = client(opts);
  return defineTool({
    name: "web_search",
    description:
      "Search the web with DeepSeek's search engine. Supports operators: site:, -site:, \"phrase\", -term, lang:, after:, before:. Query is at most 128 characters.",
    input: z.object({
      query: z.string().min(1).max(128),
      count: z.number().int().min(1).max(50).optional(),
    }),
    async execute({ query, count }, ctx) {
      const json = (await call(
        "/v1/tools/search",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, count: count ?? 8 }) },
        ctx.signal,
      )) as { results?: SearchApiResult[] };
      const results = json.results ?? [];
      const forModel = results
        .map((r, i) => `[${i + 1}] ${r.title}\n${r.url}${r.date ? ` (${r.date})` : ""}\n${r.summary ?? r.snippet ?? ""}`)
        .join("\n\n");
      const cards: Card[] = results.map((r) => ({
        title: r.title,
        ...(r.site_name ? { subtitle: r.site_name } : {}),
        ...(r.snippet ? { lines: [r.snippet] } : {}),
        href: r.url,
      }));
      return {
        content: forModel || "No results.",
        data: { results },
        ...(cards.length ? { ui: { type: "cards" as const, label: "Search results", cards } } : {}),
      };
    },
  });
}

/** 读取网页：由 DeepSeek 服务器抓取并转成 Markdown（不在我们的服务器上发请求，没有 SSRF 风险） */
export function deepseekFetch(opts: DeepSeekToolOptions) {
  const call = client(opts);
  return defineTool({
    name: "read_url",
    description: "Fetch a public web page and return its main content as Markdown.",
    input: z.object({ url: z.url({ protocol: /^https?$/ }).max(8192) }),
    async execute({ url }, ctx) {
      const json = (await call(
        "/v1/tools/fetch",
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) },
        ctx.signal,
      )) as { title?: string; content?: string };
      return { content: `# ${json.title ?? url}\n\n${json.content ?? ""}`, data: { url, title: json.title ?? "" } };
    },
  });
}

export type OcrFileResolver<Ctx> = (
  ref: string,
  ctx: { app: Ctx; signal: AbortSignal },
) => Promise<{ blob: Blob; filename: string }>;

/**
 * OCR：模型只能给出文件引用，文件内容由应用提供的 resolveFile 取得（例如从 R2、上传目录里读）。
 * 识别开始后，断开连接不会取消识别，仍会计费。
 */
export function deepseekOcr<Ctx = unknown>(opts: DeepSeekToolOptions & { resolveFile: OcrFileResolver<Ctx> }) {
  const call = client(opts);
  return defineTool<z.ZodObject<{ file: z.ZodString; layout: z.ZodOptional<z.ZodBoolean> }>, Ctx>({
    name: "ocr",
    description:
      "Recognize text in a document or image (PDF, Word, PowerPoint, PNG, JPEG, ...). `file` is a file reference provided by the application. Set layout=true to keep tables and figures.",
    input: z.object({ file: z.string().min(1), layout: z.boolean().optional() }),
    executionMode: "parallel",
    async execute({ file, layout }, ctx) {
      const { blob, filename } = await opts.resolveFile(file, { app: ctx.app, signal: ctx.signal });
      const form = new FormData();
      form.append("purpose", layout ? "rich_layout_recognition" : "text_recognition");
      form.append("file", blob, filename);
      ctx.update({ stage: "uploading", filename });
      const json = (await call("/v1/tools/ocr", { method: "POST", body: form }, ctx.signal)) as {
        page_count?: number;
        pages?: Array<{ index: number; text: string; finish_reason?: string }>;
      };
      const pages = json.pages ?? [];
      const truncated = pages.filter((p) => p.finish_reason === "length").map((p) => p.index + 1);
      const text = pages.map((p) => `--- page ${p.index + 1} ---\n${p.text}`).join("\n\n");
      return {
        content: truncated.length ? `${text}\n\n(Note: pages ${truncated.join(", ")} were cut off and are incomplete.)` : text,
        data: { pageCount: json.page_count ?? pages.length, truncatedPages: truncated },
      };
    },
  });
}
