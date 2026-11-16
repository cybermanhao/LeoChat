/**
 * 默认的上下文压缩器（设计文档 §8，参考 dsh packages/compaction）。
 *
 * 触发：估算的请求 token ≥ min(窗口 × thresholdRatio, 窗口 − 输出预留 − headroomTokens)，或 force（上下文溢出）。
 * 1. 修剪：保留区之外、文字超过 headChars + tailChars 的工具结果，裁成"开头 + 已省略标记 + 结尾"。不调用模型；
 *    如果这样就降到阈值以下，到此为止。
 * 2. 摘要：从第一条非 system 消息到"保留区"之前的这一段，交给模型压缩成结构化检查点，替换成一条 user 消息。
 *    - 保留区：最近约 retainRatio × (窗口 − 输出预留) 的对话原样保留；切分点不拆开工具调用和结果
 *    - 摘要请求复用同样的 system 和工具，被压缩的原文作为前缀，压缩指令放在最后，以命中前缀缓存
 *    - 失败就不压缩：模型出错、被截断、没有输出文字，或摘要不比原文短，都返回 null
 *
 * 和 dsh 的两处不同：中文按 1 字 1 token 估算（dsh 按 4 字符 1 token，会严重低估中文）；摘要用对话本身的语言书写。
 */
import type { Block, Message, TextBlock, ToolResultBlock } from "./blocks";
import type { CompactionInfo } from "./events";
import { newId } from "./messages";
import type { ModelRequest, ToolDef } from "./provider";
import type { Compactor } from "./run-types";
import { toModelMessages } from "./run";
import type { Usage } from "./usage";

export const SUMMARY_OPEN_TAG = "<compacted-summary>";
export const SUMMARY_CLOSE_TAG = "</compacted-summary>";
export const PRUNED_MARKER = "\n\n[... tool result middle pruned ...]\n\n";

export interface CompactorOptions {
  /** 默认 0.8 */
  thresholdRatio?: number;
  /** 输出预留之外的额外余量，默认 65536 */
  headroomTokens?: number;
  /** 原样保留的近期对话占 (窗口 − 输出预留) 的比例，默认 0.16 */
  retainRatio?: number;
  /** 工具结果修剪：保留开头/结尾多少个字符，默认 4096 / 1024 */
  headChars?: number;
  tailChars?: number;
  /** 摘要请求的输出上限，默认 16384 */
  summaryMaxTokens?: number;
  /** 摘要用的模型；默认与对话相同（相同模型才能命中缓存） */
  summaryModel?: string;
  /** 被替换掉的原始消息交给调用方存档（例如写进会话日志），压缩不会因为存档失败而失败 */
  archive?: (replaced: Message[], info: CompactionInfo) => void | Promise<void>;
  /** 估算 token 的函数，默认 estimateTokens */
  estimate?: (text: string) => number;
}

const INSTRUCTION = [
  "You are now acting as a compaction engine for this AI assistant. Condense the conversation ABOVE into a structured checkpoint that lets another model resume the work with no loss of essential context.",
  "",
  'Output EXACTLY the Markdown structure below: keep every section, in order. Use terse bullets, not prose paragraphs. Write "(none)" for an empty section — never drop a section.',
  "",
  "## Primary Request and Intent",
  "- [the user's original and evolving goals; quote verbatim where the exact wording matters]",
  "",
  "## Key Concepts",
  "- [domain concepts, technologies, entities, and conventions in play]",
  "",
  "## Files, Data and Sources",
  "- [exact paths, ids, URLs, records or tool results that matter, and why]",
  "",
  "## Errors and Fixes",
  "- [error: how it was resolved, plus any related user feedback]",
  "",
  "## Pending Tasks",
  "- [explicitly requested work not yet completed]",
  "",
  "## Current Work",
  "- [precisely what was in progress at this checkpoint]",
  "",
  "## Next Step",
  '- [the single next action, directly in line with the most recent request, or "(none)"]',
  "",
  "## Critical Context",
  "- [decisions and their rationale, constraints, user preferences, open questions, data needed to continue]",
  "",
  "Rules:",
  "- Write in the same language the user writes in. Preserve exact file paths, commands, error strings, identifiers, ids, numbers and quoted wording.",
  "- Capture user feedback and explicit instructions faithfully, especially corrections.",
  "- Do NOT mention this summarization request or that the context was compacted.",
  "- Output only the checkpoint text: do not call any tool or take any other action.",
  `- If the conversation already contains a ${SUMMARY_OPEN_TAG} block, it is a PRIOR checkpoint. Do not copy it forward verbatim: preserve still-true facts, drop stale ones, and merge newer information into a single consolidated summary under the same structure.`,
].join("\n");

