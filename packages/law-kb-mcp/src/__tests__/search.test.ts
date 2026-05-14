import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { getDb, closeDb } from '../db.js';
import { searchLaw, getLawArticle } from '../search.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'law-kb-test-'));
  process.env.LAW_KB_DIR = tmpDir;
  const db = getDb();
  db.prepare(
    'INSERT INTO laws (title, article_number, content, category) VALUES (?, ?, ?, ?)'
  ).run(
    '中华人民共和国劳动合同法',
    '第三条',
    '订立劳动合同，应当遵循合法、公平、平等自愿、协商一致、诚实信用的原则。',
    '劳动法'
  );
  db.prepare(
    'INSERT INTO laws (title, article_number, content, category) VALUES (?, ?, ?, ?)'
  ).run(
    '中华人民共和国民法典',
    '第一条',
    '为了保护民事主体的合法权益，调整民事关系，维护社会和经济秩序，依照宪法，制定本法。',
    '民法'
  );
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true });
  delete process.env.LAW_KB_DIR;
});

describe('searchLaw', () => {
  it('returns results matching query', () => {
    const results = searchLaw('劳动合同', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('劳动');
    expect(results[0].source).toBe('law');
  });

  it('respects limit', () => {
    const results = searchLaw('法', 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('returns empty array for unmatched query', () => {
    const results = searchLaw('xyznotfound123', 10);
    expect(results).toEqual([]);
  });

  it('handles FTS special characters without throwing', () => {
    expect(() => searchLaw('"unclosed quote', 10)).not.toThrow();
  });
});

describe('getLawArticle', () => {
  it('returns law by id', () => {
    const db = getDb();
    const row = db.prepare('SELECT id FROM laws LIMIT 1').get() as { id: number };
    const result = getLawArticle(row.id);
    expect(result).not.toBeNull();
    expect(result!.content).toBeTruthy();
  });

  it('returns null for missing id', () => {
    expect(getLawArticle(99999)).toBeNull();
  });
});
