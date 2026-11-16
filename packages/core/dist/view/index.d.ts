import { g as Citation, v as UiHint, h as SearchResult, I as ImageBlock, F as FileBlock, R as Role, U as Usage, M as Message } from '../provider-CmTkRKQo.js';
import { d as ToolOutput, k as RunEndReason, P as PendingApproval, c as AgentEvent } from '../events-Db5KJiTB.js';
import 'zod';

/**
 * @leochat/core/view —— 把事实事件投影成 UI 状态（设计文档 §7）。
 * reduce() 是纯函数、结构共享，GUI 的 zustand store、博客页、会展页都可以直接用：
 *   set((s) => reduce(s, event))
 * tool part 的状态机参考 Vercel AI SDK UI，并加上审批相关的状态。
 */

type ToolPartState = "input-streaming" | "input-available" | "awaiting-approval" | "running" | "output-available" | "output-error" | "denied";
type ViewPart = {
    type: "text";
    text: string;
    citations?: Citation[];
    streaming: boolean;
    blockIndex?: number;
} | {
    type: "reasoning";
    text: string;
    streaming: boolean;
    blockIndex?: number;
} | {
    type: "tool";
    callId: string;
    name: string;
    state: ToolPartState;
    inputText?: string;
    input?: unknown;
    output?: ToolOutput;
    ui?: UiHint;
    ms?: number;
    progress?: unknown;
    approvalId?: string;
    approvalReason?: string;
    blockIndex?: number;
} | {
    type: "server_tool";
    callId: string;
    name: string;
    input?: unknown;
    results?: SearchResult[];
    blockIndex?: number;
} | {
    type: "image";
    block: ImageBlock;
} | {
    type: "file";
    block: FileBlock;
} | {
    type: "custom";
    name: string;
    data: unknown;
};
interface ViewMessage {
    id: string;
    role: Role;
    parts: ViewPart[];
}
type RunViewStatus = "idle" | "connecting" | "reasoning" | "generating" | "tool_running" | "awaiting_approval" | "done" | "error" | "aborted";
interface RunViewState {
    status: RunViewStatus;
    messages: ViewMessage[];
    usage: Usage;
    costUsd?: number;
    error?: {
        kind: string;
        message: string;
    };
    retry?: {
        attempt: number;
        delayMs: number;
    };
    endReason?: RunEndReason;
    pending?: PendingApproval[];
    queued: {
        steering: Message[];
        followUp: Message[];
    };
    runId?: string;
    /** 内部：运行是否进行中 */
    active: boolean;
}
/** 从 transcript 构建初始视图状态。tool 角色的消息不单独显示，而是并入对应的 tool part */
declare function initialViewState(transcript?: Message[]): RunViewState;
/** GUI 发送前先把用户消息放进视图（乐观显示） */
declare function appendUserMessage(state: RunViewState, message: Message): RunViewState;
/** 由当前状态推导出 status（不需要引擎手动设置 cardStatus） */
declare function deriveStatus(state: RunViewState): RunViewStatus;
declare function reduce(state: RunViewState, event: AgentEvent): RunViewState;

export { type RunViewState, type RunViewStatus, type ToolPartState, type ViewMessage, type ViewPart, appendUserMessage, deriveStatus, initialViewState, reduce };
