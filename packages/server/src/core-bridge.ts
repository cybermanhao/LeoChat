/**
 * GUI 迁移第一步（设计文档 §11）：server 的 /chat 循环改用 @leochat/core 的 run()，前端暂时不变。
 *
 * - legacyProvider：把现有的 LLMService（OpenAI 兼容，覆盖所有已配置的 provider）包成 core Provider
 * - mcpCoreTools：把 MCP 工具包成 core 工具；bash 需要审批
 * - toLegacyMessages：core Message 转成 LLMService 用的旧 ChatMessage
 * 事件翻译成前端认识的旧 SSE 载荷在 routes/index.ts 里完成。
 */
import {
  ProviderError,
  defineTool,
  type AnyTool,
  type Answerer,
  type Block,
  type Capabilities,
  type Message,
  type ModelRequest,
  type Provider,
  type ProviderErrorKind,
  type ProviderEvent,
  type ToolUseBlock,
} from "@leochat/core";
import type { ChatMessage, LLMProvider, ToolCall } from "@ai-chatbox/shared";
import { z } from "zod";
import type { StreamCallbacks } from "./services/llm.js";

/** LLMService 里 bridge 用到的部分（测试里可以注入假的） */
export interface LegacyLLM {
  streamChat(
    request: { messages: ChatMessage[]; model?: string; provider?: LLMProvider; tools?: unknown[]; temperature?: number; maxTokens?: number },
    callbacks: StreamCallbacks,
    options?: { signal?: AbortSignal },
  ): Promise<void>;
}

// ── 消息转换 ─────────────────────────────────────────────────────────────

const textOfBlocks = (blocks: Block[]) => blocks.filter((b): b is Extract<Block, { type: "text" }> => b.type === "text").map((b) => b.text).join("");

/** core 消息 → 旧消息（给 LLMService 用） */
export function toLegacyMessages(messages: Message[], system?: string): ChatMessage[] {
  const out: ChatMessage[] = [];
  const now = Date.now();
  if (system) out.push({ id: "system", role: "system", content: system, timestamp: now });
  for (const m of messages) {
    if (m.role === "tool") {
      for (const b of m.content) {
        if (b.type !== "tool_result") continue;
        out.push({ id: `tool-${b.toolUseId}`, role: "tool", content: textOfBlocks(b.content as Block[]), tool_call_id: b.toolUseId, timestamp: now });
      }
      continue;
    }
    const msg: ChatMessage = { id: m.id, role: m.role, content: textOfBlocks(m.content), timestamp: now };
    const thinking = m.content.filter((b) => b.type === "thinking").map((b) => (b as { text: string }).text).join("");
    if (thinking) msg.reasoning_content = thinking;
    const calls = m.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (calls.length) msg.tool_calls = calls.map((c) => toLegacyToolCall(c, "completed"));
    out.push(msg);
  }
  return out;
}

export function toLegacyToolCall(c: ToolUseBlock, status: ToolCall["status"] = "pending"): ToolCall {
  return { id: c.id, name: c.name, arguments: (c.input ?? {}) as Record<string, unknown>, status };
}

// ── Provider ─────────────────────────────────────────────────────────────

/** 模型能力未知（旧的 LLMService 覆盖很多 provider），按保守值给出 */
const LEGACY_CAPABILITIES: Capabilities = {
  contextWindow: 128_000,
  maxOutput: 8192,
  tools: true,
  parallelToolCalls: true,
  thinking: true,
  vision: false,
  files: false,
  serverTools: [],
  cacheStats: false,
};

function classify(error: unknown): ProviderError {
  const status = (error as { status?: number })?.status;
  const name = (error as { name?: string })?.name ?? "";
  const message = error instanceof Error ? error.message : String(error);
  let kind: ProviderErrorKind = "unknown";
  if (status === 400 && /context|maximum.*tokens|too long/i.test(message)) kind = "context_overflow";
  else if (status === 400 || status === 404 || status === 422) kind = "invalid_request";
  else if (status === 401 || status === 403) kind = "auth";
  else if (status === 402) kind = "insufficient_balance";
  else if (status === 429) kind = "rate_limit";
  else if (typeof status === "number" && status >= 500) kind = "overloaded";
  else if (/APIConnection/.test(name)) kind = "network";
  return new ProviderError(kind, message, { ...(status !== undefined ? { status } : {}), cause: error });
}

export interface LegacyProvider extends Provider {
  /** 最近一次失败的原始错误：路由用它生成给客户端的安全错误信息（含 HTTP 状态码） */
  lastError: unknown;
}

