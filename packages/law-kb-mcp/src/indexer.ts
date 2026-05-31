// packages/law-kb-mcp/src/indexer.ts
import { readFileSync, existsSync } from 'fs';
import { extname, basename } from 'path';
import { getDb } from './db.js';
import { chunkLaw, chunkUserDoc } from './chunker.js';
import { getEmbedding, queueEmbedding, isModelReady } from './embedder.js';
import { storeChunks } from './vector-search.js';
import type { IndexResult, InsertLawParams, InsertCaseParams, KnowledgeBaseStatus, ChunkInput } from './types.js';

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

export function insertCase(params: InsertCaseParams): number {
  const db = getDb();
  const { lastInsertRowid } = db.prepare(`
    INSERT INTO cases (title, case_number, court, judgment_date, case_type, summary, content, source_url)
    VALUES (@title, @case_number, @court, @judgment_date, @case_type, @summary, @content, @source_url)
  `).run({
    title: params.title,
    case_number: params.case_number ?? null,
    court: params.court ?? null,
    judgment_date: params.judgment_date ?? null,
    case_type: params.case_type ?? null,
    summary: params.summary ?? null,
    content: params.content,
    source_url: params.source_url ?? null,
  });
  const caseId = Number(lastInsertRowid);

  const chunks = chunkUserDoc(params.title, params.content);
  storeChunks('case', caseId, chunks, []);
  queueEmbedding(() => embedChunks('case', caseId, chunks));

  return caseId;
}

export function listCases(caseType?: string): Array<{
  id: number; title: string; case_number: string | null;
  court: string | null; judgment_date: string | null; case_type: string | null;
}> {
  const db = getDb();
  const cols = 'id, title, case_number, court, judgment_date, case_type';
  if (caseType) {
    return db.prepare(
      `SELECT ${cols} FROM cases WHERE case_type = ? ORDER BY judgment_date DESC`
    ).all(caseType) as ReturnType<typeof listCases>;
  }
  return db.prepare(
    `SELECT ${cols} FROM cases ORDER BY judgment_date DESC`
  ).all() as ReturnType<typeof listCases>;
}

async function embedChunks(
  table: 'law' | 'user_doc' | 'case',
  parentId: number,
  chunks: ChunkInput[]
): Promise<void> {
  const ready = await isModelReady();
  if (!ready) return;

  const db = getDb();
  const tbl = table === 'law' ? 'law_chunks' : table === 'case' ? 'case_chunks' : 'user_doc_chunks';
  const parentCol = table === 'law' ? 'law_id' : table === 'case' ? 'case_id' : 'doc_id';

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

async function embedChunksMissingOnly(
  table: 'law' | 'user_doc' | 'case',
  parentId: number,
  chunks: Array<ChunkInput & { embedding: Buffer | null }>
): Promise<void> {
  const ready = await isModelReady();
  if (!ready) return;

  const db = getDb();
  const tbl = table === 'law' ? 'law_chunks' : table === 'case' ? 'case_chunks' : 'user_doc_chunks';
  const parentCol = table === 'law' ? 'law_id' : table === 'case' ? 'case_id' : 'doc_id';

  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].embedding != null) continue; // already embedded
    try {
      const emb = await getEmbedding(chunks[i].content, 'document');
      const buf = Buffer.from(emb.buffer, emb.byteOffset, emb.byteLength);
      db.prepare(
        `UPDATE ${tbl} SET embedding = ? WHERE ${parentCol} = ? AND chunk_index = ?`
      ).run(buf, parentId, i);
    } catch (err) {
      console.error(`[embedder] backfill chunk ${i} of ${tbl}:${parentId} failed:`, err);
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
  const { case_count } = db.prepare('SELECT COUNT(*) as case_count FROM cases').get() as { case_count: number };
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
    case_count,
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

  // Fill missing embeddings for law chunks (e.g. laws added by seed scripts without embeddings)
  const missingLawIds = (db.prepare(
    'SELECT DISTINCT law_id FROM law_chunks WHERE embedding IS NULL'
  ).all() as Array<{ law_id: number }>).map(r => r.law_id);

  for (const lawId of missingLawIds) {
    // Fetch ALL chunks ordered by chunk_index so the array index matches chunk_index in DB
    const rows = db.prepare(
      'SELECT content, article_number, hierarchy_path, embedding FROM law_chunks WHERE law_id = ? ORDER BY chunk_index'
    ).all(lawId) as Array<ChunkInput & { embedding: Buffer | null }>;
    if (rows.length > 0) {
      queueEmbedding(() => embedChunksMissingOnly('law', lawId, rows));
    }
  }

  // Rebuild FTS indexes for cases that were seeded before FTS5 tables existed
  try {
    const { case_count } = db.prepare('SELECT COUNT(*) as case_count FROM cases').get() as { case_count: number };
    if (case_count > 0) {
      const { fts_count } = db.prepare(
        "SELECT COUNT(*) as fts_count FROM cases_fts WHERE cases_fts MATCH '*'"
      ).get() as { fts_count: number };
      if (fts_count === 0) {
        db.exec("INSERT INTO cases_fts(cases_fts) VALUES('rebuild')");
      }
    }
    const { chunk_count } = db.prepare('SELECT COUNT(*) as chunk_count FROM case_chunks').get() as { chunk_count: number };
    if (chunk_count > 0) {
      const { fts_count } = db.prepare(
        "SELECT COUNT(*) as fts_count FROM case_chunks_fts WHERE case_chunks_fts MATCH '*'"
      ).get() as { fts_count: number };
      if (fts_count === 0) {
        db.exec("INSERT INTO case_chunks_fts(case_chunks_fts) VALUES('rebuild')");
      }
    }
  } catch {
    // FTS5 tables may not exist yet (e.g. very first run); initSchema already handles creation
  }
}
