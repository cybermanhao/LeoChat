// packages/law-kb-mcp/src/search.ts
import { getDb } from './db.js';
import type { LawArticle, SearchResult } from './types.js';
import { vectorSearch, rrf } from './vector-search.js';
import { getEmbedding, isModelReady } from './embedder.js';

function sanitize(query: string): string {
  return query.replace(/["'*]/g, ' ').trim();
}

/** FTS5 search on law_chunks_fts — returns top-K chunk ids and their parent law ids */
function ftsChunksLaw(safe: string, limit: number): Array<{ chunk_id: number; law_id: number }> {
  const db = getDb();
  try {
    const ftsQuery = safe.split(/\s+/).map(t => `"${t}"`).join(' OR ');
    // Join through the FTS5 virtual table (law_chunks_fts rowid = law_chunks.id)
    const rows = db.prepare(`
      SELECT lc.id as chunk_id, lc.law_id
      FROM law_chunks_fts fts
      JOIN law_chunks lc ON lc.id = fts.rowid
      WHERE law_chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(ftsQuery, limit) as Array<{ chunk_id: number; law_id: number }>;
    if (rows.length > 0) return rows;
  } catch { /* fall through to LIKE */ }

  // LIKE fallback for CJK
  const rows = db.prepare(`
    SELECT id as chunk_id, law_id FROM law_chunks
    WHERE content LIKE ? LIMIT ?
  `).all(`%${safe}%`, limit) as Array<{ chunk_id: number; law_id: number }>;
  return rows;
}

function buildLawResult(chunkId: number, similarity: number): SearchResult | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT lc.id as chunk_id, lc.content, lc.article_number, lc.hierarchy_path,
           l.id as law_id, l.title
    FROM law_chunks lc
    JOIN laws l ON l.id = lc.law_id
    WHERE lc.id = ?
  `).get(chunkId) as {
    chunk_id: number; content: string; article_number: string | null;
    hierarchy_path: string | null; law_id: number; title: string;
  } | undefined;
  if (!row) return null;
  return {
    id: row.law_id,
    title: row.title,
    article_number: row.article_number,
    snippet: row.content.slice(0, 120),
    rank: 0,
    source: 'law',
    hierarchy_path: row.hierarchy_path,
    chunk_id: row.chunk_id,
    similarity,
  };
}

export async function searchLaw(query: string, limit: number): Promise<SearchResult[]> {
  const safe = sanitize(query);
  if (!safe) return [];

  const ftsChunks = ftsChunksLaw(safe, 10);
  const modelReady = await isModelReady();

  if (!modelReady) {
    // Graceful degradation: pure FTS5/LIKE
    return ftsChunks
      .slice(0, limit)
      .map(r => buildLawResult(r.chunk_id, 0))
      .filter((r): r is SearchResult => r !== null);
  }

  const queryEmb = await getEmbedding(safe, 'query');
  const vecResults = vectorSearch('law', queryEmb, 10);

  const fused = rrf(
    ftsChunks.map(r => ({ id: r.chunk_id })),
    vecResults.map(r => ({ id: r.chunk_id })),
    limit
  );

  const simMap = new Map(vecResults.map(r => [r.chunk_id, r.similarity]));
  return fused
    .map(r => buildLawResult(r.id, simMap.get(r.id) ?? 0))
    .filter((r): r is SearchResult => r !== null);
}

export async function searchUserDoc(query: string, limit: number): Promise<SearchResult[]> {
  const safe = sanitize(query);
  if (!safe) return [];

  const db = getDb();
  const ftsRows = db.prepare(`
    SELECT id as chunk_id, doc_id FROM user_doc_chunks
    WHERE content LIKE ? LIMIT ?
  `).all(`%${safe}%`, 10) as Array<{ chunk_id: number; doc_id: number }>;

  const modelReady = await isModelReady();
  if (!modelReady) {
    return ftsRows.slice(0, limit).map(r => buildUserDocResult(r.chunk_id, 0)).filter((r): r is SearchResult => r !== null);
  }

  const queryEmb = await getEmbedding(safe, 'query');
  const vecResults = vectorSearch('user_doc', queryEmb, 10);

  const fused = rrf(
    ftsRows.map(r => ({ id: r.chunk_id })),
    vecResults.map(r => ({ id: r.chunk_id })),
    limit
  );

  const simMap = new Map(vecResults.map(r => [r.chunk_id, r.similarity]));
  return fused
    .map(r => buildUserDocResult(r.id, simMap.get(r.id) ?? 0))
    .filter((r): r is SearchResult => r !== null);
}

function buildUserDocResult(chunkId: number, similarity: number): SearchResult | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT udc.id as chunk_id, udc.content, udc.hierarchy_path,
           ud.id as doc_id, ud.filename
    FROM user_doc_chunks udc
    JOIN user_docs ud ON ud.id = udc.doc_id
    WHERE udc.id = ?
  `).get(chunkId) as {
    chunk_id: number; content: string; hierarchy_path: string | null;
    doc_id: number; filename: string;
  } | undefined;
  if (!row) return null;
  return {
    id: row.doc_id,
    title: row.filename,
    article_number: null,
    snippet: row.content.slice(0, 120),
    rank: 0,
    source: 'user_doc',
    hierarchy_path: row.hierarchy_path,
    chunk_id: row.chunk_id,
    similarity,
  };
}

export function getLawArticle(id: number): LawArticle | null {
  const db = getDb();
  const result = db.prepare('SELECT * FROM laws WHERE id = ?').get(id);
  return result !== undefined ? (result as LawArticle) : null;
}
