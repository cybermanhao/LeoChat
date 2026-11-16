/**
 * GUI 迁移第二步：会话与运行接口直接发 core 事件，会话写进 JSONL 日志。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { conversationLog } from "@leochat/node";
import { initialViewState, reduce } from "@leochat/core/view";
import type { AgentEvent } from "@leochat/core";
import { TaskStore } from "../task-store.js";
import { createRoutes } from "../routes/index.js";
import type { ServerContext } from "../server.js";
import type { StreamCallbacks } from "../services/llm.js";

async function events(res: Response): Promise<AgentEvent[]> {
  const out: AgentEvent[] = [];
  for (const line of (await res.text()).split("\n")) if (line.startsWith("data: ")) out.push(JSON.parse(line.slice(6)) as AgentEvent);
  return out;
}

let dir: string;
let pending: Map<string, (ok: boolean) => void>;
let callTool: ReturnType<typeof vi.fn>;

function appWith(rounds: Array<(cbs: StreamCallbacks) => Promise<void>>) {
  let i = 0;
  const llm = {
    streamChat: vi.fn(async (_req: unknown, cbs: StreamCallbacks) => {
      const r = rounds[i++];
      if (!r) throw new Error("no more scripted rounds");
      await r(cbs);
    }),
    chat: vi.fn(),
  };
  callTool = vi.fn(async () => "ran");
  const context = {
    sessionManager: {
      getToolsForLLM: () => [{ type: "function", function: { name: "bash", description: "", parameters: { type: "object" } } }],
      callTool,
    },
    startTime: Date.now(),
    pendingApprovals: pending,
    taskStore: new TaskStore(join(dir, "tasks")),
    conversations: conversationLog(join(dir, "conversations")),
  } as unknown as ServerContext;
  const app = new Hono();
  app.route("/api", createRoutes(context, llm as never));
  return app;
}
const json = (app: Hono, method: string, path: string, body?: unknown) =>
  app.request(`/api${path}`, { method, headers: { "Content-Type": "application/json" }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const text = (s: string) => async (cbs: StreamCallbacks) => {
  await cbs.onChunk({ content: s, index: 0 });
  await cbs.onComplete({ id: "a", role: "assistant", content: s, timestamp: 1 });
};

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leochat-conv-test-"));
  pending = new Map();
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("conversations API", () => {
  it("runs a turn, streams core events, persists the conversation and titles it", async () => {
    const app = appWith([text("Hello there."), text("Second answer.")]);
    const conv = (await (await json(app, "POST", "/conversations", {})).json()) as { id: string };
    const evs = await events(await json(app, "POST", `/conversations/${conv.id}/runs`, { text: "Hi, who are you?" }));
    expect(evs[0]!.type).toBe("run_start");
    expect(evs.at(-1)!.type).toBe("run_end");
    // 前端可以直接用 core 的 reducer 渲染
    let view = initialViewState();
    for (const e of evs) view = reduce(view, e);
    expect(view.status).toBe("done");

    const loaded = (await (await json(app, "GET", `/conversations/${conv.id}`)).json()) as { meta: { title: string }; transcript: Array<{ role: string }> };
    expect(loaded.transcript.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(loaded.meta.title).toBe("Hi, who are you?");

    // 第二轮在已保存的历史上继续
    await events(await json(app, "POST", `/conversations/${conv.id}/runs`, { text: "And again?" }));
    const again = (await (await json(app, "GET", `/conversations/${conv.id}`)).json()) as { transcript: unknown[] };
    expect(again.transcript).toHaveLength(4);
    const list = (await (await json(app, "GET", "/conversations")).json()) as { conversations: Array<{ id: string }> };
    expect(list.conversations.map((c) => c.id)).toEqual([conv.id]);
  });

  it("accepts a follow-up while the run is in flight", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const app = appWith([
      async (cbs) => {
        await cbs.onChunk({ content: "first", index: 0 });
        await gate;
        await cbs.onComplete({ id: "a", role: "assistant", content: "first", timestamp: 1 });
      },
      text("follow-up answer"),
    ]);
    const conv = (await (await json(app, "POST", "/conversations", {})).json()) as { id: string };
    const res = await json(app, "POST", `/conversations/${conv.id}/runs`, { text: "start" });
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let runId = "";
    while (!runId) {
      const { value } = await reader.read();
      buf += dec.decode(value);
      const m = buf.match(/"runId":"(run_[^"]+)"/);
      if (m) runId = m[1]!;
    }
    const fu = await json(app, "POST", `/runs/${runId}/follow-up`, { text: "and then?" });
    expect(fu.status).toBe(200);
    release();
    while (!(await reader.read()).done) {
      /* drain */
    }
    const loaded = (await (await json(app, "GET", `/conversations/${conv.id}`)).json()) as { transcript: Array<{ role: string }> };
    expect(loaded.transcript.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    expect((await json(app, "POST", `/runs/${runId}/steer`, { text: "late" })).status).toBe(404); // 运行结束后不再接受
  });

  it("asks for bash approval through the existing approve endpoint", async () => {
    const app = appWith([
      async (cbs) => {
        await cbs.onToolCall({ id: "b1", name: "bash", arguments: { command: "ls" }, status: "pending" });
        await cbs.onComplete({ id: "a", role: "assistant", content: "", timestamp: 1 });
      },
      text("listed"),
    ]);
    const conv = (await (await json(app, "POST", "/conversations", {})).json()) as { id: string };
    const resP = json(app, "POST", `/conversations/${conv.id}/runs`, { text: "list files" });
    await vi.waitFor(() => expect(pending.has("b1")).toBe(true));
    expect((await json(app, "POST", "/tools/approve/b1", { approved: true })).status).toBe(200);
    const evs = await events(await resP);
    expect(evs.find((e) => e.type === "approval_request")).toMatchObject({ callId: "b1", toolName: "bash" });
    expect(evs.find((e) => e.type === "tool_end")).toMatchObject({ callId: "b1", ok: true });
    expect(callTool).toHaveBeenCalledWith("bash", { command: "ls" });
  });

  it("sanitizes upstream errors and validates input", async () => {
    const app = appWith([async (cbs) => cbs.onError(Object.assign(new Error("secret internal-host:8080 failed"), { status: 401 }))]);
    const conv = (await (await json(app, "POST", "/conversations", {})).json()) as { id: string };
    const evs = await events(await json(app, "POST", `/conversations/${conv.id}/runs`, { text: "x" }));
    expect(JSON.stringify(evs)).not.toContain("internal-host");
    expect(evs.find((e) => e.type === "error")).toMatchObject({ error: { message: "LLM request failed (401)" } });

    expect((await json(app, "POST", `/conversations/${conv.id}/runs`, {})).status).toBe(400);
    expect((await json(app, "GET", "/conversations/..%2Fetc")).status).toBe(400);
    expect((await json(app, "POST", "/conversations/conv_missing/runs", { text: "x" })).status).toBe(404);
    expect((await json(app, "POST", "/runs/run_missing/abort")).status).toBe(404);
    expect((await json(app, "DELETE", `/conversations/${conv.id}`)).status).toBe(200);
    expect((await json(app, "GET", `/conversations/${conv.id}`)).status).toBe(404);
  });
});
