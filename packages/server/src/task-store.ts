import { readFile, writeFile, unlink, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { ChatMessage } from "@ai-chatbox/shared";

export type TaskStatus = "running" | "completed" | "failed" | "interrupted";

export interface TaskRecord {
  taskId: string;
  chatId: string;
  status: TaskStatus;
  toolRound: number;
  internalMessages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export class TaskStore {
  private readonly dirReady: Promise<void>;
  // Cache createdAt per taskId to avoid a file read on every save().
  // Safe because tasks live within a single server process lifetime.
  private readonly createdAtCache = new Map<string, number>();

  constructor(private readonly dir: string) {
    this.dirReady = mkdir(dir, { recursive: true }).then(() => undefined);
  }

  private filePath(taskId: string): string {
    return join(this.dir, `${taskId}.json`);
  }

  async save(task: Omit<TaskRecord, "createdAt" | "updatedAt">): Promise<TaskRecord> {
    const now = Date.now();
    const createdAt = this.createdAtCache.get(task.taskId) ?? now;
    this.createdAtCache.set(task.taskId, createdAt);
    await this.dirReady;
    const record: TaskRecord = { ...task, createdAt, updatedAt: now };
    await writeFile(this.filePath(task.taskId), JSON.stringify(record, null, 2), "utf-8");
    return record;
  }

  async load(taskId: string): Promise<TaskRecord | null> {
    try {
      const raw = await readFile(this.filePath(taskId), "utf-8");
      const record = JSON.parse(raw) as TaskRecord;
      // Warm the cache so save() preserves the original createdAt after a server restart.
      if (!this.createdAtCache.has(taskId)) {
        this.createdAtCache.set(taskId, record.createdAt);
      }
      return record;
    } catch {
      return null;
    }
  }

  async delete(taskId: string): Promise<void> {
    try {
      await unlink(this.filePath(taskId));
    } catch {
      // Ignore — file may not exist
    }
  }

  async updateStatus(taskId: string, status: TaskStatus): Promise<void> {
    const record = await this.load(taskId);
    if (!record) throw new Error(`Task not found: ${taskId}`);
    const updated: TaskRecord = { ...record, status, updatedAt: Date.now() };
    await writeFile(this.filePath(taskId), JSON.stringify(updated, null, 2), "utf-8");
  }

  async listPending(chatId?: string): Promise<TaskRecord[]> {
    let files: string[];
    try {
      files = await readdir(this.dir);
    } catch {
      return [];
    }

    const records: TaskRecord[] = [];
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(this.dir, file), "utf-8");
        const record = JSON.parse(raw) as TaskRecord;
        if (record.status !== "running" && record.status !== "interrupted") continue;
        if (chatId && record.chatId !== chatId) continue;
        records.push(record);
      } catch {
        // Skip corrupted files
      }
    }
    return records;
  }
}