/** 把旧的回调式 streamChat 转成 core 的 ProviderEvent 流 */
export function legacyProvider(llm: LegacyLLM, providerName?: LLMProvider): LegacyProvider {
  const self: LegacyProvider = {
    id: `legacy:${providerName ?? "default"}`,
    lastError: undefined,
    capabilities: () => LEGACY_CAPABILITIES,
    async *stream(req: ModelRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent> {
      const queue: ProviderEvent[] = [];
      let wake: (() => void) | null = null;
      let done = false;
      let failure: unknown;
      const push = (e: ProviderEvent) => {
        if (done) return;
        queue.push(e);
        wake?.();
      };

      let next = 0;
      let textIndex = -1;
      let thinkingIndex = -1;
      let text = "";
      let thinking = "";
      const calls: ToolCall[] = [];
      const finish = () => {
        if (done) return;
        if (thinkingIndex >= 0) push({ type: "block_end", index: thinkingIndex, block: { type: "thinking", text: thinking } });
        if (textIndex >= 0) push({ type: "block_end", index: textIndex, block: { type: "text", text } });
        for (const c of calls) {
          const index = next++;
          const raw = typeof (c.arguments as { raw?: unknown }).raw === "string" ? String((c.arguments as { raw: string }).raw) : JSON.stringify(c.arguments ?? {});
          push({ type: "block_start", index, block: { type: "tool_use", id: c.id, name: c.name } });
          push({ type: "block_end", index, block: { type: "tool_use", id: c.id, name: c.name, arguments: raw, input: c.arguments } });
        }
        push({ type: "usage", usage: { inputTokens: 0, outputTokens: 0 } });
        push({ type: "finish", reason: calls.length ? "tool_use" : "end_turn" });
        done = true;
        wake?.();
      };

      const callbacks: StreamCallbacks = {
        onChunk: async (chunk) => {
          if (chunk.reasoning) {
            if (thinkingIndex < 0) {
              thinkingIndex = next++;
              push({ type: "block_start", index: thinkingIndex, block: { type: "thinking" } });
            }
            thinking += chunk.reasoning;
            push({ type: "block_delta", index: thinkingIndex, delta: { kind: "thinking", text: chunk.reasoning } });
          }
          if (chunk.content) {
            if (textIndex < 0) {
              textIndex = next++;
              push({ type: "block_start", index: textIndex, block: { type: "text" } });
            }
            text += chunk.content;
            push({ type: "block_delta", index: textIndex, delta: { kind: "text", text: chunk.content } });
          }
        },
        onToolCall: async (toolCall) => {
          if (!done && !calls.some((c) => c.id === toolCall.id)) calls.push(toolCall);
        },
        // 只认第一次 onComplete：之后同一次调用里的回调都忽略
        onComplete: async () => finish(),
        onError: async (error) => {
          if (done) return;
          failure = error;
          done = true;
          wake?.();
        },
      };

      const req2 = {
        messages: toLegacyMessages(req.messages, req.system),
        ...(req.model ? { model: req.model } : {}),
        ...(providerName ? { provider: providerName } : {}),
        ...(req.tools?.length
          ? { tools: req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.inputSchema } })) }
          : {}),
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.maxOutputTokens !== undefined ? { maxTokens: req.maxOutputTokens } : {}),
      };
      const running = llm.streamChat(req2, callbacks, signal ? { signal } : {}).then(
        () => {
          if (!done) finish(); // 没有调 onComplete（例如中止）
        },
        (e) => {
          if (!done) {
            failure = e;
            done = true;
            wake?.();
          }
        },
      );

      // 中止时立刻结束，不等上游返回（上游连接卡住时，暂停 / 停止也不会跟着卡住）
      const onAbort = () => {
        done = true;
        wake?.();
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      try {
        while (true) {
          if (queue.length && !signal?.aborted) {
            yield queue.shift()!;
            continue;
          }
          if (done) break;
          await new Promise<void>((r) => (wake = r));
          wake = null;
        }
      } finally {
        signal?.removeEventListener("abort", onAbort);
      }
      signal?.throwIfAborted();
      await running;
      if (failure !== undefined) {
        self.lastError = failure;
        throw classify(failure);
      }
    },
  };
  return self;
}

// ── MCP 工具 ─────────────────────────────────────────────────────────────

export interface LegacySessionManager {
  getToolsForLLM(): Array<{ type: "function"; function: { name: string; description?: string; parameters: Record<string, unknown> } }>;
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;
}

/** 需要人工审批的工具（与原来的行为一致：只有 bash） */
export const APPROVAL_TOOLS = new Set(["bash"]);

/** allow 给出时只提供这些名字的工具（GUI 里用户禁用的工具，例如默认关闭的 bash，不交给模型） */
export function mcpCoreTools(sessionManager: LegacySessionManager, truncate: (s: string) => string, allow?: ReadonlySet<string>): AnyTool[] {
  const all = sessionManager.getToolsForLLM();
  return (allow ? all.filter((t) => allow.has(t.function.name)) : all).map((t) =>
    defineTool({
      name: t.function.name,
      description: t.function.description ?? "",
      input: z.record(z.string(), z.unknown()),
      jsonSchemaOverride: t.function.parameters,
      ...(APPROVAL_TOOLS.has(t.function.name) ? { needsApproval: true } : {}),
      async execute(input) {
        const raw = await sessionManager.callTool(t.function.name, input as Record<string, unknown>);
        return { content: truncate(typeof raw === "string" ? raw : JSON.stringify(raw)) };
      },
    }),
  );
}

/** bash 审批：沿用原来的 pendingApprovals 和 60 秒超时；超时或拒绝都按 rejected 处理 */
export function pendingApprovalAnswerer(pending: Map<string, (approved: boolean) => void>, timeoutMs = 60_000): Answerer<unknown> {
  return (req) =>
    new Promise((resolve) => {
      const timer = setTimeout(() => {
        if (pending.delete(req.callId)) resolve("rejected");
      }, timeoutMs);
      pending.set(req.callId, (approved) => {
        clearTimeout(timer);
        pending.delete(req.callId);
        resolve(approved ? "allowed-once" : "rejected");
      });
    });
}
