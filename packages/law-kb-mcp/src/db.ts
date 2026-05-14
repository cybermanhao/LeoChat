import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

let db: Database.Database | null = null;

function getDbPath(): string {
  const dir = process.env.LAW_KB_DIR ?? join(homedir(), '.leochat-for-law');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'law.db');
}

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

function initSchema(db: Database.Database): void {
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
  `);
}
