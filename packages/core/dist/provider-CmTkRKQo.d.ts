/**
 * 声明式 UI 提示（设计文档 §9）。
 * 工具只返回数据；UI 提示由服务端从数据生成，随 ToolOutput.ui 一起返回，不发给模型。
 * 经 MCP 传输时放在工具结果的 `_meta["leochat/ui"]` 里（`_meta.ui` 已被 MCP Apps 规范占用）。
 */
declare const UI_META_KEY = "leochat/ui";
type UiHint = CardsHint | CustomHint | McpAppHint;
interface CardsHint {
    type: "cards";
    label?: string;
    cards: Card[];
}
interface Card {
    id?: string;
    title: string;
    subtitle?: string;
    avatar?: {
        text: string;
        hue: number;
    } | {
        imageUrl: string;
    };
    /** 语义色调，由宿主主题映射成具体颜色 */
    badges?: Array<{
        text: string;
        tone?: "success" | "warning" | "neutral";
    }>;
    tags?: Array<{
        text: string;
        code?: string;
    }>;
    lines?: string[];
    note?: string;
    href?: string;
    actions?: CardAction[];
}
type CardAction = 
/** 把一句话填进对话并发送 */
{
    kind: "ask";
    label: string;
    text: string;
}
/** 直接调用 visibility 包含 'app' 的工具 */
 | {
    kind: "tool";
    label: string;
    tool: string;
    input: unknown;
}
/** 回答一个待审批的调用（approvalId 是不透明 ID） */
 | {
    kind: "approve";
    label: string;
    approvalId: string;
    outcome: "allowed-once" | "rejected";
} | {
    kind: "link";
    label: string;
    url: string;
};
/** 应用私有的富组件，例如 'expo.route_map'。宿主不认识就忽略，显示文字降级 */
interface CustomHint {
    type: "custom";
    kind: string;
    data: unknown;
}
/** 预留给第二期 MCP Apps 宿主：指向 ui:// 资源 */
interface McpAppHint {
    type: "mcp_app";
    resourceUri: string;
}

/**
 * 内部消息模型：content-block（设计文档 §1）。
 * 一条消息的 content 是有序的、带类型的块数组；provider adapter 负责翻译成各家的线上格式。
 */

type Role = "system" | "user" | "assistant" | "tool";
interface Message {
    /** 引擎生成的稳定 ID，用于视图、重放和压缩时定位 */
    id: string;
    role: Role;
    content: Block[];
}
type Block = TextBlock | ThinkingBlock | ToolUseBlock | ToolResultBlock | ServerToolUseBlock | ServerToolResultBlock | ImageBlock | FileBlock;
type BlockType = Block["type"];
interface BlockBase {
    /**
     * provider 私有的往返数据（thinking 的 signature、搜索结果的 encrypted_content 等）。
     * core 不解释它的内容，只保证原样回传给同一个 provider。
     */
    providerData?: Record<string, unknown>;
}
interface Citation {
    url: string;
    title?: string;
    citedText?: string;
    providerData?: Record<string, unknown>;
}
interface SearchResult {
    url: string;
    title: string;
    snippet?: string;
    siteName?: string;
    date?: string;
    providerData?: Record<string, unknown>;
}
interface TextBlock extends BlockBase {
    type: "text";
    text: string;
    citations?: Citation[];
}
/** 推理内容。DeepSeek 的 reasoning_content、Anthropic 的 thinking 都映射到这里 */
interface ThinkingBlock extends BlockBase {
    type: "thinking";
    text: string;
}
interface ToolUseBlock extends BlockBase {
    type: "tool_use";
    id: string;
    name: string;
    /**
     * 准确值（C2）：模型产出的原始 JSON 字符串。
     * 回传给 provider 时逐字节原样发送，以保证前缀缓存命中。
     */
    arguments: string;
    /** 由 arguments 解析出的派生值；解析失败时为 undefined */
    input?: unknown;
}
interface ToolResultBlock extends BlockBase {
    type: "tool_result";
    toolUseId: string;
    /** 给模型看的内容 */
    content: Array<TextBlock | ImageBlock>;
    isError?: boolean;
    /** 不发给模型：结构化数据。provider adapter 必须去掉 */
    data?: unknown;
    /** 不发给模型：UI 提示。provider adapter 必须去掉 */
    ui?: UiHint;
}
/** 服务端工具调用（例如 DeepSeek 的 deepseek_web_search），由 provider 执行 */
interface ServerToolUseBlock extends BlockBase {
    type: "server_tool_use";
    id: string;
    name: string;
    input: unknown;
}
interface ServerToolResultBlock extends BlockBase {
    type: "server_tool_result";
    toolUseId: string;
    name: string;
    results: SearchResult[];
}
interface ImageBlock extends BlockBase {
    type: "image";
    source: {
        kind: "url" | "base64" | "file_id";
        value: string;
        mediaType?: string;
    };
}
interface FileBlock extends BlockBase {
    type: "file";
    fileId: string;
    filename?: string;
}
/** 解析工具参数；解析失败或结果不是对象时返回 undefined（原始字符串仍保留在 arguments 里） */
declare function parseToolArguments(raw: string): unknown;

