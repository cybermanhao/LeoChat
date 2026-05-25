import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, copyFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

let db: DatabaseSync | null = null;

function getDbPath(): string {
  const dir = process.env.LAW_KB_DIR ?? join(homedir(), '.leochat-for-law');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'law.db');
}

/** Copy pre-built laws.db to user data dir on first startup (if DB doesn't exist yet). */
function initFromPrebuilt(dbPath: string): void {
  const prebuilt = process.env.LAW_PREBUILT_DB;
  if (!prebuilt || existsSync(dbPath)) return;
  try {
    copyFileSync(prebuilt, dbPath);
    console.error('[law-kb] Copied pre-built laws.db to', dbPath);
  } catch (err) {
    console.error('[law-kb] Failed to copy pre-built DB:', err);
  }
}

export function getDb(): DatabaseSync {
  if (db) return db;
  const dbPath = getDbPath();
  initFromPrebuilt(dbPath);
  db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  initSchema(db);
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS laws (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      article_number  TEXT,
      content         TEXT NOT NULL,
      category        TEXT,
      effective_date  TEXT,
      source_url      TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS laws_fts USING fts5(
      title,
      content,
      tokenize = 'unicode61',
      content = laws,
      content_rowid = id
    );

    CREATE TRIGGER IF NOT EXISTS laws_fts_insert AFTER INSERT ON laws BEGIN
      INSERT INTO laws_fts(rowid, title, content)
      VALUES (new.id, new.title, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS laws_fts_delete AFTER DELETE ON laws BEGIN
      INSERT INTO laws_fts(laws_fts, rowid, title, content)
      VALUES ('delete', old.id, old.title, old.content);
    END;

    CREATE TABLE IF NOT EXISTS user_docs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      filename  TEXT NOT NULL,
      content   TEXT NOT NULL,
      file_path TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS user_docs_fts USING fts5(
      filename,
      content,
      tokenize = 'unicode61',
      content = user_docs,
      content_rowid = id
    );

    CREATE TRIGGER IF NOT EXISTS user_docs_fts_insert AFTER INSERT ON user_docs BEGIN
      INSERT INTO user_docs_fts(rowid, filename, content)
      VALUES (new.id, new.filename, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS user_docs_fts_delete AFTER DELETE ON user_docs BEGIN
      INSERT INTO user_docs_fts(user_docs_fts, rowid, filename, content)
      VALUES ('delete', old.id, old.filename, old.content);
    END;

    CREATE TABLE IF NOT EXISTS law_chunks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      law_id          INTEGER NOT NULL REFERENCES laws(id) ON DELETE CASCADE,
      chunk_index     INTEGER NOT NULL,
      content         TEXT NOT NULL,
      article_number  TEXT,
      hierarchy_path  TEXT,
      embedding       BLOB,
      created_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(law_id, chunk_index)
    );

    CREATE TABLE IF NOT EXISTS user_doc_chunks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id          INTEGER NOT NULL REFERENCES user_docs(id) ON DELETE CASCADE,
      chunk_index     INTEGER NOT NULL,
      content         TEXT NOT NULL,
      hierarchy_path  TEXT,
      embedding       BLOB,
      created_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(doc_id, chunk_index)
    );

    -- FTS5 virtual table for law chunk full-text search
    CREATE VIRTUAL TABLE IF NOT EXISTS law_chunks_fts USING fts5(
      content,
      content='law_chunks',
      content_rowid='id',
      tokenize='unicode61'
    );

    -- Triggers to keep FTS index in sync with law_chunks
    CREATE TRIGGER IF NOT EXISTS law_chunks_fts_insert AFTER INSERT ON law_chunks BEGIN
      INSERT INTO law_chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS law_chunks_fts_delete AFTER DELETE ON law_chunks BEGIN
      INSERT INTO law_chunks_fts(law_chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS law_chunks_fts_update AFTER UPDATE ON law_chunks BEGIN
      INSERT INTO law_chunks_fts(law_chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
      INSERT INTO law_chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;
  `);
}
