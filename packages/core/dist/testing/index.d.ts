import { B as Block, l as FinishReason, U as Usage, s as ProviderError, P as Provider, a as ModelRequest, C as Capabilities } from '../provider-CmTkRKQo.js';

/**
 * 测试工具：按脚本输出 ProviderEvent 的假 provider。
 * 应用和 core 自己的测试都用它，不需要真实的 API key。
 */

type ScriptedTurn = {
    blocks: Block[];
    finish?: FinishReason;
    usage?: Usage;
    /** 文字和 thinking 按这个长度切成多个增量，默认 4 */
    chunkSize?: number;
    /** 每个增量之间等待的毫秒数（测试中止、插话等时序用），默认 0 */
    delayMs?: number;
    /** 输出这么多个文字增量之后抛出 failWith（模拟流到一半断开） */
    failAfterDeltas?: number;
    failWith?: ProviderError;
} | {
    error: ProviderError;
};
interface ScriptedProvider extends Provider {
    /** 收到的每次请求（深拷贝），用于断言 */
    readonly requests: ModelRequest[];
    /** 还没消费的脚本条数 */
    remaining(): number;
}
declare const DEFAULT_TEST_CAPABILITIES: Capabilities;
declare function scriptedProvider(turns: ScriptedTurn[], opts?: {
    id?: string;
    capabilities?: Partial<Capabilities>;
    price?: Provider["price"];
}): ScriptedProvider;
/** 便捷构造：一个只回复文字的 turn */
declare function textTurn(text: string, extra?: Omit<Extract<ScriptedTurn, {
    blocks: Block[];
}>, "blocks">): ScriptedTurn;
/** 便捷构造：一个调用工具的 turn。args 是对象时用 JSON.stringify，传字符串则原样作为模型输出 */
declare function toolTurn(calls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown> | string;
}>, leadingText?: string): ScriptedTurn;

export { DEFAULT_TEST_CAPABILITIES, type ScriptedProvider, type ScriptedTurn, scriptedProvider, textTurn, toolTurn };
