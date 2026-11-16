import * as _leochat_core from '@leochat/core';
import { Provider, Capabilities, ModelRequest, Message, ProviderEvent, Usage, ProviderError } from '@leochat/core';
import { z } from 'zod';

/**
 * DeepSeek provider：走 Anthropic 兼容的 Messages 端点（设计文档 D13、§13 Spike 2）。
 * 这个端点会返回完整的服务端搜索结果块和带原文片段的引用，和 core 的 content-block 模型几乎一一对应。
 */

interface DeepSeekOptions {
    apiKey: string;
    /** 默认 https://api.deepseek.com */
    baseURL?: string;
    fetch?: typeof fetch;
    /** Anthropic 端点要求 max_tokens；请求没指定时用这个值，默认 8192 */
    defaultMaxTokens?: number;
}
type Json = Record<string, unknown>;
declare function deepseekCapabilities(model: string): Capabilities;
/** core Message[] → Anthropic messages；system 角色合并进 system；连续的 user 侧消息（tool + user）合并成一条 */
declare function toWireMessages(messages: Message[], system?: string): {
    system?: string;
    messages: Json[];
};
declare function buildBody(req: ModelRequest, defaultMaxTokens: number): Json;
declare function errorFromStatus(status: number, message: string, retryAfter?: string | null): ProviderError;
/** Anthropic 风格 usage → core Usage。inputTokens 统一为全部输入（含缓存命中） */
declare function toUsage(u: Json): Usage;
/** 把 Messages 端点的 SSE 记录翻译成 core 的 ProviderEvent */
declare function mapMessagesStream(records: AsyncIterable<{
    event?: string;
    data: string;
}>): AsyncGenerator<ProviderEvent>;
declare const FILES_BETA = "files-api-2025-04-14";
/**
 * DeepSeek 分词的估算：中文约每字 0.6 token（2026-11-16 用真实 usage 校准：7838 个中文字 ≈ 4560 token），
 * 其余约每 4 个字符 1 token
 */
declare function estimateDeepSeekTokens(text: string): number;
/** 消息里是否引用了 Files API 上传的文件（图片 file_id 或文档 file 块，含工具结果里的图片） */
declare function referencesUploadedFiles(messages: Message[]): boolean;
declare function deepseek(opts: DeepSeekOptions): Provider;

interface DeepSeekToolOptions {
    apiKey: string;
    baseURL?: string;
    fetch?: typeof fetch;
}
/** 联网搜索：给模型看 summary（600–800 字），给 UI 看 snippet（卡片） */
declare function deepseekSearch(opts: DeepSeekToolOptions): _leochat_core.Tool<z.ZodObject<{
    query: z.ZodString;
    count: z.ZodOptional<z.ZodNumber>;
}, z.core.$strip>, unknown>;
/** 读取网页：由 DeepSeek 服务器抓取并转成 Markdown（不在我们的服务器上发请求，没有 SSRF 风险） */
declare function deepseekFetch(opts: DeepSeekToolOptions): _leochat_core.Tool<z.ZodObject<{
    url: z.ZodURL;
}, z.core.$strip>, unknown>;
type OcrFileResolver<Ctx> = (ref: string, ctx: {
    app: Ctx;
    signal: AbortSignal;
}) => Promise<{
    blob: Blob;
    filename: string;
}>;
/**
 * OCR：模型只能给出文件引用，文件内容由应用提供的 resolveFile 取得（例如从 R2、上传目录里读）。
 * 识别开始后，断开连接不会取消识别，仍会计费。
 */
declare function deepseekOcr<Ctx = unknown>(opts: DeepSeekToolOptions & {
    resolveFile: OcrFileResolver<Ctx>;
}): _leochat_core.Tool<z.ZodObject<{
    file: z.ZodString;
    layout: z.ZodOptional<z.ZodBoolean>;
}, z.core.$strip>, Ctx>;

/**
 * DeepSeek 计价（2026-11-14 取自 https://api-docs.deepseek.com/quick_start/pricing）。
 * 价格会变，表格集中在这里，接入前以官方页面为准。
 */

interface Rates {
    /** 美元 / 百万 token */
    cacheHit: number;
    cacheMiss: number;
    output: number;
}
/** 闲时价格；忙时是它的 2 倍 */
declare const OFF_PEAK_RATES: Record<string, Rates>;
/** 工具费用：美元 / 次 */
declare const TOOL_FEES: {
    readonly search: number;
    readonly fetch: number;
    /** 美元 / 页 */
    readonly ocrPage: number;
};
/**
 * 忙时：UTC 01:00–04:00、06:00–10:00，周一到周五。
 * 官方说明还排除中国法定节假日，这里没有节假日表，节假日也按忙时计（略高估）。
 */
declare function isPeak(at: Date): boolean;
declare function priceUsage(model: string, usage: Usage, at: Date): number | undefined;

type FilePurpose = "user_data" | "text_recognition" | "rich_layout_recognition";
interface UploadedFile {
    id: string;
    bytes: number;
    filename: string;
    purpose: FilePurpose;
    created_at: number;
    expires_at?: number;
}
interface DeepSeekFilesOptions {
    apiKey: string;
    baseURL?: string;
    fetch?: typeof fetch;
}
declare function deepseekFiles(opts: DeepSeekFilesOptions): {
    /**
     * 上传文件。文档在上传时解析，返回后 file_id 即可使用。
     * expiresAfterSeconds：3600–2592000；省略则永久保存（每个账号 25 GiB、1 万个文件上限）
     */
    upload(file: Blob, filename: string, purpose: FilePurpose, o?: {
        expiresAfterSeconds?: number;
        signal?: AbortSignal;
    }): Promise<UploadedFile>;
    delete(fileId: string): Promise<void>;
};

/** 最小的 SSE 解析器：把字节流切成 { event, data } 记录（只用 Web 标准 API） */
interface SseRecord {
    event?: string;
    data: string;
}
declare function parseSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseRecord>;

export { type DeepSeekFilesOptions, type DeepSeekOptions, type DeepSeekToolOptions, FILES_BETA, type FilePurpose, OFF_PEAK_RATES, type OcrFileResolver, type SseRecord, TOOL_FEES, type UploadedFile, buildBody, deepseek, deepseekCapabilities, deepseekFetch, deepseekFiles, deepseekOcr, deepseekSearch, errorFromStatus, estimateDeepSeekTokens, isPeak, mapMessagesStream, parseSse, priceUsage, referencesUploadedFiles, toUsage, toWireMessages };
