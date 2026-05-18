import { vi } from 'vitest';

vi.mock('../embedder.js', () => ({
  isModelReady: vi.fn().mockResolvedValue(false), // degraded mode in tests
  getEmbedding: vi.fn().mockResolvedValue(new Float32Array(4)),
}));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { getDb, closeDb } from '../db.js';
import { searchLaw, searchUserDoc, getLawArticle } from '../search.js';

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
  it('returns results matching query', async () => {
    // Insert a law_chunk so the new search path has data
    const db = getDb();
    const law = db.prepare('SELECT id FROM laws WHERE title LIKE ?').get('%劳动%') as { id: number };
    db.prepare(
      'INSERT INTO law_chunks (law_id, chunk_index, content, article_number, hierarchy_path) VALUES (?, ?, ?, ?, ?)'
    ).run(law.id, 0, '订立劳动合同，应当遵循合法、公平、平等自愿、协商一致、诚实信用的原则。', '第三条', null);

    const results = await searchLaw('劳动合同', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('劳动');
    expect(results[0].source).toBe('law');
  });

  it('respects limit', async () => {
    // Insert chunks for both laws so there is data to limit
    const db = getDb();
    const rows = db.prepare('SELECT id FROM laws').all() as Array<{ id: number }>;
    rows.forEach((row, i) => {
      db.prepare(
        'INSERT INTO law_chunks (law_id, chunk_index, content, article_number, hierarchy_path) VALUES (?, ?, ?, ?, ?)'
      ).run(row.id, 0, '法律内容', null, null);
    });

    const results = await searchLaw('法', 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('returns empty array for unmatched query', async () => {
    const results = await searchLaw('xyznotfound123', 10);
    expect(results).toEqual([]);
  });

  it('handles FTS special characters without throwing', async () => {
    await expect(searchLaw('"unclosed quote', 10)).resolves.not.toThrow();
  });
});

describe('searchUserDoc', () => {
  it('searchUserDoc returns empty when no user docs', async () => {
    const results = await searchUserDoc('合同', 5);
    expect(results).toEqual([]);
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
