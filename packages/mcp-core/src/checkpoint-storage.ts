/**
 * IndexedDB Checkpoint Storage
 *
 * Implements CheckpointStorage interface for browser persistence
 */

import { generateId } from "@ai-chatbox/shared";
import type {
  CheckpointStorage,
  TaskLoopCheckpoint,
  EventLogEntry,
} from "@ai-chatbox/shared";

const DB_NAME = "leochat-checkpoints";
const DB_VERSION = 1;
const CHECKPOINT_STORE = "checkpoints";
const EVENT_LOG_STORE = "event_log";

/**
 * IndexedDB implementation of CheckpointStorage
 */
export class IndexedDBCheckpointStorage implements CheckpointStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  /**
   * Get or create database connection
   */
  private async getDB(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Checkpoint store
        if (!db.objectStoreNames.contains(CHECKPOINT_STORE)) {
          const checkpointStore = db.createObjectStore(CHECKPOINT_STORE, {
            keyPath: "id",
          });
          checkpointStore.createIndex("chatId_timestamp", ["chatId", "timestamp"]);
          checkpointStore.createIndex("chatId", "chatId");
        }

        // Event log store
        if (!db.objectStoreNames.contains(EVENT_LOG_STORE)) {
          const eventStore = db.createObjectStore(EVENT_LOG_STORE, {
            keyPath: "id",
          });
          eventStore.createIndex("chatId_sequence", ["chatId", "sequence"]);
          eventStore.createIndex("chatId", "chatId");
        }
      };
    });

    return this.dbPromise;
  }

  /**
   * Save a checkpoint
   */
  async saveCheckpoint(checkpoint: TaskLoopCheckpoint): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHECKPOINT_STORE, "readwrite");
      const store = tx.objectStore(CHECKPOINT_STORE);
      const request = store.put(checkpoint);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Load the latest checkpoint for a chat
   */
  async getLatestCheckpoint(chatId: string): Promise<TaskLoopCheckpoint | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHECKPOINT_STORE, "readonly");
      const store = tx.objectStore(CHECKPOINT_STORE);
      const index = store.index("chatId_timestamp");

      // Create range for chatId with any timestamp
      const range = IDBKeyRange.bound([chatId, 0], [chatId, Infinity]);
      const request = index.openCursor(range, "prev"); // Descending by timestamp

      request.onsuccess = () => {
        const cursor = request.result;
        resolve(cursor ? (cursor.value as TaskLoopCheckpoint) : null);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Load a specific checkpoint by ID
   */
  async getCheckpoint(checkpointId: string): Promise<TaskLoopCheckpoint | null> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHECKPOINT_STORE, "readonly");
      const store = tx.objectStore(CHECKPOINT_STORE);
      const request = store.get(checkpointId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * List all checkpoints for a chat (sorted by timestamp desc)
   */
  async listCheckpoints(chatId: string): Promise<TaskLoopCheckpoint[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHECKPOINT_STORE, "readonly");
      const store = tx.objectStore(CHECKPOINT_STORE);
      const index = store.index("chatId");
      const request = index.getAll(chatId);
      request.onsuccess = () => {
        const checkpoints = request.result as TaskLoopCheckpoint[];
        // Sort by timestamp descending
        checkpoints.sort((a, b) => b.timestamp - a.timestamp);
        resolve(checkpoints);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Delete old checkpoints (keep last N)
   */
  async pruneCheckpoints(chatId: string, keepCount: number): Promise<void> {
    const checkpoints = await this.listCheckpoints(chatId);
    if (checkpoints.length <= keepCount) return;

    // Already sorted by timestamp desc, get IDs to delete
    const toDelete = checkpoints.slice(keepCount).map((c) => c.id);

    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHECKPOINT_STORE, "readwrite");
      const store = tx.objectStore(CHECKPOINT_STORE);

      for (const id of toDelete) {
        store.delete(id);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Delete a specific checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CHECKPOINT_STORE, "readwrite");
      const store = tx.objectStore(CHECKPOINT_STORE);
      const request = store.delete(checkpointId);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Get next sequence number for a chat
   */
  private async getNextSequence(chatId: string): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(EVENT_LOG_STORE, "readonly");
      const store = tx.objectStore(EVENT_LOG_STORE);
      const index = store.index("chatId_sequence");

      const range = IDBKeyRange.bound([chatId, 0], [chatId, Infinity]);
      const request = index.openCursor(range, "prev");

      request.onsuccess = () => {
        const cursor = request.result;
        const lastSequence = cursor ? (cursor.value as EventLogEntry).sequence : -1;
        resolve(lastSequence + 1);
      };
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Append event to log
   */
  async appendEvent(
    entry: Omit<EventLogEntry, "id" | "sequence">
  ): Promise<void> {
    const db = await this.getDB();
    const sequence = await this.getNextSequence(entry.chatId);

    const fullEntry: EventLogEntry = {
      ...entry,
      id: generateId(),
      sequence,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(EVENT_LOG_STORE, "readwrite");
      const store = tx.objectStore(EVENT_LOG_STORE);
      const request = store.add(fullEntry);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Replay events from a sequence number
   */
  async *replayEvents(
    chatId: string,
    fromSequence = 0
  ): AsyncIterable<EventLogEntry> {
    const db = await this.getDB();

    const entries: EventLogEntry[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(EVENT_LOG_STORE, "readonly");
      const store = tx.objectStore(EVENT_LOG_STORE);
      const index = store.index("chatId_sequence");

      const range = IDBKeyRange.bound([chatId, fromSequence], [chatId, Infinity]);
      const request = index.getAll(range);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    // Sort by sequence to ensure order
    entries.sort((a, b) => a.sequence - b.sequence);

    for (const entry of entries) {
      yield entry;
    }
  }

  /**
   * Clear all events for a chat
   */
  async clearEvents(chatId: string): Promise<void> {
    const db = await this.getDB();

    // First get all event IDs for this chat
    const eventIds: string[] = await new Promise((resolve, reject) => {
      const tx = db.transaction(EVENT_LOG_STORE, "readonly");
      const store = tx.objectStore(EVENT_LOG_STORE);
      const index = store.index("chatId");
      const request = index.getAllKeys(chatId);
      request.onsuccess = () => resolve(request.result as string[]);
      request.onerror = () => reject(request.error);
    });

    if (eventIds.length === 0) return;

    // Delete all events
    return new Promise((resolve, reject) => {
      const tx = db.transaction(EVENT_LOG_STORE, "readwrite");
      const store = tx.objectStore(EVENT_LOG_STORE);

      for (const id of eventIds) {
        store.delete(id);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.dbPromise) {
      const db = await this.dbPromise;
      db.close();
      this.dbPromise = null;
    }
  }
}

/**
 * Singleton factory for checkpoint storage
 */
let storageInstance: IndexedDBCheckpointStorage | null = null;

export function getCheckpointStorage(): CheckpointStorage {
  if (!storageInstance) {
    storageInstance = new IndexedDBCheckpointStorage();
  }
  return storageInstance;
}

/**
 * Check if IndexedDB is available
 */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}
