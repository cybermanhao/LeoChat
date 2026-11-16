/**
 * MCP 连接监督器（参考 dsh mcp-client）：同步串行、断线保留工具、退避重连、失败上限、稳定后重置计数。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const behavior = {
  connectFailures: 0,
  listDelayMs: 0,
  concurrentLists: 0,
  maxConcurrentLists: 0,
  listCalls: 0,
  tools: [{ name: "a", description: "", inputSchema: { type: "object" } }] as Array<Record<string, unknown>>,
};
const instances: FakeClient[] = [];

class FakeClient {
  onclose?: () => void;
  handlers = new Map<string, () => void>();
  constructor() {
    instances.push(this);
  }
  async connect() {
    if (behavior.connectFailures > 0) {
      behavior.connectFailures--;
      throw new Error("connection refused");
    }
  }
  setNotificationHandler(method: string, handler: () => void) {
    this.handlers.set(method, handler);
  }
  getServerCapabilities() {
    return { tools: {} };
  }
  async listTools() {
    behavior.listCalls++;
    behavior.concurrentLists++;
    behavior.maxConcurrentLists = Math.max(behavior.maxConcurrentLists, behavior.concurrentLists);
    // 延迟为 0 时不用 setTimeout，否则在假计时器下永远不会触发
    if (behavior.listDelayMs > 0) await new Promise((r) => setTimeout(r, behavior.listDelayMs));
    else await Promise.resolve();
    behavior.concurrentLists--;
    return { tools: behavior.tools };
  }
  async close() {}
}

vi.mock("@modelcontextprotocol/client", () => ({ Client: FakeClient }));
vi.mock("../transports", () => ({ createTransportAsync: async () => ({ transport: {} }) }));

const { MCPClient } = await import("../client");

function make() {
  const statuses: string[] = [];
  const toolUpdates: number[] = [];
  const attempts: number[] = [];
  const client = new MCPClient({
    config: { id: "s1", name: "test", transport: "stdio", command: "x" },
    autoReconnect: true,
    onStatusChange: (s) => statuses.push(s),
    onToolsUpdate: (t) => toolUpdates.push(t.length),
    onReconnectAttempt: (a) => attempts.push(a),
    onError: () => {},
  });
  return { client, statuses, toolUpdates, attempts };
}

const last = () => instances.at(-1)!;

beforeEach(() => {
  Object.assign(behavior, { connectFailures: 0, listDelayMs: 0, concurrentLists: 0, maxConcurrentLists: 0, listCalls: 0 });
  behavior.tools = [{ name: "a", description: "", inputSchema: { type: "object" } }];
  instances.length = 0;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("MCPClient connection supervisor", () => {
  it("serializes list_changed refreshes so listTools never runs concurrently (the old hang)", async () => {
    const { client } = make();
    await client.connect();
    behavior.listDelayMs = 20;
    behavior.tools = [
      { name: "a", inputSchema: { type: "object" } },
      { name: "b", inputSchema: { type: "object" } },
    ];
    const notify = last().handlers.get("notifications/tools/list_changed")!;
    expect(notify).toBeTypeOf("function");
    notify();
    notify();
    notify();
    await vi.waitFor(() => expect(behavior.listCalls).toBe(4), { timeout: 2000 });
    expect(behavior.maxConcurrentLists).toBe(1);
    expect(client.availableTools.map((t) => t.name)).toEqual(["a", "b"]);
  });

  it("keeps tools listed during an outage and reconnects with 500ms, 1s backoff", async () => {
    vi.useFakeTimers();
    const { client, statuses, attempts } = make();
    await client.connect();
    behavior.connectFailures = 2;
    last().onclose!();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.currentStatus).toBe("reconnecting");
    expect(client.availableTools).toHaveLength(1); // 断线期间仍然列出
    await vi.advanceTimersByTimeAsync(499);
    expect(attempts).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1);
    expect(attempts).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(attempts).toEqual([1, 2, 3]);
    expect(client.currentStatus).toBe("connected");
    expect(statuses).toContain("reconnecting");
  });

  it("gives up after 10 consecutive failures and removes the tools", async () => {
    vi.useFakeTimers();
    const { client, toolUpdates, attempts } = make();
    await client.connect();
    behavior.connectFailures = 1000;
    last().onclose!();
    await vi.advanceTimersByTimeAsync(10 * 30_000);
    expect(attempts).toHaveLength(10);
    expect(client.currentStatus).toBe("error");
    expect(client.availableTools).toHaveLength(0);
    expect(toolUpdates.at(-1)).toBe(0);
  });

  it("resets the failure count only after the connection stayed up for maxDelayMs", async () => {
    vi.useFakeTimers();
    const { client, attempts } = make();
    await client.connect();

    // 第一次断线：失败 9 次后第 10 次成功
    behavior.connectFailures = 9;
    last().onclose!();
    // 9 次退避的总时长：0.5 + 1 + 2 + 4 + 8 + 16 + 30 + 30 + 30 = 121.5 秒；正好在第 10 次连上，运行时长为 0
    await vi.advanceTimersByTimeAsync(121_500);
    expect(client.currentStatus).toBe("connected");
    expect(attempts).toHaveLength(10);

    // 刚连上就又断：计数接着算，再失败 1 次就放弃（避免反复闪断时无限重连）
    attempts.length = 0;
    behavior.connectFailures = 1000;
    last().onclose!();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(attempts).toHaveLength(1);
    expect(client.currentStatus).toBe("error");

    // 手动重连后稳定运行 30 秒再断：计数重新开始
    behavior.connectFailures = 0;
    await client.connect();
    await vi.advanceTimersByTimeAsync(30_000);
    attempts.length = 0;
    behavior.connectFailures = 1;
    last().onclose!();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(attempts).toEqual([1, 2]);
    expect(client.currentStatus).toBe("connected");
  });
});
