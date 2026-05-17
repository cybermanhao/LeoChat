import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { getDb, closeDb } from '../db.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'law-kb-test-'));
  process.env.LAW_KB_DIR = tmpDir;
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true });
  delete process.env.LAW_KB_DIR;
});

describe('getDb', () => {
  it('creates laws and user_docs tables', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('laws');
    expect(names).toContain('user_docs');
  });

  it('creates FTS5 virtual tables', () => {
    const db = getDb();
    const vtables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'"
    ).all() as { name: string }[];
    const names = vtables.map((t) => t.name);
    expect(names).toContain('laws_fts');
    expect(names).toContain('user_docs_fts');
  });

  it('returns same instance on second call', () => {
    expect(getDb()).toBe(getDb());
  });

  it('creates law_chunks and user_doc_chunks tables', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('law_chunks');
    expect(names).toContain('user_doc_chunks');
  });

  it('cascades delete from laws to law_chunks', () => {
    const db = getDb();
    const { lastInsertRowid: lawId } = db.prepare(
      'INSERT INTO laws (title, content) VALUES (?, ?)'
    ).run('测试法', '第一条内容');
    db.prepare(
      'INSERT INTO law_chunks (law_id, chunk_index, content) VALUES (?, ?, ?)'
    ).run(lawId, 0, '第一条内容');
    db.prepare('DELETE FROM laws WHERE id = ?').run(lawId);
    const chunks = db.prepare('SELECT * FROM law_chunks WHERE law_id = ?').all(lawId);
    expect(chunks).toHaveLength(0);
  });

  it('creates law_chunks_fts virtual table', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('law_chunks_fts');
  });

  it('FTS index stays in sync with law_chunks inserts', () => {
    const db = getDb();
    const { lastInsertRowid: lawId } = db.prepare(
      'INSERT INTO laws (title, content) VALUES (?, ?)'
    ).run('劳动合同法', '第一条内容');
    db.prepare(
      'INSERT INTO law_chunks (law_id, chunk_index, content) VALUES (?, ?, ?)'
    ).run(lawId, 0, '劳动合同应当书面订立');
    // unicode61 tokenizer treats the whole CJK string as one token; use phrase match
    const rows = db.prepare(
      'SELECT rowid FROM law_chunks_fts WHERE law_chunks_fts MATCH ?'
    ).all('"劳动合同应当书面订立"');
    expect(rows.length).toBeGreaterThan(0);
  });
});
