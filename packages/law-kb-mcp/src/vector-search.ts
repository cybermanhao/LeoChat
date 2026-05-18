import { getDb } from './db.js';
import type { ChunkInput } from './types.js';

type TableName = 'law' | 'user_doc';

interface CacheEntry {
  chunk_id: number;
  parent_id: number;
  embedding: Float32Array;
}

const caches: Record<TableName, CacheEntry[] | null> = { law: null, user_doc: null };

function loadCache(table: TableName): CacheEntry[] {
  if (caches[table]) return caches[table]!;
  const db = getDb();
  const tbl = table === 'law' ? 'law_chunks' : 'user_doc_chunks';
  const parentCol = table === 'law' ? 'law_id' : 'doc_id';
  const rows = db.prepare(
    `SELECT id, ${parentCol} as parent_id, embedding FROM ${tbl} WHERE embedding IS NOT NULL`
  ).all() as Array<{ id: number; parent_id: number; embedding: Buffer }>;

  caches[table] = rows.map(r => ({
    chunk_id: r.id,
    parent_id: r.parent_id,
    embedding: bufferToFloat32(r.embedding),
  }));
  return caches[table]!;
}

export function invalidateCache(table?: TableName): void {
  if (table) { caches[table] = null; }
  else { caches.law = null; caches.user_doc = null; }
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function vectorSearch(
  table: TableName,
  queryEmbedding: Float32Array,
  topK: number
): Array<{ chunk_id: number; parent_id: number; similarity: number }> {
  const cache = loadCache(table);
  if (cache.length === 0) return [];

  return cache
    .map(entry => ({
      chunk_id: entry.chunk_id,
      parent_id: entry.parent_id,
      similarity: cosineSimilarity(queryEmbedding, entry.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

export function storeChunks(
  table: TableName,
  parentId: number,
  chunks: ChunkInput[],
  embeddings: Float32Array[]
): void {
  if (table === 'law') {
    storeLawChunks(parentId, chunks, embeddings);
  } else {
    storeUserDocChunks(parentId, chunks, embeddings);
  }
  caches[table] = null; // invalidate; reload lazily on next search
}

function storeLawChunks(lawId: number, chunks: ChunkInput[], embeddings: Float32Array[]): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR REPLACE INTO law_chunks
       (law_id, chunk_index, content, article_number, hierarchy_path, embedding)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  db.transaction(() => {
    chunks.forEach((chunk, i) => {
      insert.run(
        lawId, i, chunk.content,
        chunk.article_number ?? null,
        chunk.hierarchy_path ?? null,
        embeddings[i] ? float32ToBuffer(embeddings[i]) : null
      );
    });
  })();
}

function storeUserDocChunks(docId: number, chunks: ChunkInput[], embeddings: Float32Array[]): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT OR REPLACE INTO user_doc_chunks
       (doc_id, chunk_index, content, hierarchy_path, embedding)
     VALUES (?, ?, ?, ?, ?)`
  );
  db.transaction(() => {
    chunks.forEach((chunk, i) => {
      insert.run(
        docId, i, chunk.content,
        chunk.hierarchy_path ?? null,
        embeddings[i] ? float32ToBuffer(embeddings[i]) : null
      );
    });
  })();
}

/** RRF fusion: merges two ranked lists, returns top-k by fused score */
export function rrf<T extends { id: number }>(
  list1: T[],
  list2: T[],
  topK: number,
  k = 60
): Array<{ id: number; score: number }> {
  const scores = new Map<number, number>();

  list1.forEach((item, rank) => {
    scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + rank + 1));
  });
  list2.forEach((item, rank) => {
    scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + rank + 1));
  });

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topK)
    .map(([id, score]) => ({ id, score }));
}

function float32ToBuffer(arr: Float32Array): Buffer {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

function bufferToFloat32(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}
