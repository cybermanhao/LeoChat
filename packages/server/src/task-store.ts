import { readFile, writeFile, unlink, readdir } from "node:fs/promises";
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
  constructor(private readonly dir: string) {}

  private filePath(taskId: string): string {
    return join(this.dir, `${taskId}.json`);
  }

  async save(task: Omit<TaskRecord, "createdAt" | "updatedAt">): Promise<TaskRecord> {
    const now = Date.now();
    // Preserve createdAt if record already exists
    const existing = await this.load(task.taskId);
    const record: TaskRecord = {
      ...task,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await writeFile(this.filePath(task.taskId), JSON.stringify(record, null, 2), "utf-8");
    return record;
  }

  async load(taskId: string): Promise<TaskRecord | null> {
    try {
      const raw = await readFile(this.filePath(taskId), "utf-8");
      return JSON.parse(raw) as TaskRecord;
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

  async updateMessages(taskId: string, newMessages: ChatMessage[], toolRound: number): Promise<void> {
    const record = await this.load(taskId);
    if (!record) throw new Error(`Task not found: ${taskId}`);
    const updated: TaskRecord = {
      ...record,
      internalMessages: [...record.internalMessages, ...newMessages],
      toolRound,
      updatedAt: Date.now(),
    };
    await writeFile(this.filePath(taskId), JSON.stringify(updated, null, 2), "utf-8");
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
