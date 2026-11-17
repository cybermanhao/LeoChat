import { SessionStore, AgentEvent, Message, SkillSource, SkillMeta, ToolSource, TranscriptOp } from '@leochat/core';

interface JsonlStoreOptions {
    /** 短锁最长等待时间，默认 5 秒 */
    lockTimeoutMs?: number;
    now?: () => number;
}
interface JsonlStore extends SessionStore {
    readonly dir: string;
    appendEvents(runId: string, events: AgentEvent[]): Promise<void>;
    /** 读取事件日志（回放用） */
    readEvents(runId: string): Promise<AgentEvent[]>;
    /** 把压缩时被替换掉的原始消息追加进事件日志（配合 createCompactor 的 archive 回调） */
    archiveMessages(runId: string, messages: Message[]): Promise<void>;
}
declare function jsonlStore(dir: string, opts?: JsonlStoreOptions): Promise<JsonlStore>;

interface ParsedSkill {
    meta: Record<string, string | boolean | string[]>;
    body: string;
}
/**
 * 解析 SKILL.md 的 frontmatter。支持 CRLF、带引号的值、[a, b] 数组、true/false，
 * 以及 YAML 的折叠块（`key: >`）和字面块（`key: |`）。不依赖 YAML 库
 */
declare function parseSkillMd(content: string): ParsedSkill;
interface FoundSkill extends SkillMeta {
    file: string;
}
/**
 * 扫描若干根目录。同名 skill 以先出现的根目录为准（例如项目目录优先于用户目录）。
 * `disable-model-invocation: true` 的 skill 不进目录（只能由用户显式调用）
 */
declare function fsSkills(roots: string[]): SkillSource & {
    scan(): Promise<FoundSkill[]>;
};

interface StdioMcpOptions {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
    /** 给工具名加前缀，避免多个 server 重名 */
    prefix?: string;
    /** 子进程的 stderr：默认 "inherit"（打印到当前进程）；"ignore" 静默 */
    stderr?: "inherit" | "ignore" | "pipe";
}
declare function stdioMcpTools<Ctx = unknown>(opts: StdioMcpOptions): ToolSource<Ctx>;

interface ConversationMeta {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
}
interface ConversationLog {
    readonly dir: string;
    create(title?: string): Promise<ConversationMeta>;
    list(): Promise<ConversationMeta[]>;
    load(id: string): Promise<{
        meta: ConversationMeta;
        transcript: Message[];
    } | null>;
    append(id: string, op: TranscriptOp): Promise<void>;
    setTitle(id: string, title: string): Promise<void>;
    delete(id: string): Promise<void>;
    /** 直接交给 run({ persist })：每次 transcript 变化都写进这个会话的日志 */
    persistFor(id: string): (op: TranscriptOp) => Promise<void>;
}
declare function conversationLog(dir: string, opts?: {
    now?: () => number;
}): Promise<ConversationLog>;

export { type ConversationLog, type ConversationMeta, type JsonlStore, type JsonlStoreOptions, type ParsedSkill, type StdioMcpOptions, conversationLog, fsSkills, jsonlStore, parseSkillMd, stdioMcpTools };
