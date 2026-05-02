/**
 * Lightweight file-system task store for the LeoChat MCP server.
 *
 * Provides basic persistence so that interrupted image-generation tasks can be
 * detected on restart and surfaced to the user as retryable cards.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

export type TaskStatus = "pending" | "completed" | "failed" | "interrupted";

export interface TaskRecord {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  status: TaskStatus;
  result?: unknown;
  error?: string;
  imageBase64?: string;
  mimeType?: string;
  thoughtSignature?: string;
  originalPrompt?: string;
  createdAt: number;
  updatedAt: number;
}

const STORE_DIR = join(tmpdir(), "leochat-mcp-tasks");
const TASK_TTL_MS = 60 * 60 * 1000; // 1 hour

function ensureDir() {
  if (!existsSync(STORE_DIR)) {
    mkdirSync(STORE_DIR, { recursive: true });
  }
}

function taskPath(id: string): string {
  return join(STORE_DIR, `${id}.json`);
}

export function readTask(id: string): TaskRecord | null {
  try {
    const data = readFileSync(taskPath(id), "utf-8");
    return JSON.parse(data) as TaskRecord;
  } catch {
    return null;
  }
}

function writeTask(task: TaskRecord): void {
  ensureDir();
  writeFileSync(taskPath(task.id), JSON.stringify(task, null, 2), "utf-8");
}

/**
 * Create a new pending task.
 */
export function createTask(
  id: string,
  toolName: string,
  args: Record<string, unknown>
): TaskRecord {
  const now = Date.now();
  const task: TaskRecord = {
    id,
    toolName,
    args,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };
  writeTask(task);
  return task;
}

/**
 * Update an existing task.
 */
export function updateTask(
  id: string,
  updates: Partial<Omit<TaskRecord, "id" | "createdAt">>
): TaskRecord | null {
  const task = readTask(id);
  if (!task) return null;
  Object.assign(task, updates, { updatedAt: Date.now() });
  writeTask(task);
  return task;
}

/**
 * Mark a task as completed.
 */
export function completeTask(id: string, result: unknown): TaskRecord | null {
  return updateTask(id, { status: "completed", result });
}

/**
 * Mark a task as failed.
 */
export function failTask(id: string, error: string): TaskRecord | null {
  return updateTask(id, { status: "failed", error });
}

/**
 * Mark a task as interrupted.
 */
export function interruptTask(id: string): TaskRecord | null {
  return updateTask(id, { status: "interrupted" });
}

/**
 * Delete a task record.
 */
export function deleteTask(id: string): void {
  try {
    unlinkSync(taskPath(id));
  } catch {
    // ignore
  }
}

/**
 * On server startup, scan for stale pending tasks and mark them interrupted.
 * Only tasks created *before* the given cutoff time are recovered, so that
 * tasks created during the current process lifetime are not touched.
 * Returns the list of recovered tasks so the server can log them.
 */
export function recoverInterruptedTasks(beforeTime?: number): TaskRecord[] {
  ensureDir();
  const recovered: TaskRecord[] = [];
  const now = Date.now();

  for (const file of readdirSync(STORE_DIR)) {
    if (!file.endsWith(".json")) continue;
    const id = file.slice(0, -5);
    const task = readTask(id);
    if (!task) continue;

    // Clean up very old tasks regardless of status
    if (now - task.createdAt > TASK_TTL_MS) {
      deleteTask(id);
      continue;
    }

    // Recover pending tasks that were left behind by a crash / restart
    if (task.status === "pending" && (beforeTime == null || task.createdAt < beforeTime)) {
      task.status = "interrupted";
      task.updatedAt = now;
      writeTask(task);
      recovered.push(task);
    }
  }

  return recovered;
}
