import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { getDb, closeDb } from '../db.js';
import {
  cosineSimilarity,
  storeChunks,
  vectorSearch,
  rrf,
  invalidateCache,
} from '../vector-search.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'vs-test-'));
  process.env.LAW_KB_DIR = tmpDir;
  getDb();
});

afterEach(() => {
  invalidateCache();
  closeDb();
  rmSync(tmpDir, { recursive: true });
  delete process.env.LAW_KB_DIR;
});

describe('cosineSimilarity', () => {
  it('returns 1.0 for identical vectors', () => {
    const v = new Float32Array([1, 0, 0]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('returns 0.0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it('returns -1.0 for opposite vectors', () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([-1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });
});

describe('storeChunks + vectorSearch', () => {
  it('stores law chunks and retrieves by vector similarity', () => {
    const db = getDb();
    const { lastInsertRowid: lawId } = db.prepare(
      'INSERT INTO laws (title, content) VALUES (?, ?)'
    ).run('劳动合同法', '第一条内容');

    const emb1 = new Float32Array([1, 0, 0, 0]);  // similar to query (same direction)
    const emb2 = new Float32Array([0, 1, 0, 0]);  // dissimilar to query (orthogonal)

    storeChunks('law', Number(lawId), [
      { content: '第一条 劳动合同内容', article_number: '第一条', hierarchy_path: '劳动合同法 > 第一条' },
      { content: '第二条 其他内容', article_number: '第二条', hierarchy_path: '劳动合同法 > 第二条' },
    ], [emb1, emb2]);

    const query = new Float32Array([1, 0, 0, 0]);  // matches emb1 exactly
    const results = vectorSearch('law', query, 2);
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
    expect(results[0].chunk_id).toBeDefined();
  });

  it('returns empty array when no embeddings exist', () => {
    const query = new Float32Array(4).fill(0.5);
    expect(vectorSearch('law', query, 5)).toEqual([]);
  });
});

describe('rrf', () => {
  it('fuses two ranked lists', () => {
    const fts = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const vec = [{ id: 2 }, { id: 1 }, { id: 4 }];
    const result = rrf(fts, vec, 3);
    expect(result.map(r => r.id)).toContain(1);
    expect(result.map(r => r.id)).toContain(2);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  it('handles items appearing in only one list', () => {
    const fts = [{ id: 1 }];
    const vec = [{ id: 2 }];
    const result = rrf(fts, vec, 5);
    expect(result.length).toBe(2);
  });
});
