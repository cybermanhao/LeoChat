/**
 * TDD: TaskStore — 后端任务检查点文件存储
 *
 * 测试覆盖：
 * - 基础 CRUD：save / load / delete
 * - 消息追加：updateMessages（每轮工具完成后调用）
 * - 状态变更：updateStatus
 * - 查询：listPending（列出未完成任务）
 * - 边界：任务不存在、文件损坏、并发写入
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TaskStore } from "../task-store.js";
import type { TaskRecord } from "../task-store.js";
import type { ChatMessage } from "@ai-chatbox/shared";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMsg(role: ChatMessage["role"], content: string): ChatMessage {
  return { id: `msg-${Math.random().toString(36).slice(2)}`, role, content, timestamp: Date.now() };
}

function makeTask(overrides: Partial<TaskRecord> = {}): Omit<TaskRecord, "createdAt" | "updatedAt"> {
  return {
    taskId: "task-001",
    chatId: "chat-abc",
    status: "running",
    toolRound: 0,
    internalMessages: [makeMsg("user", "hello")],
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

let tmpDir: string;
let store: TaskStore;

beforeEach(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), "leochat-task-store-"));
  store = new TaskStore(tmpDir);
});

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

// ── 基础 CRUD ──────────────────────────────────────────────────────────────

describe("save & load", () => {
  it("saves a task and loads it back", async () => {
    const task = makeTask();
    await store.save(task);

    const loaded = await store.load(task.taskId);
    expect(loaded).not.toBeNull();
    expect(loaded!.taskId).toBe("task-001");
    expect(loaded!.chatId).toBe("chat-abc");
    expect(loaded!.status).toBe("running");
    expect(loaded!.internalMessages).toHaveLength(1);
  });

  it("persists timestamps on save", async () => {
    const before = Date.now();
    await store.save(makeTask());
    const after = Date.now();

    const loaded = await store.load("task-001");
    expect(loaded!.createdAt).toBeGreaterThanOrEqual(before);
    expect(loaded!.createdAt).toBeLessThanOrEqual(after);
    expect(loaded!.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("overwrites existing task on re-save", async () => {
    await store.save(makeTask({ toolRound: 0 }));
    await store.save(makeTask({ toolRound: 3 }));

    const loaded = await store.load("task-001");
    expect(loaded!.toolRound).toBe(3);
  });

  it("returns null for non-existent task", async () => {
    const result = await store.load("does-not-exist");
    expect(result).toBeNull();
  });
});

describe("delete", () => {
  it("deletes an existing task", async () => {
    await store.save(makeTask());
    await store.delete("task-001");

    const loaded = await store.load("task-001");
    expect(loaded).toBeNull();
  });

  it("does not throw when deleting non-existent task", async () => {
    await expect(store.delete("ghost-task")).resolves.not.toThrow();
  });
});

// ── 消息追加 ──────────────────────────────────────────────────────────────────

describe("updateMessages", () => {
  it("appends messages and increments toolRound", async () => {
    await store.save(makeTask());

    const newMsgs: ChatMessage[] = [
      makeMsg("assistant", "calling tool"),
      makeMsg("tool", "result"),
    ];
    await store.updateMessages("task-001", newMsgs, 1);

    const loaded = await store.load("task-001");
    expect(loaded!.internalMessages).toHaveLength(3); // 1 original + 2 new
    expect(loaded!.toolRound).toBe(1);
    expect(loaded!.updatedAt).toBeGreaterThan(loaded!.createdAt);
  });

  it("updates updatedAt on each call", async () => {
    await store.save(makeTask());
    const first = await store.load("task-001");

    await new Promise((r) => setTimeout(r, 5));
    await store.updateMessages("task-001", [makeMsg("assistant", "round 2")], 1);

    const second = await store.load("task-001");
    expect(second!.updatedAt).toBeGreaterThan(first!.updatedAt);
  });

  it("throws when task does not exist", async () => {
    await expect(
      store.updateMessages("missing", [makeMsg("assistant", "hi")], 1)
    ).rejects.toThrow("Task not found: missing");
  });
});

// ── 状态变更 ──────────────────────────────────────────────────────────────────

describe("updateStatus", () => {
  it("transitions status correctly", async () => {
    await store.save(makeTask({ status: "running" }));
    await store.updateStatus("task-001", "completed");

    const loaded = await store.load("task-001");
    expect(loaded!.status).toBe("completed");
  });

  it("throws when task does not exist", async () => {
    await expect(
      store.updateStatus("missing", "failed")
    ).rejects.toThrow("Task not found: missing");
  });
});

// ── 查询 ─────────────────────────────────────────────────────────────────────

describe("listPending", () => {
  it("returns only running and interrupted tasks", async () => {
    await store.save(makeTask({ taskId: "t1", status: "running" }));
    await store.save(makeTask({ taskId: "t2", status: "interrupted" }));
    await store.save(makeTask({ taskId: "t3", status: "completed" }));
    await store.save(makeTask({ taskId: "t4", status: "failed" }));

    const pending = await store.listPending();
    expect(pending.map((t) => t.taskId).sort()).toEqual(["t1", "t2"]);
  });

  it("filters by chatId when provided", async () => {
    await store.save(makeTask({ taskId: "t1", chatId: "chat-A", status: "running" }));
    await store.save(makeTask({ taskId: "t2", chatId: "chat-B", status: "running" }));

    const pending = await store.listPending("chat-A");
    expect(pending).toHaveLength(1);
    expect(pending[0].taskId).toBe("t1");
  });

  it("returns empty array when no pending tasks", async () => {
    await store.save(makeTask({ taskId: "t1", status: "completed" }));
    expect(await store.listPending()).toEqual([]);
  });

  it("returns empty array when store directory is empty", async () => {
    expect(await store.listPending()).toEqual([]);
  });
});

// ── 边界 ─────────────────────────────────────────────────────────────────────

describe("edge cases", () => {
  it("handles corrupted JSON file gracefully — skips it in listPending", async () => {
    // 先写一个正常的任务
    await store.save(makeTask({ taskId: "good", status: "running" }));
    // 手动写入损坏文件
    const { writeFile } = await import("node:fs/promises");
    await writeFile(join(tmpDir, "bad.json"), "{ this is not json }", "utf-8");

    const pending = await store.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].taskId).toBe("good");
  });

  it("handles concurrent saves to different tasks without corruption", async () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      store.save(makeTask({ taskId: `task-${i}`, chatId: `chat-${i}` }))
    );
    await Promise.all(tasks);

    const pending = await store.listPending();
    expect(pending).toHaveLength(10);
  });

  it("preserves full message content including tool_calls and tool_call_id", async () => {
    const msgs: ChatMessage[] = [
      makeMsg("user", "run something"),
      {
        ...makeMsg("assistant", ""),
        tool_calls: [{ id: "tc-1", name: "bash", arguments: { command: "ls" }, status: "completed" }],
      },
      {
        ...makeMsg("tool", "file1.txt\nfile2.txt"),
        tool_call_id: "tc-1",
      },
    ];
    await store.save(makeTask({ taskId: "rich", internalMessages: msgs }));

    const loaded = await store.load("rich");
    expect(loaded!.internalMessages[1].tool_calls![0].name).toBe("bash");
    expect(loaded!.internalMessages[2].tool_call_id).toBe("tc-1");
  });
});