type ServerToolKind = "web_search" | "read_url";
/**
 * 统一后的 token 用量。
 * inputTokens 一律表示**全部输入**（含缓存命中部分）。Anthropic 风格的 input_tokens 不含缓存读取，
 * adapter 负责换算（设计文档 §13 Spike 2）。
 */
interface Usage {
    inputTokens: number;
    outputTokens: number;
    cacheHitTokens?: number;
    cacheMissTokens?: number;
    reasoningTokens?: number;
    serverToolCalls?: Partial<Record<ServerToolKind | "image_search", number>>;
}
type FinishReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "stop_sequence" | "other";
declare function emptyUsage(): Usage;
/** 把两份用量相加（用于把多个 step 的用量累计成整次运行的用量） */
declare function addUsage(a: Usage, b: Usage): Usage;

/**
 * Provider 接口与能力声明（设计文档 §2）。
 * 每个 adapter 把自己的线上协议翻译成同一套 ProviderEvent；
 * tool_calls 增量拼接、JSON 解析、错误分类都在 adapter 里一次性做完。
 */

type JsonSchema = Record<string, unknown>;
interface Capabilities {
    contextWindow: number;
    maxOutput: number;
    tools: boolean;
    parallelToolCalls: boolean;
    thinking: boolean;
    vision: boolean;
    files: boolean;
    serverTools: ServerToolKind[];
    /** 是否返回缓存命中和未命中的 token 数 */
    cacheStats: boolean;
    /** 开启服务端工具后会被忽略的参数，供上层提示用 */
    ignoredWhenServerTools?: string[];
}
interface ToolDef {
    name: string;
    description: string;
    inputSchema: JsonSchema;
}
interface ModelRequest {
    model: string;
    system?: string;
    messages: Message[];
    /** 只包含模型可见的工具 */
    tools?: ToolDef[];
    serverTools?: ServerToolKind[];
    thinking?: boolean | {
        effort: "low" | "medium" | "high";
    };
    maxOutputTokens?: number;
    temperature?: number;
    /** DeepSeek safety_check。面向公众的应用必须开启 */
    safetyCheck?: "high";
    /** 逃生口：原样交给 adapter */
    providerOptions?: Record<string, unknown>;
}
type BlockDelta = {
    kind: "text";
    text: string;
} | {
    kind: "thinking";
    text: string;
} | {
    kind: "input_json";
    partial: string;
} | {
    kind: "citation";
    citation: Citation;
};
/** 归一化后的流事件。每个 provider adapter 都输出同一套事件 */
type ProviderEvent = {
    type: "block_start";
    index: number;
    block: Partial<Block> & {
        type: BlockType;
    };
} | {
    type: "block_delta";
    index: number;
    delta: BlockDelta;
}
/** 完整的块。tool_use 的 arguments 是原始字符串，input 已尽量解析 */
 | {
    type: "block_end";
    index: number;
    block: Block;
} | {
    type: "usage";
    usage: Usage;
} | {
    type: "finish";
    reason: FinishReason;
};
interface Provider {
    readonly id: string;
    capabilities(model: string): Capabilities;
    stream(req: ModelRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent>;
    /** 可选：按 usage 计算费用（美元）。DeepSeek 要区分忙时和闲时 */
    price?(model: string, usage: Usage, at: Date): number | undefined;
    /**
     * 可选：按这个 provider 的分词器估算一段文字的 token 数（压缩器用来判断何时触发）。
     * 不提供时用 core 的保守估算（中文每字 1 token）。各家分词差别很大，例如 DeepSeek 中文约每字 0.6 token
     */
    estimateTokens?(text: string): number;
}
type ProviderErrorKind = "rate_limit" | "overloaded" | "context_overflow" | "auth" | "insufficient_balance" | "invalid_request" | "refusal" | "network" | "unknown";
declare class ProviderError extends Error {
    readonly kind: ProviderErrorKind;
    readonly retryable: boolean;
    readonly status?: number;
    readonly retryAfterMs?: number;
    constructor(kind: ProviderErrorKind, message: string, opts?: {
        status?: number;
        retryAfterMs?: number;
        retryable?: boolean;
        cause?: unknown;
    });
}
declare function isProviderError(e: unknown): e is ProviderError;

export { type McpAppHint as A, type Block as B, type Capabilities as C, type FileBlock as F, type ImageBlock as I, type JsonSchema as J, type Message as M, type Provider as P, type Role as R, type ServerToolKind as S, type ToolUseBlock as T, type Usage as U, type ModelRequest as a, type ToolResultBlock as b, type ToolDef as c, type TextBlock as d, type BlockType as e, type BlockBase as f, type Citation as g, type SearchResult as h, type ThinkingBlock as i, type ServerToolUseBlock as j, type ServerToolResultBlock as k, type FinishReason as l, emptyUsage as m, addUsage as n, type BlockDelta as o, parseToolArguments as p, type ProviderEvent as q, type ProviderErrorKind as r, ProviderError as s, isProviderError as t, UI_META_KEY as u, type UiHint as v, type CardsHint as w, type Card as x, type CardAction as y, type CustomHint as z };
