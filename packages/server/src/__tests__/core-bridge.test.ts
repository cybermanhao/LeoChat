/**
 * GUI 迁移第一步：/api/chat 跑在 @leochat/core 上，SSE 载荷保持前端原来认识的形状。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { TaskStore } from "../task-store.js";
import { createRoutes } from "../routes/index.js";
import type { ServerContext } from "../server.js";
import type { StreamCallbacks } from "../services/llm.js";
import type { ChatMessage } from "@ai-chatbox/shared";
import { toCoreMessages, toLegacyMessages } from "../core-bridge.js";

type Ev = { event: string; data: any };
async function collectSSE(res: Response): Promise<Ev[]> {
  const out: Ev[] = [];
  let ev = "";
  for (const line of (await res.text()).split("\n")) {
    if (line.startsWith("event: ")) ev = line.slice(7).trim();
    else if (line.startsWith("data: ")) {
      try {
        out.push({ event: ev, data: JSON.parse(line.slice(6)) });
      } catch {
        out.push({ event: ev, data: line.slice(6) });
      }
    }
  }
  return out;
}

const user = (content: string): ChatMessage => ({ id: "u1", role: "user", content, timestamp: 1 });
const tools = [
  { type: "function" as const, function: { name: "get_weather", description: "w", parameters: { type: "object", properties: { city: { type: "string" } } } } },
  { type: "function" as const, function: { name: "bash", description: "run", parameters: { type: "object", properties: { command: { type: "string" } } } } },
];

let taskStore: TaskStore;
let tmpDir: string;
let pending: Map<string, (approved: boolean) => void>;
let requests: Array<{ messages: ChatMessage[]; tools?: unknown[] }>;
let callTool: ReturnType<typeof vi.fn>;

function appWith(rounds: Array<(cbs: StreamCallbacks) => Promise<void>>) {
  let i = 0;
  const llm = {
    streamChat: vi.fn(async (req: { messages: ChatMessage[]; tools?: unknown[] }, cbs: StreamCallbacks) => {
      requests.push(structuredClone(req));
      const round = rounds[i++];
      if (!round) throw new Error("no more scripted rounds");
      await round(cbs);
    }),
    chat: vi.fn(),
  };
  callTool = vi.fn(async (name: string, args: Record<string, unknown>) => (name === "get_weather" ? { city: args.city, tempC: 18 } : "ran"));
  const context = {
    sessionManager: { getToolsForLLM: () => tools, callTool },
    startTime: Date.now(),
    pendingApprovals: pending,
    taskStore,
  } as unknown as ServerContext;
  const app = new Hono();
  app.route("/api", createRoutes(context, llm as never));
  return app;
}

const post = (app: Hono, body: unknown) =>
  app.request("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "leochat-bridge-test-"));
  taskStore = new TaskStore(tmpDir);
  pending = new Map();
  requests = [];
});
afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe("/api/chat on @leochat/core", () => {
  it("streams text, a tool round, and ends with complete + final in the legacy payload shapes", async () => {
    const app = appWith([
      async (cbs) => {
        await cbs.onChunk({ content: "", reasoning: "thinking...", index: 0 });
        await cbs.onChunk({ content: "Checking. ", index: 1 });
        await cbs.onToolCall({ id: "tc1", name: "get_weather", arguments: { city: "Hangzhou" }, status: "pending" });
        await cbs.onComplete({ id: "a1", role: "assistant", content: "Checking. ", timestamp: 1 });
      },
      async (cbs) => {
        await cbs.onChunk({ content: "18C.", index: 0 });
        await cbs.onComplete({ id: "a2", role: "assistant", content: "18C.", timestamp: 2 });
      },
    ]);
    const events = await collectSSE(await post(app, { messages: [user("weather?")], chatId: "c1" }));
    const names = events.map((e) => e.event);
    expect(names[0]).toBe("task_started");
    expect(names).toEqual(["task_started", "chunk", "chunk", "tool_call", "tool_result", "chunk", "complete", "final"]);

    expect(events[1]!.data).toMatchObject({ content: "", reasoning: "thinking..." });
    expect(events[2]!.data).toMatchObject({ content: "Checking. " });
    expect(typeof events[2]!.data.index).toBe("number");
    expect(events[3]!.data).toEqual({ id: "tc1", name: "get_weather", arguments: { city: "Hangzhou" }, status: "pending" });
    expect(events[4]!.data).toEqual({ id: "tc1", result: JSON.stringify({ city: "Hangzhou", tempC: 18 }) });
    expect(events[6]!.data).toMatchObject({ role: "assistant", content: "18C." });
    const final = events[7]!.data;
    expect(final.toolRounds).toBe(1);
    expect(final.internalMessages.map((m: ChatMessage) => m.role)).toEqual(["user", "assistant", "tool"]);
    expect(final.internalMessages[1]).toMatchObject({ content: "Checking. ", reasoning_content: "thinking...", tool_calls: [{ id: "tc1", name: "get_weather" }] });

    // 第二轮请求带上了第一轮的文字、推理和工具结果
    const second = requests[1]!.messages;
    expect(second.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
    expect(second[1]).toMatchObject({ content: "Checking. ", reasoning_content: "thinking..." });
    expect(second[2]).toMatchObject({ tool_call_id: "tc1" });
    expect(callTool).toHaveBeenCalledWith("get_weather", { city: "Hangzhou" });
  });

  it("asks for bash approval with the legacy payload and executes after approval", async () => {
    const app = appWith([
      async (cbs) => {
        await cbs.onToolCall({ id: "b1", name: "bash", arguments: { command: "ls" }, status: "pending" });
        await cbs.onComplete({ id: "a1", role: "assistant", content: "", timestamp: 1 });
      },
      async (cbs) => cbs.onComplete({ id: "a2", role: "assistant", content: "done", timestamp: 2 }),
    ]);
    const resPromise = post(app, { messages: [user("list files")] });
    await vi.waitFor(() => expect(pending.has("b1")).toBe(true));
    pending.get("b1")!(true);
    const events = await collectSSE(await resPromise);
    const approval = events.find((e) => e.event === "tool_approval_required");
    expect(approval!.data).toEqual({ requiresApproval: true, id: "b1", toolName: "bash", command: "ls" });
    const order = events.map((e) => e.event);
    expect(order.indexOf("tool_call")).toBeLessThan(order.indexOf("tool_approval_required"));
    expect(events.find((e) => e.event === "tool_result")!.data).toEqual({ id: "b1", result: "ran" });
  });

  it("a denied bash call reports the legacy rejection text and is not executed", async () => {
    const app = appWith([
      async (cbs) => {
        await cbs.onToolCall({ id: "b1", name: "bash", arguments: { command: "rm -rf /" }, status: "pending" });
        await cbs.onComplete({ id: "a1", role: "assistant", content: "", timestamp: 1 });
      },
      async (cbs) => cbs.onComplete({ id: "a2", role: "assistant", content: "ok", timestamp: 2 }),
    ]);
    const resPromise = post(app, { messages: [user("x")] });
    await vi.waitFor(() => expect(pending.has("b1")).toBe(true));
    pending.get("b1")!(false);
    const events = await collectSSE(await resPromise);
    expect(events.find((e) => e.event === "tool_error")!.data).toEqual({ id: "b1", error: "用户拒绝执行此命令" });
    expect(callTool).not.toHaveBeenCalled();
  });

  it("tool failures send the generic error, never the internal message", async () => {
    const app = appWith([
      async (cbs) => {
        await cbs.onToolCall({ id: "t1", name: "get_weather", arguments: { city: "A" }, status: "pending" });
        await cbs.onComplete({ id: "a1", role: "assistant", content: "", timestamp: 1 });
      },
      async (cbs) => cbs.onComplete({ id: "a2", role: "assistant", content: "sorry", timestamp: 2 }),
    ]);
    callTool.mockRejectedValueOnce(new Error("ECONNREFUSED 10.0.0.5"));
    const events = await collectSSE(await post(app, { messages: [user("x")] }));
    const err = events.find((e) => e.event === "tool_error")!;
    expect(err.data).toEqual({ id: "t1", error: "Tool execution failed" });
    expect(JSON.stringify(events)).not.toContain("10.0.0.5");
  });

  it("LLM errors are sanitized and the task is marked interrupted", async () => {
    const app = appWith([
      async (cbs) => cbs.onError(Object.assign(new Error("Authentication Fails, internal-host:8080"), { status: 401 })),
    ]);
    const events = await collectSSE(await post(app, { messages: [user("x")], chatId: "c9" }));
    const err = events.find((e) => e.event === "error")!;
    expect(err.data).toEqual({ error: "LLM request failed (401)" });
    const taskId = events[0]!.data.taskId;
    expect((await taskStore.load(taskId))!.status).toBe("interrupted");
  });
});

describe("message conversion", () => {
  it("round-trips legacy messages through core messages", () => {
    const legacy: ChatMessage[] = [
      { id: "s", role: "system", content: "sys", timestamp: 1 },
      { id: "u", role: "user", content: "hi", timestamp: 1 },
      {
        id: "a",
        role: "assistant",
        content: "checking",
        reasoning_content: "r",
        tool_calls: [
          { id: "t1", name: "x", arguments: { a: 1 }, status: "completed" },
          { id: "t2", name: "y", arguments: {}, status: "completed" },
        ],
        timestamp: 1,
      },
      { id: "r1", role: "tool", content: "one", tool_call_id: "t1", timestamp: 1 },
      { id: "r2", role: "tool", content: "two", tool_call_id: "t2", timestamp: 1 },
    ];
    const core = toCoreMessages(legacy);
    expect(core.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]); // 连续的 tool 消息合并
    const back = toLegacyMessages(core);
    expect(back.map((m) => [m.role, m.content, m.tool_call_id ?? null])).toEqual([
      ["system", "sys", null],
      ["user", "hi", null],
      ["assistant", "checking", null],
      ["tool", "one", "t1"],
      ["tool", "two", "t2"],
    ]);
    expect(back[2]).toMatchObject({ reasoning_content: "r", tool_calls: [{ id: "t1", arguments: { a: 1 } }, { id: "t2" }] });
  });
});
