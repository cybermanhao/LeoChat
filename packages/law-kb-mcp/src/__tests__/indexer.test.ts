import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { getDb, closeDb } from '../db.js';
import { indexDocument, listKnowledgeBases, insertLaw } from '../indexer.js';

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
  it('returns zero counts on empty DB', () => {
    const status = listKnowledgeBases();
    expect(status.law_count).toBe(0);
    expect(status.user_doc_count).toBe(0);
  });

  it('reflects inserted law', () => {
    insertLaw({ title: '测试法', content: '第一条内容' });
    const status = listKnowledgeBases();
    expect(status.law_count).toBe(1);
  });

  it('reflects indexed document', () => {
    const p = join(tmpDir, 'a.txt');
    writeFileSync(p, '内容');
    indexDocument(p);
    expect(listKnowledgeBases().user_doc_count).toBe(1);
  });
});
