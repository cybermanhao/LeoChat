import { vi } from 'vitest';

vi.mock('../embedder.js', () => ({
  isModelReady: vi.fn().mockResolvedValue(false),
  getEmbedding: vi.fn().mockResolvedValue(new Float32Array(4)),
  queueEmbedding: vi.fn((fn: () => Promise<void>) => fn()),
}));

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { getDb, closeDb } from '../db.js';
import { indexDocument, listKnowledgeBases, insertLaw, migrateIfNeeded } from '../indexer.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'law-kb-test-'));
  process.env.LAW_KB_DIR = tmpDir;
  getDb();
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true });
  delete process.env.LAW_KB_DIR;
});

describe('indexDocument', () => {
  it('indexes a .txt file', () => {
    const p = join(tmpDir, 'doc.txt');
    writeFileSync(p, '这是一份劳动合同测试文件');
    const result = indexDocument(p);
    expect(result.success).toBe(true);
    expect(result.doc_id).toBeTypeOf('number');
  });

  it('indexes a .md file', () => {
    const p = join(tmpDir, 'doc.md');
    writeFileSync(p, '# 测试\n内容');
    expect(indexDocument(p).success).toBe(true);
  });

  it('rejects unsupported extension', () => {
    const p = join(tmpDir, 'doc.pdf');
    writeFileSync(p, '%PDF');
    const result = indexDocument(p);
    expect(result.success).toBe(false);
    expect(result.error).toContain('不支持');
  });

  it('rejects missing file', () => {
    const result = indexDocument('/nonexistent/path.txt');
    expect(result.success).toBe(false);
  });
});

describe('listKnowledgeBases', () => {
  it('returns zero counts on empty DB', async () => {
    const status = await listKnowledgeBases();
    expect(status.law_count).toBe(0);
    expect(status.user_doc_count).toBe(0);
  });

  it('reflects inserted law', async () => {
    insertLaw({ title: '测试法', content: '第一条内容' });
    const status = await listKnowledgeBases();
    expect(status.law_count).toBe(1);
  });

  it('reflects indexed document', async () => {
    const p = join(tmpDir, 'a.txt');
    writeFileSync(p, '内容');
    indexDocument(p);
    expect((await listKnowledgeBases()).user_doc_count).toBe(1);
  });

  it('listKnowledgeBases returns correct counts', async () => {
    const status = await listKnowledgeBases();
    expect(status.law_count).toBeTypeOf('number');
    expect(status.user_doc_count).toBeTypeOf('number');
    expect(status.law_chunks_count).toBeTypeOf('number');
    expect(status.user_doc_chunks_count).toBeTypeOf('number');
    expect(status.model_ready).toBe(false); // mocked
    expect(status.migration_progress).toBeTypeOf('number');
  });
});

describe('migrateIfNeeded', () => {
  it('migrateIfNeeded creates chunks for existing laws', async () => {
    const db = getDb();
    db.prepare('INSERT INTO laws (title, content) VALUES (?, ?)').run('民法典', '第一条 中华人民共和国民法典正式施行。');
    // laws table has data but law_chunks is empty
    await migrateIfNeeded();
    const chunks = db.prepare('SELECT COUNT(*) as cnt FROM law_chunks').get() as { cnt: number };
    expect(chunks.cnt).toBeGreaterThan(0);
  });
});
