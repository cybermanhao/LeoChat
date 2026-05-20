// packages/law-kb-mcp/src/indexer.ts
import { readFileSync, existsSync } from 'fs';
import { extname, basename } from 'path';
import { getDb } from './db.js';
import { chunkLaw, chunkUserDoc } from './chunker.js';
import { getEmbedding, queueEmbedding, isModelReady } from './embedder.js';
import { storeChunks } from './vector-search.js';
import type { IndexResult, InsertLawParams, KnowledgeBaseStatus, ChunkInput } from './types.js';

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
    const docId = Number(lastInsertRowid);

    // Chunk immediately (sync, fast)
    const chunks = chunkUserDoc(filename, content);
    storeChunks('user_doc', docId, chunks, []);

    // Embed asynchronously
    queueEmbedding(() => embedChunks('user_doc', docId, chunks));

    return { success: true, doc_id: docId };
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
  const lawId = Number(lastInsertRowid);

  const chunks = chunkLaw(params.title, params.content);
  storeChunks('law', lawId, chunks, []);
  queueEmbedding(() => embedChunks('law', lawId, chunks));

  return lawId;
}

async function embedChunks(
  table: 'law' | 'user_doc',
  parentId: number,
  chunks: ChunkInput[]
): Promise<void> {
  const ready = await isModelReady();
  if (!ready) return;

  const db = getDb();
  const tbl = table === 'law' ? 'law_chunks' : 'user_doc_chunks';
  const parentCol = table === 'law' ? 'law_id' : 'doc_id';

  for (let i = 0; i < chunks.length; i++) {
    try {
      const emb = await getEmbedding(chunks[i].content, 'document');
      const buf = Buffer.from(emb.buffer, emb.byteOffset, emb.byteLength);
      db.prepare(
        `UPDATE ${tbl} SET embedding = ? WHERE ${parentCol} = ? AND chunk_index = ?`
      ).run(buf, parentId, i);
    } catch (err) {
      console.error(`[embedder] chunk ${i} of ${tbl}:${parentId} failed:`, err);
    }
  }
}

export function listLaws(category?: string): Array<{ id: number; title: string; category: string | null; effective_date: string | null }> {
  const db = getDb();
  if (category) {
    return db.prepare(
      'SELECT id, title, category, effective_date FROM laws WHERE category = ? ORDER BY title'
    ).all(category) as Array<{ id: number; title: string; category: string | null; effective_date: string | null }>;
  }
  return db.prepare(
    'SELECT id, title, category, effective_date FROM laws ORDER BY category, title'
  ).all() as Array<{ id: number; title: string; category: string | null; effective_date: string | null }>;
}

export async function listKnowledgeBases(): Promise<KnowledgeBaseStatus> {
  const db = getDb();
  const { law_count } = db.prepare('SELECT COUNT(*) as law_count FROM laws').get() as { law_count: number };
  const { user_doc_count } = db.prepare('SELECT COUNT(*) as user_doc_count FROM user_docs').get() as { user_doc_count: number };
  const { law_chunks_count } = db.prepare('SELECT COUNT(*) as law_chunks_count FROM law_chunks').get() as { law_chunks_count: number };
  const { user_doc_chunks_count } = db.prepare('SELECT COUNT(*) as user_doc_chunks_count FROM user_doc_chunks').get() as { user_doc_chunks_count: number };
  const { embedded_count } = db.prepare(
    'SELECT (SELECT COUNT(*) FROM law_chunks WHERE embedding IS NOT NULL) + (SELECT COUNT(*) FROM user_doc_chunks WHERE embedding IS NOT NULL) as embedded_count'
  ).get() as { embedded_count: number };
  const totalChunks = law_chunks_count + user_doc_chunks_count;
  const migration_progress = totalChunks === 0 ? 1.0 : embedded_count / totalChunks;
  const model_ready = await isModelReady();

  return {
    law_count,
    user_doc_count,
    law_chunks_count,
    user_doc_chunks_count,
    model_ready,
    migration_progress,
  };
}

/** Call once on startup: if chunks tables are empty but parent tables have data, re-chunk */
export async function migrateIfNeeded(): Promise<void> {
  const db = getDb();
  const { law_chunks_count } = db.prepare('SELECT COUNT(*) as law_chunks_count FROM law_chunks').get() as { law_chunks_count: number };
  const { law_count } = db.prepare('SELECT COUNT(*) as law_count FROM laws').get() as { law_count: number };

  if (law_count > 0 && law_chunks_count === 0) {
    const laws = db.prepare('SELECT id, title, content FROM laws').all() as Array<{ id: number; title: string; content: string }>;
    for (const law of laws) {
      const chunks = chunkLaw(law.title, law.content);
      storeChunks('law', law.id, chunks, []);
      queueEmbedding(() => embedChunks('law', law.id, chunks));
    }
  }

  const { doc_chunks_count } = db.prepare('SELECT COUNT(*) as doc_chunks_count FROM user_doc_chunks').get() as { doc_chunks_count: number };
  const { user_doc_count } = db.prepare('SELECT COUNT(*) as user_doc_count FROM user_docs').get() as { user_doc_count: number };

  if (user_doc_count > 0 && doc_chunks_count === 0) {
    const docs = db.prepare('SELECT id, filename, content FROM user_docs').all() as Array<{ id: number; filename: string; content: string }>;
    for (const doc of docs) {
      const chunks = chunkUserDoc(doc.filename, doc.content);
      storeChunks('user_doc', doc.id, chunks, []);
      queueEmbedding(() => embedChunks('user_doc', doc.id, chunks));
    }
  }
}