const PREAMBLE =
  "This is an automatically generated checkpoint condensing an earlier span of the conversation to free up context. Treat the captured context as established background and build on it without restating it. Continue the task directly from the messages that follow, without acknowledging this checkpoint.";

// ── token 估算 ────────────────────────────────────────────────────────────

const CJK = /[　-〿぀-ヿ㐀-䶿一-鿿가-힯＀-￯]/g;

/** 启发式估算：CJK 每字约 1 token（偏保守），其余每 4 个字符约 1 token */
export function estimateTokens(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  return cjk + Math.ceil((text.length - cjk) / 4);
}

function blockText(b: Block): string {
  switch (b.type) {
    case "text":
    case "thinking":
      return b.text;
    case "tool_use":
      return b.name + b.arguments;
    case "tool_result":
      return b.content.map((c) => (c.type === "text" ? c.text : "[image]")).join("");
    case "server_tool_use":
      return b.name + JSON.stringify(b.input);
    case "server_tool_result":
      // 官方：之前轮次的搜索结果不会进入后续上下文（只保留回答文字），这里按很小的开销计
      return "";
    case "image":
      return "x".repeat(4 * 800); // 约 800 token 的图片占位估算
    case "file":
      return "x".repeat(4 * 2000);
  }
}

export function estimateMessage(m: Message, estimate = estimateTokens): number {
  return 4 + m.content.reduce((n, b) => n + estimate(blockText(b)), 0);
}

/**
 * 估算下一次请求的输入 token：以上一次请求的真实用量为基准（输入 + 输出），
 * 加上最后一条 assistant 消息之后新增的消息；没有基准时整体估算。
 */
export function measureRequest(
  messages: Message[],
  opts: { lastUsage?: Usage; system?: string; tools?: ToolDef[]; estimate?: (t: string) => number },
): number {
  const est = opts.estimate ?? estimateTokens;
  if (opts.lastUsage && opts.lastUsage.inputTokens > 0) {
    let i = messages.length - 1;
    while (i >= 0 && messages[i]!.role !== "assistant") i--;
    const added = messages.slice(i + 1).reduce((n, m) => n + estimateMessage(m, est), 0);
    return opts.lastUsage.inputTokens + opts.lastUsage.outputTokens + added;
  }
  const system = opts.system ? est(opts.system) : 0;
  const tools = opts.tools?.length ? est(JSON.stringify(opts.tools)) : 0;
  return system + tools + messages.reduce((n, m) => n + estimateMessage(m, est), 0);
}

// ── 切分 ─────────────────────────────────────────────────────────────────

/** 在下标 k 处切开是否安全：k 之前的每个 tool_use 都在 k 之前得到了结果 */
export function cutIsBalanced(messages: Message[], k: number): boolean {
  const open = new Set<string>();
  for (let i = 0; i < k; i++) {
    for (const b of messages[i]!.content) {
      if (b.type === "tool_use") open.add(b.id);
      if (b.type === "tool_result") open.delete(b.toolUseId);
    }
  }
  return open.size === 0;
}

function pruneText(text: string, head: number, tail: number): string {
  const chars = [...text]; // 按码点切，避免切坏 emoji / 代理对
  if (chars.length <= head + tail) return text;
  return chars.slice(0, head).join("") + PRUNED_MARKER + chars.slice(chars.length - tail).join("");
}

// ── 压缩器 ───────────────────────────────────────────────────────────────

