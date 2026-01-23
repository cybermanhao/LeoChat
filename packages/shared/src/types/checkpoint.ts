/**
 * Checkpoint and Resume Types
 *
 * For state persistence and recovery of TaskLoop execution
 */

import type { ChatMessage, TaskLoopStatus, LLMConfig } from "./index";

/**
 * Serializable checkpoint of TaskLoop state
 */
export interface TaskLoopCheckpoint {
  /** Unique checkpoint ID */
  id: string;

  /** Version for migration compatibility */
  version: 1;

  /** Chat/conversation ID */
  chatId: string;

  /** Timestamp when checkpoint was created */
  timestamp: number;

  /** Current epoch number (0-indexed) */
  epoch: number;

  /** Complete message history at checkpoint time */
  messages: ChatMessage[];

  /** TaskLoop status at checkpoint */
  status: TaskLoopStatus;

  /** Pending tool calls (for mid-execution recovery) */
  pendingToolCalls?: PendingToolCall[];

  /** LLM config snapshot (excluding apiKey for security) */
  llmConfigSnapshot: LLMConfigSnapshot;

  /** Tool names available at checkpoint time */
  availableToolNames: string[];

  /** Reason for checkpoint */
  reason?: CheckpointReason;
}

/**
 * Pending tool call info for recovery
 */
export interface PendingToolCall {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
}

/**
 * LLM config without sensitive data
 */
export type LLMConfigSnapshot = Omit<LLMConfig, "apiKey">;

/**
 * Checkpoint creation reason
 */
export type CheckpointReason =
  | "epoch_complete"    // After each epoch completes
  | "user_pause"        // User manually paused
  | "error"             // Error occurred
  | "browser_close"     // beforeunload triggered
  | "auto";             // Automatic periodic checkpoint

/**
 * Event log entry for append-only storage
 */
export interface EventLogEntry {
  /** Unique entry ID */
  id: string;

  /** Chat ID this event belongs to */
  chatId: string;

  /** Timestamp */
  timestamp: number;

  /** Sequence number within chat (for ordering) */
  sequence: number;

  /** Event type discriminator */
  eventType: string;

  /** Serialized event payload (JSON string) */
  payload: string;
}

/**
 * Checkpoint storage interface (provider-agnostic)
 */
export interface CheckpointStorage {
  /** Save a checkpoint */
  saveCheckpoint(checkpoint: TaskLoopCheckpoint): Promise<void>;

  /** Load the latest checkpoint for a chat */
  getLatestCheckpoint(chatId: string): Promise<TaskLoopCheckpoint | null>;

  /** Load a specific checkpoint by ID */
  getCheckpoint(checkpointId: string): Promise<TaskLoopCheckpoint | null>;

  /** List all checkpoints for a chat (sorted by timestamp desc) */
  listCheckpoints(chatId: string): Promise<TaskLoopCheckpoint[]>;

  /** Delete old checkpoints (keep last N) */
  pruneCheckpoints(chatId: string, keepCount: number): Promise<void>;

  /** Delete a specific checkpoint */
  deleteCheckpoint(checkpointId: string): Promise<void>;

  /** Append event to log */
  appendEvent(entry: Omit<EventLogEntry, "id" | "sequence">): Promise<void>;

  /** Replay events from a sequence number */
  replayEvents(chatId: string, fromSequence?: number): AsyncIterable<EventLogEntry>;

  /** Clear all events for a chat */
  clearEvents(chatId: string): Promise<void>;
}

/**
 * Options for resuming from checkpoint
 */
export interface ResumeOptions {
  /** Checkpoint to resume from */
  checkpoint: TaskLoopCheckpoint;

  /** Fresh LLM config with API key */
  apiKey: string;

  /** Current MCP tools (may have changed since checkpoint) */
  mcpTools?: { name: string; description?: string; inputSchema: Record<string, unknown> }[];

  /** Tool call handler */
  onToolCall?: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Checkpoint created event
 */
export interface CheckpointCreatedEvent {
  type: "checkpoint_created";
  checkpointId: string;
  reason: CheckpointReason;
}
