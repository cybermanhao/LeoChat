import { readFileSync, existsSync } from 'fs';
import { extname, basename } from 'path';
import { getDb } from './db.js';
import type { IndexResult, InsertLawParams, KnowledgeBaseStatus } from './types.js';

const SUPPORTED_EXT = new Set(['.txt', '.md']);

export function indexDocument(filePath: string): IndexResult {
  if (!existsSync(filePath)) {
    return { success: false, error: `文件不存在: ${filePath}` };
  }
  const ext = extname(filePath).toLowerCase();
  if (!SUPPORTED_EXT.has(ext)) {
    return { success: false, error: `不支持的文件类型 ${ext}，当前支持 .txt .md` };
  }
  try {
    const content = readFileSync(filePath, 'utf-8');
    const filename = basename(filePath);
    const db = getDb();
    const { lastInsertRowid } = db.prepare(
      'INSERT INTO user_docs (filename, content, file_path) VALUES (?, ?, ?)'
    ).run(filename, content, filePath);
    return { success: true, doc_id: Number(lastInsertRowid) };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

export function insertLaw(params: InsertLawParams): number {
  const db = getDb();
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO laws (title, article_number, content, category, effective_date, source_url)
    VALUES (@title, @article_number, @content, @category, @effective_date, @source_url)
  `).run({
    title: params.title,
    article_number: params.article_number ?? null,
    content: params.content,
    category: params.category ?? null,
    effective_date: params.effective_date ?? null,
    source_url: params.source_url ?? null,
  });
  return Number(lastInsertRowid);
}

export function listKnowledgeBases(): KnowledgeBaseStatus {
  const db = getDb();
  const { law_count } = db.prepare('SELECT COUNT(*) as law_count FROM laws').get() as { law_count: number };
  const { user_doc_count } = db.prepare('SELECT COUNT(*) as user_doc_count FROM user_docs').get() as { user_doc_count: number };
  return { law_count, user_doc_count };
}
