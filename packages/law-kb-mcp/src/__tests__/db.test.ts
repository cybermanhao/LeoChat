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
});