export function createCompactor(o: CompactorOptions = {}): Compactor {
  const thresholdRatio = o.thresholdRatio ?? 0.8;
  const headroom = o.headroomTokens ?? 65_536;
  const retainRatio = o.retainRatio ?? 0.16;
  const head = o.headChars ?? 4096;
  const tail = o.tailChars ?? 1024;
  const summaryMaxTokens = o.summaryMaxTokens ?? 16_384;
  if (!(retainRatio > 0 && retainRatio < thresholdRatio && thresholdRatio <= 1)) {
    throw new RangeError("createCompactor: require 0 < retainRatio < thresholdRatio <= 1");
  }

  return {
    async maybeCompact(input) {
      const { messages, capabilities, provider, model, system, tools, signal } = input;
      // 估算优先级：显式传入 > provider 自己的分词估算 > core 的保守估算
      const est = o.estimate ?? (provider.estimateTokens ? (t: string) => provider.estimateTokens!(t) : estimateTokens);
      const window = capabilities.contextWindow;
      const reserve = input.maxOutputTokens ?? Math.min(capabilities.maxOutput, 8192);
      const threshold = Math.floor(Math.min(window * thresholdRatio, window - reserve - headroom));
      const retainBudget = Math.floor(retainRatio * (window - reserve));
      const measure = (ms: Message[], useAnchor: boolean) =>
        measureRequest(ms, {
          ...(useAnchor && input.lastUsage ? { lastUsage: input.lastUsage } : {}),
          ...(system !== undefined ? { system } : {}),
          ...(tools ? { tools } : {}),
          estimate: est,
        });

      const before = measure(messages, true);
      if (!input.force && before < threshold) return null;

      // 前面的 system 消息不参与压缩
      let first = 0;
      while (first < messages.length && messages[first]!.role === "system") first++;

      // 1. 修剪所有超长工具结果（与 dsh 一致：触发后最近的也修剪，否则一个巨大的最新结果会一直占着保留区）
      const replaced = new Set<string>();
      const pruned = messages.map((m) => {
        if (m.role !== "tool") return m;
        let changed = false;
        const content = m.content.map((b): Block => {
          if (b.type !== "tool_result") return b;
          const inner = b.content.map((c): ToolResultBlock["content"][number] => {
            if (c.type !== "text") return c;
            const t = pruneText(c.text, head, tail);
            if (t !== c.text) changed = true;
            return t === c.text ? c : ({ ...c, text: t } satisfies TextBlock);
          });
          return { ...b, content: inner };
        });
        if (!changed) return m;
        replaced.add(m.id);
        return { ...m, content };
      });
      const afterPrune = measure(pruned, false);
      if (replaced.size > 0 && !input.force && afterPrune < threshold) {
        const info: CompactionInfo = { kind: "prune", replacedMessageIds: [...replaced], estimatedTokensFreed: Math.max(0, measure(messages, false) - afterPrune) };
        await archive(o, messages.filter((m) => replaced.has(m.id)), info);
        return { messages: pruned, info };
      }

      // 2. 摘要。保留区在修剪后的消息上计算：从末尾往前累计到 retainBudget，再往前挪到一个安全的切分点
      let keepFrom = pruned.length;
      let acc = 0;
      for (let i = pruned.length - 1; i >= first; i--) {
        acc += estimateMessage(pruned[i]!, est);
        keepFrom = i;
        if (acc >= retainBudget) break;
      }
      while (keepFrom > first && !cutIsBalanced(pruned, keepFrom)) keepFrom--;
      if (keepFrom <= first) {
        // 没有可以压缩的区间（整段都在保留区里）：有修剪就交修剪结果
        if (replaced.size === 0) return null;
        const info: CompactionInfo = { kind: "prune", replacedMessageIds: [...replaced], estimatedTokensFreed: Math.max(0, measure(messages, false) - afterPrune) };
        await archive(o, messages.filter((m) => replaced.has(m.id)), info);
        return { messages: pruned, info };
      }
      // 用原文（未修剪）做前缀，才能命中上一次请求的缓存；切分点对原文和修剪后的消息相同（修剪不增删消息）
      const region = messages.slice(first, keepFrom);
      const req: ModelRequest = {
        model: o.summaryModel ?? model,
        ...(system !== undefined ? { system } : {}),
        messages: [...toModelMessages(region), { id: newId("msg_"), role: "user", content: [{ type: "text", text: INSTRUCTION }] }],
        ...(tools?.length ? { tools } : {}),
        thinking: false,
        maxOutputTokens: summaryMaxTokens,
      };
      let summary = "";
      let finish: string | undefined;
      try {
        for await (const ev of provider.stream(req, signal)) {
          if (ev.type === "block_end" && ev.block.type === "text") summary += ev.block.text;
          if (ev.type === "finish") finish = ev.reason;
        }
      } catch {
        return null; // 失败就不压缩；溢出场景由 core 报错
      }
      summary = summary.trim();
      if (!summary || finish === "max_tokens" || finish === "refusal") return null;

      const summaryMessage: Message = {
        id: newId("msg_"),
        role: "user",
        content: [{ type: "text", text: `${PREAMBLE}\n\n${SUMMARY_OPEN_TAG}\n${summary}\n${SUMMARY_CLOSE_TAG}` }],
      };
      const regionTokens = region.reduce((n, m) => n + estimateMessage(m, est), 0);
      if (estimateMessage(summaryMessage, est) >= regionTokens) return null; // 摘要不比原文短：放弃

      const compacted = [...pruned.slice(0, first), summaryMessage, ...pruned.slice(keepFrom)];
      const info: CompactionInfo = {
        kind: "summary",
        replacedMessageIds: region.map((m) => m.id),
        estimatedTokensFreed: Math.max(0, measure(messages, false) - measure(compacted, false)),
        summaryMessageId: summaryMessage.id,
      };
      await archive(o, region, info);
      return { messages: compacted, info };
    },
  };
}

async function archive(o: CompactorOptions, replaced: Message[], info: CompactionInfo): Promise<void> {
  if (!o.archive) return;
  try {
    await o.archive(replaced, info);
  } catch {
    // 存档失败不影响压缩
  }
}
