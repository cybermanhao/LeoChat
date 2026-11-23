/**
 * SessionManager.connect 的幂等性（按 dsh 的连接监督器：每个服务器只有一个连接）。
 * 以前每次 connect 都先断开再重建：多个窗口 / 页面刷新 / 并行测试会互相踢掉连接，另一方读到空的工具列表。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const behavior = { delayMs: 0, failNext: false };
const instances: FakeMCPClient[] = [];

class FakeMCPClient {
  serverId: string;
  status: "disconnected" | "connecting" | "connected" = "disconnected";
  disconnects = 0;
  availableTools: Array<{ name: string }> = [{ name: "t" }];
  private fail: boolean;
  private delayMs: number;
  constructor(options: { config: { id: string } }) {
    this.serverId = options.config.id;
    this.fail = behavior.failNext;
    this.delayMs = behavior.delayMs;
    behavior.failNext = false;
    instances.push(this);
  }
  async connect() {
    this.status = "connecting";
    await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.fail) {
      this.status = "disconnected";
      throw new Error("handshake failed");
    }
    this.status = "connected";
  }
  async disconnect() {
    this.disconnects++;
    this.status = "disconnected";
  }
  getSession() {
    return { serverId: this.serverId, status: this.status, tools: this.availableTools };
  }
}

vi.mock("../client", () => ({ MCPClient: FakeMCPClient }));

const { SessionManager } = await import("../session-manager");

const config = (command = "node") => ({ id: "s1", name: "test", transport: "stdio" as const, command });

function makeManager() {
  const m = new SessionManager();
  m.addServer(config());
  return m;
}

beforeEach(() => {
  instances.length = 0;
  Object.assign(behavior, { delayMs: 0, failNext: false });
});

describe("MCPSessionManager.connect", () => {
  it("concurrent connects for the same server share one client", async () => {
    behavior.delayMs = 20;
    const m = makeManager();
    const sessions = await Promise.all([m.connect("s1"), m.connect("s1"), m.connect("s1")]);
    expect(instances).toHaveLength(1);
    expect(sessions.every((s: { status: string }) => s.status === "connected")).toBe(true);
  });

  it("connecting again while connected with the same config keeps the existing client", async () => {
    const m = makeManager();
    await m.connect("s1");
    const session = await m.connect("s1");
    expect(instances).toHaveLength(1);
    expect(instances[0]!.disconnects).toBe(0);
    expect(session.status).toBe("connected");
    expect(m.getSession("s1")?.tools).toHaveLength(1);
  });

  it("a changed config reconnects", async () => {
    const m = makeManager();
    await m.connect("s1");
    m.addServer(config("python"));
    await m.connect("s1");
    expect(instances).toHaveLength(2);
    expect(instances[0]!.disconnects).toBe(1);
  });

  it("force reconnects even when nothing changed", async () => {
    const m = makeManager();
    await m.connect("s1");
    await m.connect("s1", { force: true });
    expect(instances).toHaveLength(2);
    expect(instances[0]!.disconnects).toBe(1);
  });

  it("an older connect that fails does not remove a newer client", async () => {
    const m = makeManager();
    behavior.delayMs = 40;
    behavior.failNext = true;
    const slowFailing = m.connect("s1").catch((e: Error) => e);
    behavior.delayMs = 5;
    await m.connect("s1", { force: true });
    expect(await slowFailing).toBeInstanceOf(Error);
    expect(m.getSession("s1")?.status).toBe("connected");
  });

  it("disconnect then connect creates a fresh client (explicit refresh)", async () => {
    const m = makeManager();
    await m.connect("s1");
    await m.disconnect("s1");
    await m.connect("s1");
    expect(instances).toHaveLength(2);
  });
});
