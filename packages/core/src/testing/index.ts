/**
 * 测试工具：按脚本输出 ProviderEvent 的假 provider。
 * 应用和 core 自己的测试都用它，不需要真实的 API key。
 */
import type { Block } from "../blocks";
import {
  ProviderError,
  type Capabilities,
  type ModelRequest,
  type Provider,
  type ProviderEvent,
} from "../provider";
import type { FinishReason, Usage } from "../usage";

export type ScriptedTurn =
  | {
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
    }
  | { error: ProviderError };

export interface ScriptedProvider extends Provider {
  /** 收到的每次请求（深拷贝），用于断言 */
  readonly requests: ModelRequest[];
  /** 还没消费的脚本条数 */
  remaining(): number;
}

export const DEFAULT_TEST_CAPABILITIES: Capabilities = {
  contextWindow: 128_000,
  maxOutput: 8_192,
  tools: true,
  parallelToolCalls: true,
  thinking: true,
  vision: false,
  files: false,
  serverTools: [],
  cacheStats: true,
};

function chunks(text: string, size: number): string[] {
  if (text === "") return [];
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function defaultFinish(blocks: Block[]): FinishReason {
  return blocks.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn";
}

export function scriptedProvider(
  turns: ScriptedTurn[],
  opts: { id?: string; capabilities?: Partial<Capabilities>; price?: Provider["price"] } = {},
): ScriptedProvider {
  const queue = [...turns];
  const requests: ModelRequest[] = [];
  const caps: Capabilities = { ...DEFAULT_TEST_CAPABILITIES, ...opts.capabilities };

  const provider: ScriptedProvider = {
    id: opts.id ?? "scripted",
    requests,
    remaining: () => queue.length,
    capabilities: () => caps,
    ...(opts.price ? { price: opts.price } : {}),
    async *stream(req: ModelRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent> {
      requests.push(structuredClone(req));
      const turn = queue.shift();
      if (!turn) throw new ProviderError("unknown", "scriptedProvider: no more scripted turns");
      if ("error" in turn) throw turn.error;

      const size = turn.chunkSize ?? 4;
      let deltasSent = 0;
      const delay = turn.delayMs ?? 0;
      for (const [index, block] of turn.blocks.entries()) {
        signal?.throwIfAborted();
        if (block.type === "text" || block.type === "thinking") {
          yield { type: "block_start", index, block: { type: block.type } };
          for (const piece of chunks(block.text, size)) {
            await sleep(delay, signal);
            signal?.throwIfAborted();
            yield { type: "block_delta", index, delta: { kind: block.type, text: piece } };
            if (turn.failAfterDeltas !== undefined && ++deltasSent >= turn.failAfterDeltas) {
              throw turn.failWith ?? new ProviderError("network", "scripted mid-stream failure");
            }
          }
        } else if (block.type === "tool_use") {
          yield { type: "block_start", index, block: { type: "tool_use", id: block.id, name: block.name } };
          for (const piece of chunks(block.arguments, size)) {
            await sleep(delay, signal);
            signal?.throwIfAborted();
            yield { type: "block_delta", index, delta: { kind: "input_json", partial: piece } };
          }
        } else {
          yield { type: "block_start", index, block: { type: block.type } };
        }
        yield { type: "block_end", index, block: structuredClone(block) };
      }
      yield { type: "usage", usage: turn.usage ?? { inputTokens: 10, outputTokens: 5 } };
      yield { type: "finish", reason: turn.finish ?? defaultFinish(turn.blocks) };
    },
  };
  return provider;
}

/** 便捷构造：一个只回复文字的 turn */
export function textTurn(text: string, extra: Omit<Extract<ScriptedTurn, { blocks: Block[] }>, "blocks"> = {}): ScriptedTurn {
  return { blocks: [{ type: "text", text }], ...extra };
}

/** 便捷构造：一个调用工具的 turn。args 是对象时用 JSON.stringify，传字符串则原样作为模型输出 */
export function toolTurn(
  calls: Array<{ id: string; name: string; args: Record<string, unknown> | string }>,
  leadingText?: string,
): ScriptedTurn {
  const blocks: Block[] = [];
  if (leadingText) blocks.push({ type: "text", text: leadingText });
  for (const c of calls) {
    const raw = typeof c.args === "string" ? c.args : JSON.stringify(c.args);
    let input: unknown;
    try {
      input = JSON.parse(raw);
    } catch {
      input = undefined;
    }
    blocks.push({ type: "tool_use", id: c.id, name: c.name, arguments: raw, ...(input === undefined ? {} : { input }) });
  }
  return { blocks };
}
