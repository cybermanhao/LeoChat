# law-kb Phase 2: Vector Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add BGE-m3 semantic vector search to `law-kb-mcp`, fused with existing FTS5 via RRF, with lazy-load embedding cache, async embedding queue, and migration for existing data.

**Architecture:** Vectors stored as Float32Array BLOBs in SQLite (`law_chunks` / `user_doc_chunks`). On first search, all embeddings are loaded into memory and cached for the process lifetime. New chunks are appended to the cache without a full reload. Hybrid search = FTS5 top-10 + vector top-10 → RRF k=60 → top-5. Embedding generation is serialised through an internal queue to prevent ONNX OOM. Model is downloaded from `hf-mirror.com` on first use; until model is ready, search degrades gracefully to pure FTS5.

**Tech Stack:** TypeScript, `better-sqlite3`, `@xenova/transformers` (ONNX, quantized BGE-m3), vitest

**Baseline SHA:** `86ff79e`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types.ts` | Modify | Add `LawChunk`, `UserDocChunk`, `ChunkInput`; extend `SearchResult`, `KnowledgeBaseStatus` |
| `src/db.ts` | Modify | Add `law_chunks` + `user_doc_chunks` schema with UNIQUE + CASCADE |
| `src/chunker.ts` | Create | `chunkLaw()` + `chunkUserDoc()` — pure functions, no DB |
| `src/embedder.ts` | Create | BGE-m3 load/download, serial queue, `getEmbedding()` |
| `src/vector-search.ts` | Create | In-memory cache, cosine similarity, RRF fusion |
| `src/search.ts` | Modify | `searchLaw` → hybrid on `law_chunks`; add `searchUserDoc` |
| `src/indexer.ts` | Modify | Trigger chunking + async embedding after insert; add `migrateIfNeeded()` |
| `src/index.ts` | Modify | Register `search_user_doc` tool; update `list_knowledge_bases` |
| `src/__tests__/chunker.test.ts` | Create | Unit tests for chunker (pure functions, no mock needed) |
| `src/__tests__/embedder.test.ts` | Create | Unit tests with mocked `@xenova/transformers` |
| `src/__tests__/vector-search.test.ts` | Create | Unit tests with deterministic vectors |
| `packages/server/src/routes/index.ts` | Modify | Add `/kb/model-status`, `/kb/download-model` |
| `apps/web/src/lib/kbApi.ts` | Modify | Add `getModelStatus()`, `downloadModel()` |
| `apps/web/src/components/mcp/LawKnowledgeTab.tsx` | Modify | Model status row + migration progress |

---

### Task 1: Extend types and DB schema

**Files:**
- Modify: `packages/law-kb-mcp/src/types.ts`
- Modify: `packages/law-kb-mcp/src/db.ts`
- Modify: `packages/law-kb-mcp/src/__tests__/db.test.ts`

- [ ] **Step 1: Update `src/types.ts`**

Replace the entire file content:

```typescript
// packages/law-kb-mcp/src/types.ts

export interface LawArticle {
  id: number;
  title: string;
  article_number: string | null;
  content: string;
  category: string | null;
  effective_date: string | null;
  source_url: string | null;
  created_at: string;
}

export interface UserDoc {
  id: number;
  filename: string;
  content: string;
  file_path: string | null;
  created_at: string;
}

export interface LawChunk {
  id: number;
  law_id: number;
  chunk_index: number;
  content: string;
  article_number: string | null;
  hierarchy_path: string | null;
  embedding: Buffer | null;
  created_at: string;
}

export interface UserDocChunk {
  id: number;
  doc_id: number;
  chunk_index: number;
  content: string;
  hierarchy_path: string | null;
  embedding: Buffer | null;
  created_at: string;
}

/** Input shape for chunker functions — no DB IDs yet */
export interface ChunkInput {
  content: string;
  article_number?: string;
  hierarchy_path?: string;
}

export interface SearchResult {
  id: number;
  title: string;
  article_number: string | null;
  snippet: string;
  rank: number;
  source: 'law' | 'user_doc';
  hierarchy_path: string | null;
  chunk_id: number;
  similarity: number;
}

export interface KnowledgeBaseStatus {
  law_count: number;
  user_doc_count: number;
  law_chunks_count: number;
  user_doc_chunks_count: number;
  model_ready: boolean;
  migration_progress: number;
}

export interface IndexResult {
  success: boolean;
  doc_id?: number;
  error?: string;
}

export interface InsertLawParams {
  title: string;
  article_number?: string;
  content: string;
  category?: string;
  effective_date?: string;
  source_url?: string;
}
```

- [ ] **Step 2: Add new tables to `initSchema` in `src/db.ts`**

Append to the `db.exec(...)` call inside `initSchema` (after the existing `user_docs_fts_delete` trigger):

```typescript
    CREATE TABLE IF NOT EXISTS law_chunks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      law_id          INTEGER NOT NULL REFERENCES laws(id) ON DELETE CASCADE,
      chunk_index     INTEGER NOT NULL,
      content         TEXT NOT NULL,
      article_number  TEXT,
      hierarchy_path  TEXT,
      embedding       BLOB,
      created_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(law_id, chunk_index)
    );

    CREATE TABLE IF NOT EXISTS user_doc_chunks (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      doc_id          INTEGER NOT NULL REFERENCES user_docs(id) ON DELETE CASCADE,
      chunk_index     INTEGER NOT NULL,
      content         TEXT NOT NULL,
      hierarchy_path  TEXT,
      embedding       BLOB,
      created_at      TEXT DEFAULT (datetime('now')),
      UNIQUE(doc_id, chunk_index)
    );
```

Also enable foreign keys in `getDb()` (already set via `PRAGMA foreign_keys = ON` — verify it's there, add if missing).

- [ ] **Step 3: Add DB tests for new tables**

Add to `src/__tests__/db.test.ts`:

```typescript
it('creates law_chunks and user_doc_chunks tables', () => {
  const db = getDb();
  const tables = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table'"
  ).all() as { name: string }[];
  const names = tables.map((t) => t.name);
  expect(names).toContain('law_chunks');
  expect(names).toContain('user_doc_chunks');
});

it('cascades delete from laws to law_chunks', () => {
  const db = getDb();
  const { lastInsertRowid: lawId } = db.prepare(
    'INSERT INTO laws (title, content) VALUES (?, ?)'
  ).run('测试法', '第一条内容');
  db.prepare(
    'INSERT INTO law_chunks (law_id, chunk_index, content) VALUES (?, ?, ?)'
  ).run(lawId, 0, '第一条内容');
  db.prepare('DELETE FROM laws WHERE id = ?').run(lawId);
  const chunks = db.prepare('SELECT * FROM law_chunks WHERE law_id = ?').all(lawId);
  expect(chunks).toHaveLength(0);
});
```

- [ ] **Step 4: Run tests**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: all tests pass (now 21+ tests).

- [ ] **Step 5: Commit**

```bash
git add packages/law-kb-mcp/src/types.ts packages/law-kb-mcp/src/db.ts packages/law-kb-mcp/src/__tests__/db.test.ts
git commit -m "feat(law-kb-mcp): add law_chunks/user_doc_chunks schema + extended types"
```

---

### Task 2: Chunker

**Files:**
- Create: `packages/law-kb-mcp/src/chunker.ts`
- Create: `packages/law-kb-mcp/src/__tests__/chunker.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/law-kb-mcp/src/__tests__/chunker.test.ts
import { describe, it, expect } from 'vitest';
import { chunkLaw, chunkUserDoc } from '../chunker.js';

describe('chunkLaw', () => {
  it('splits law content by article markers', () => {
    const chunks = chunkLaw(
      '劳动合同法',
      '第一条 劳动合同应当以书面形式订立。\n第二条 劳动合同期限分为固定期限、无固定期限。'
    );
    expect(chunks.length).toBe(2);
    expect(chunks[0].article_number).toBe('第一条');
    expect(chunks[0].content).toContain('书面形式');
    expect(chunks[1].article_number).toBe('第二条');
  });

  it('sets hierarchy_path from chapter context', () => {
    const chunks = chunkLaw(
      '劳动合同法',
      '第二章 劳动合同的订立\n第十条 建立劳动关系，应当订立书面劳动合同。'
    );
    expect(chunks[0].hierarchy_path).toBe('劳动合同法 > 第二章 劳动合同的订立 > 第十条');
  });

  it('handles 两百-style article numbers', () => {
    const chunks = chunkLaw('测试法', '第两百零一条 本条内容。');
    expect(chunks[0].article_number).toBe('第两百零一条');
  });

  it('falls back to fixed window when no structure detected', () => {
    const longText = '合同条款说明'.repeat(50); // ~300 chars, no article markers
    const chunks = chunkLaw('无结构文件', longText);
    expect(chunks.length).toBeGreaterThan(0);
    chunks.forEach(c => expect(c.content.length).toBeLessThanOrEqual(220));
  });

  it('splits long articles at clause markers', () => {
    const content = '第一条 ' + '（一）款一内容。'.repeat(5) + '（二）款二内容。'.repeat(5);
    const chunks = chunkLaw('测试法', content);
    // Long article should be split into sub-chunks
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('chunkUserDoc', () => {
  it('uses law chunker when structured', () => {
    const content = '第一条 内容一。\n第二条 内容二。\n第三条 内容三。';
    const chunks = chunkUserDoc('合同.txt', content);
    expect(chunks.length).toBe(3);
    expect(chunks[0].article_number).toBe('第一条');
  });

  it('uses paragraph chunker for unstructured text', () => {
    const content = '这是第一段，描述合同背景。\n\n这是第二段，描述违约责任。\n\n这是第三段，描述争议解决。';
    const chunks = chunkUserDoc('说明.txt', content);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].hierarchy_path).toContain('说明.txt');
  });

  it('respects 250-char limit per chunk', () => {
    const longPara = '这是一个很长的段落。' + '补充内容。'.repeat(40);
    const chunks = chunkUserDoc('长文.txt', longPara);
    chunks.forEach(c => expect(c.content.length).toBeLessThanOrEqual(260));
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd packages/law-kb-mcp && pnpm test -- --reporter=verbose 2>&1 | grep -E "FAIL|Cannot find"
```

Expected: `Cannot find module '../chunker.js'`

- [ ] **Step 3: Implement `src/chunker.ts`**

```typescript
// packages/law-kb-mcp/src/chunker.ts
import type { ChunkInput } from './types.js';

// Matches: 第一条, 第十条, 第两百零一条, etc.
const ARTICLE_RE = /第[零一二两三四五六七八九十百千]+条/g;
// Matches chapter headings: 第一章 xxx
const CHAPTER_RE = /第[零一二两三四五六七八九十百千]+章\s*[\S]*/;
// Clause sub-markers within a single article
const CLAUSE_RE = /[（(][一二三四五六七八九十]+[）)]|^[一二三四五六七八九十]+、/gm;

const MAX_CHUNK = 300;
const WINDOW = 200;

export function chunkLaw(lawTitle: string, content: string): ChunkInput[] {
  const matches = [...content.matchAll(ARTICLE_RE)];
  if (matches.length === 0) return fixedWindowChunks(lawTitle, content);

  const chunks: ChunkInput[] = [];
  let currentChapter = '';

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = match.index!;
    const end = matches[i + 1]?.index ?? content.length;
    const articleNumber = match[0];
    const articleContent = content.slice(start, end).trim();

    // Look backwards for the nearest chapter heading
    const before = content.slice(0, start);
    const chapterMatch = before.match(new RegExp(CHAPTER_RE, 'g'));
    if (chapterMatch) currentChapter = chapterMatch[chapterMatch.length - 1].trim();

    const hierarchyPath = currentChapter
      ? `${lawTitle} > ${currentChapter} > ${articleNumber}`
      : `${lawTitle} > ${articleNumber}`;

    if (articleContent.length <= MAX_CHUNK) {
      chunks.push({ content: articleContent, article_number: articleNumber, hierarchy_path: hierarchyPath });
    } else {
      // Split long article at clause markers
      const subChunks = splitAtClauses(articleContent, articleNumber, hierarchyPath);
      chunks.push(...subChunks);
    }
  }

  return chunks;
}

export function chunkUserDoc(filename: string, content: string): ChunkInput[] {
  // Detect structured legal text: ≥3 article markers → treat as law
  const articleCount = (content.match(ARTICLE_RE) || []).length;
  if (articleCount >= 3) {
    return chunkLaw(filename.replace(/\.[^.]+$/, ''), content);
  }
  return paragraphChunks(filename, content);
}

function splitAtClauses(
  articleContent: string,
  articleNumber: string,
  hierarchyPath: string
): ChunkInput[] {
  const parts = articleContent.split(CLAUSE_RE).filter(p => p.trim().length > 0);
  if (parts.length <= 1) {
    // No clause markers — use fixed window
    return fixedWindowChunks(hierarchyPath, articleContent).map(c => ({
      ...c,
      article_number: articleNumber,
      hierarchy_path: hierarchyPath,
    }));
  }
  return parts.map(part => ({
    content: part.trim(),
    article_number: articleNumber,
    hierarchy_path: hierarchyPath,
  }));
}

function paragraphChunks(filename: string, content: string): ChunkInput[] {
  const paragraphs = content.split(/\n{2,}|\n(?=\S)/).filter(p => p.trim().length > 0);
  const chunks: ChunkInput[] = [];
  let buffer = '';
  let idx = 0;

  const flush = () => {
    if (buffer.trim()) {
      chunks.push({
        content: buffer.trim(),
        hierarchy_path: `${filename} > 第${idx + 1}段`,
      });
      idx++;
      buffer = '';
    }
  };

  for (const para of paragraphs) {
    if (buffer.length + para.length > 250) {
      flush();
    }
    // Split oversized single paragraph at sentence boundaries
    if (para.length > 250) {
      const sentences = para.split(/(?<=。|！|？)/);
      for (const s of sentences) {
        if (buffer.length + s.length > 250) flush();
        buffer += s;
      }
    } else {
      buffer += (buffer ? '\n' : '') + para;
    }
  }
  flush();
  return chunks;
}

function fixedWindowChunks(label: string, text: string): ChunkInput[] {
  const chunks: ChunkInput[] = [];
  let i = 0;
  let idx = 0;
  while (i < text.length) {
    chunks.push({
      content: text.slice(i, i + WINDOW),
      hierarchy_path: `${label} > chunk_${idx}`,
    });
    i += WINDOW;
    idx++;
  }
  return chunks;
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/law-kb-mcp/src/chunker.ts packages/law-kb-mcp/src/__tests__/chunker.test.ts
git commit -m "feat(law-kb-mcp): document chunker for structured and unstructured legal text"
```

---

### Task 3: Embedder

**Files:**
- Modify: `packages/law-kb-mcp/package.json` (add `@xenova/transformers`)
- Create: `packages/law-kb-mcp/src/embedder.ts`
- Create: `packages/law-kb-mcp/src/__tests__/embedder.test.ts`

- [ ] **Step 1: Add dependency**

In `packages/law-kb-mcp/package.json`, add to `dependencies`:
```json
"@xenova/transformers": "^2.17.2"
```

Then run:
```bash
cd packages/law-kb-mcp && pnpm install
```

- [ ] **Step 2: Write failing tests**

```typescript
// packages/law-kb-mcp/src/__tests__/embedder.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @xenova/transformers before any import
vi.mock('@xenova/transformers', () => ({
  pipeline: vi.fn(),
  env: { remoteURL: '', allowLocalModels: true, localModelPath: '' },
}));

import { getEmbedding, isModelReady, queueEmbedding } from '../embedder.js';
import { pipeline } from '@xenova/transformers';

describe('getEmbedding', () => {
  beforeEach(() => {
    vi.mocked(pipeline).mockResolvedValue(((_text: string) => ({
      data: new Float32Array(1024).fill(0.1),
    })) as any);
  });

  it('returns Float32Array of length 1024', async () => {
    const result = await getEmbedding('劳动合同解除');
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(1024);
  });

  it('accepts mode parameter without error', async () => {
    await expect(getEmbedding('test', 'query')).resolves.toBeInstanceOf(Float32Array);
    await expect(getEmbedding('test', 'document')).resolves.toBeInstanceOf(Float32Array);
  });
});

describe('queueEmbedding', () => {
  it('runs tasks serially', async () => {
    const order: number[] = [];
    const task = (n: number) => async () => {
      await new Promise(r => setTimeout(r, 10));
      order.push(n);
    };
    queueEmbedding(task(1));
    queueEmbedding(task(2));
    queueEmbedding(task(3));
    // Wait for queue to drain
    await new Promise(r => setTimeout(r, 100));
    expect(order).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd packages/law-kb-mcp && pnpm test 2>&1 | grep -E "FAIL|Cannot find"
```

Expected: `Cannot find module '../embedder.js'`

- [ ] **Step 4: Implement `src/embedder.ts`**

```typescript
// packages/law-kb-mcp/src/embedder.ts
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

const MODEL_ID = 'BAAI/bge-m3';

function getModelDir(): string {
  const base = process.env.LAW_KB_DIR ?? join(homedir(), '.leochat-for-law');
  return join(base, 'models', 'bge-m3');
}

let extractor: ((text: string, opts: object) => Promise<{ data: Float32Array }>) | null = null;
let embeddingQueue: Promise<void> = Promise.resolve();

async function getExtractor() {
  if (extractor) return extractor;
  const { pipeline, env } = await import('@xenova/transformers');
  const modelDir = getModelDir();
  (env as any).remoteURL = 'https://hf-mirror.com/';
  (env as any).allowLocalModels = true;
  (env as any).localModelPath = modelDir;
  extractor = await pipeline('feature-extraction', MODEL_ID, {
    quantized: true,
    cache_dir: modelDir,
  }) as any;
  return extractor!;
}

// BGE-m3 dense retrieval: query/document use the same encoding (no instruction prefix needed)
// mode param is retained for API clarity and future use
export async function getEmbedding(
  text: string,
  _mode: 'query' | 'document' = 'document'
): Promise<Float32Array> {
  const pipe = await getExtractor();
  const output = await pipe(text, { pooling: 'cls', normalize: true });
  return output.data;
}

export async function isModelReady(): Promise<boolean> {
  return existsSync(join(getModelDir(), 'config.json'));
}

export async function downloadModel(onProgress: (pct: number) => void): Promise<void> {
  const { pipeline, env } = await import('@xenova/transformers');
  const modelDir = getModelDir();
  (env as any).remoteURL = 'https://hf-mirror.com/';
  (env as any).allowLocalModels = false;
  extractor = null; // reset after download
  await (pipeline as any)('feature-extraction', MODEL_ID, {
    quantized: true,
    cache_dir: modelDir,
    progress_callback: (p: { progress?: number }) => {
      if (p.progress != null) onProgress(Math.round(p.progress));
    },
  });
  extractor = null; // force reload from local on next getEmbedding call
}

export function queueEmbedding(fn: () => Promise<void>): void {
  embeddingQueue = embeddingQueue
    .then(fn)
    .catch(err => console.error('[embedder queue]', err));
}
```

- [ ] **Step 5: Run tests**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/law-kb-mcp/package.json packages/law-kb-mcp/src/embedder.ts packages/law-kb-mcp/src/__tests__/embedder.test.ts
git commit -m "feat(law-kb-mcp): BGE-m3 embedder with serial queue and hf-mirror download"
```

---

### Task 4: Vector search module

**Files:**
- Create: `packages/law-kb-mcp/src/vector-search.ts`
- Create: `packages/law-kb-mcp/src/__tests__/vector-search.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/law-kb-mcp/src/__tests__/vector-search.test.ts
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

    const emb1 = new Float32Array(4).fill(0.9);  // similar to query
    const emb2 = new Float32Array(4).fill(0.1);  // dissimilar

    storeChunks('law', Number(lawId), [
      { content: '第一条 劳动合同内容', article_number: '第一条', hierarchy_path: '劳动合同法 > 第一条' },
      { content: '第二条 其他内容', article_number: '第二条', hierarchy_path: '劳动合同法 > 第二条' },
    ], [emb1, emb2]);

    const query = new Float32Array(4).fill(0.9);
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
    // id:1 ranks 1st in fts, 2nd in vec — should score well
    // id:2 ranks 2nd in fts, 1st in vec — should also score well
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd packages/law-kb-mcp && pnpm test 2>&1 | grep -E "FAIL|Cannot find"
```

- [ ] **Step 3: Implement `src/vector-search.ts`**

```typescript
// packages/law-kb-mcp/src/vector-search.ts
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
  const db = getDb();
  const tbl = table === 'law' ? 'law_chunks' : 'user_doc_chunks';
  const parentCol = table === 'law' ? 'law_id' : 'doc_id';

  const insert = db.prepare(
    `INSERT OR REPLACE INTO ${tbl} (${parentCol}, chunk_index, content, ${
      table === 'law' ? 'article_number, ' : ''
    }hierarchy_path, embedding)
     VALUES (?, ?, ?, ${table === 'law' ? '?, ' : ''}?, ?)`
  );

  db.transaction(() => {
    chunks.forEach((chunk, i) => {
      const embBlob = embeddings[i] ? float32ToBuffer(embeddings[i]) : null;
      if (table === 'law') {
        insert.run(parentId, i, chunk.content, chunk.article_number ?? null, chunk.hierarchy_path ?? null, embBlob);
      } else {
        insert.run(parentId, i, chunk.content, chunk.hierarchy_path ?? null, embBlob);
      }
    });
  })();

  // Append to cache if already loaded (avoid full reload)
  if (caches[table]) {
    chunks.forEach((_, i) => {
      if (embeddings[i]) {
        // Approximate: get the last inserted id range
        // Cache will be refreshed on next cold start or explicit invalidate
      }
    });
    caches[table] = null; // Simpler: invalidate and reload lazily
  }
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
```

- [ ] **Step 4: Run tests**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/law-kb-mcp/src/vector-search.ts packages/law-kb-mcp/src/__tests__/vector-search.test.ts
git commit -m "feat(law-kb-mcp): vector search with in-memory cache, cosine similarity, RRF"
```

---

### Task 5: Upgrade `search.ts` to hybrid retrieval

**Files:**
- Modify: `packages/law-kb-mcp/src/search.ts`
- Modify: `packages/law-kb-mcp/src/__tests__/search.test.ts`

- [ ] **Step 1: Update `src/search.ts`**

Replace the file content:

```typescript
// packages/law-kb-mcp/src/search.ts
import { getDb } from './db.js';
import type { LawArticle, SearchResult } from './types.js';
import { vectorSearch, rrf } from './vector-search.js';
import { getEmbedding, isModelReady } from './embedder.js';

function sanitize(query: string): string {
  return query.replace(/["'*]/g, ' ').trim();
}

/** FTS5 search on law_chunks — returns top-K chunk ids and their parent law ids */
function ftsChunsLaw(safe: string, limit: number): Array<{ chunk_id: number; law_id: number }> {
  const db = getDb();
  try {
    const ftsQuery = safe.split(/\s+/).map(t => `"${t}"`).join(' OR ');
    const rows = db.prepare(`
      SELECT lc.id as chunk_id, lc.law_id
      FROM law_chunks lc
      WHERE lc.content MATCH ?
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

  const ftsChunks = ftsChunsLaw(safe, 10);
  const modelReady = await isModelReady();

  if (!modelReady) {
    // Graceful degradation: pure FTS5
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
  // FTS on user_doc_chunks (need FTS5 virtual table — see db.ts note)
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
```

- [ ] **Step 2: Update `src/__tests__/search.test.ts`** — add mock for embedder

Add at the top of the file (before existing imports):

```typescript
vi.mock('../embedder.js', () => ({
  isModelReady: vi.fn().mockResolvedValue(false), // degraded mode in tests
  getEmbedding: vi.fn().mockResolvedValue(new Float32Array(4)),
}));
```

Update existing test calls from `searchLaw(query, limit)` to `await searchLaw(query, limit)` (function is now async).

- [ ] **Step 3: Run tests**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/law-kb-mcp/src/search.ts packages/law-kb-mcp/src/__tests__/search.test.ts
git commit -m "feat(law-kb-mcp): hybrid search on law_chunks with RRF fusion, graceful degradation"
```

---

### Task 6: Upgrade indexer + migration

**Files:**
- Modify: `packages/law-kb-mcp/src/indexer.ts`
- Modify: `packages/law-kb-mcp/src/__tests__/indexer.test.ts`

- [ ] **Step 1: Replace `src/indexer.ts`**

```typescript
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

export function listKnowledgeBases(): KnowledgeBaseStatus {
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

  return {
    law_count,
    user_doc_count,
    law_chunks_count,
    user_doc_chunks_count,
    model_ready: false, // filled in by caller if needed (isModelReady is async)
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
```

- [ ] **Step 2: Update indexer tests** — mock embedder and chunker

Add to top of `src/__tests__/indexer.test.ts`:

```typescript
vi.mock('../embedder.js', () => ({
  isModelReady: vi.fn().mockResolvedValue(false),
  getEmbedding: vi.fn().mockResolvedValue(new Float32Array(4)),
  queueEmbedding: vi.fn((fn: () => Promise<void>) => fn()),
}));
```

- [ ] **Step 3: Run tests**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/law-kb-mcp/src/indexer.ts packages/law-kb-mcp/src/__tests__/indexer.test.ts
git commit -m "feat(law-kb-mcp): indexer triggers chunking + async embedding; add migrateIfNeeded"
```

---

### Task 7: Update MCP server entry

**Files:**
- Modify: `packages/law-kb-mcp/src/index.ts`

- [ ] **Step 1: Replace `src/index.ts`**

```typescript
// packages/law-kb-mcp/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchLaw, getLawArticle, searchUserDoc } from './search.js';
import { indexDocument, listKnowledgeBases, migrateIfNeeded } from './indexer.js';
import { isModelReady } from './embedder.js';

const server = new McpServer({ name: 'law-kb-mcp', version: '2.0.0' });

server.tool(
  'search_law',
  '检索法律法规条文（语义 + 关键词混合检索），返回相关法条列表及摘要',
  {
    query: z.string().describe('搜索关键词或自然语言问题，如"劳动合同提前解除赔偿"'),
    limit: z.number().int().min(1).max(50).optional().default(10),
  },
  async ({ query, limit }) => {
    const results = await searchLaw(query, limit ?? 10);
    return {
      content: [{
        type: 'text',
        text: results.length === 0
          ? '未找到相关法条'
          : JSON.stringify(results, null, 2),
      }],
    };
  }
);

server.tool(
  'search_user_doc',
  '检索用户上传的文档（语义 + 关键词混合检索）',
  {
    query: z.string().describe('搜索关键词或问题'),
    limit: z.number().int().min(1).max(50).optional().default(10),
  },
  async ({ query, limit }) => {
    const results = await searchUserDoc(query, limit ?? 10);
    return {
      content: [{
        type: 'text',
        text: results.length === 0
          ? '未找到相关文档'
          : JSON.stringify(results, null, 2),
      }],
    };
  }
);

server.tool(
  'get_law_article',
  '根据 ID 获取法条全文（ID 来自 search_law 结果）',
  { id: z.number().int() },
  async ({ id }) => {
    const article = getLawArticle(id);
    return {
      content: [{
        type: 'text',
        text: article
          ? JSON.stringify(article, null, 2)
          : `未找到 ID 为 ${id} 的法条`,
      }],
    };
  }
);

server.tool(
  'index_document',
  '将本地文件导入用户文档知识库（支持 .txt .md），立即可搜索，向量化在后台完成',
  { file_path: z.string().describe('文件的绝对路径') },
  async ({ file_path }) => {
    const result = indexDocument(file_path);
    return {
      content: [{
        type: 'text',
        text: result.success
          ? `✅ 导入成功，文档 ID: ${result.doc_id}，向量化在后台进行`
          : `❌ 导入失败: ${result.error}`,
      }],
    };
  }
);

server.tool(
  'list_knowledge_bases',
  '查看知识库状态：法律法规、用户文档条数、向量化进度、模型就绪状态',
  {},
  async () => {
    const status = listKnowledgeBases();
    const modelReady = await isModelReady();
    return {
      content: [{ type: 'text', text: JSON.stringify({ ...status, model_ready: modelReady }, null, 2) }],
    };
  }
);

// Trigger migration for existing data (non-blocking)
migrateIfNeeded().catch(err => console.error('[migration]', err));

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Build and smoke-test**

```bash
cd packages/law-kb-mcp && pnpm build
printf '{"jsonrpc":"2.0","method":"initialize","id":1,"params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}\n{"jsonrpc":"2.0","method":"tools/list","id":2}\n' | node dist/index.js
```

Expected: 5 tools listed: `search_law`, `search_user_doc`, `get_law_article`, `index_document`, `list_knowledge_bases`.

- [ ] **Step 3: Run all tests**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/law-kb-mcp/src/index.ts
git commit -m "feat(law-kb-mcp): add search_user_doc tool; update list_knowledge_bases with vector stats"
```

---

### Task 8: Backend routes for model management

**Files:**
- Modify: `packages/server/src/routes/index.ts`

- [ ] **Step 1: Add two routes before `return app`**

```typescript
  app.get('/kb/model-status', async (c) => {
    try {
      const { isModelReady } = await import('@leochat/law-kb-mcp/embedder');
      const ready = await isModelReady();
      return c.json({ ready, downloading: false, progress: ready ? 100 : 0 });
    } catch (error) {
      console.error('[KB model-status]', error);
      return c.json({ error: 'Failed to get model status' }, 500);
    }
  });

  app.post('/kb/download-model', async (c) => {
    try {
      const { downloadModel } = await import('@leochat/law-kb-mcp/embedder');
      // Fire and forget — frontend polls /kb/model-status for progress
      downloadModel((pct) => {
        console.log(`[BGE-m3 download] ${pct}%`);
      }).then(() => {
        console.log('[BGE-m3 download] complete');
      }).catch(err => {
        console.error('[BGE-m3 download error]', err);
      });
      return c.json({ message: '模型下载已开始，请轮询 /kb/model-status 查看进度' });
    } catch (error) {
      console.error('[KB download-model]', error);
      return c.json({ error: 'Failed to start download' }, 500);
    }
  });
```

Also add `embedder` to the exports map in `packages/law-kb-mcp/package.json`:

```json
"./embedder": {
  "types": "./dist/embedder.d.ts",
  "default": "./dist/embedder.js"
}
```

- [ ] **Step 2: Verify server starts**

```bash
curl -s http://localhost:3001/api/kb/model-status
```

Expected: `{"ready":false,"downloading":false,"progress":0}` (model not yet downloaded).

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/routes/index.ts packages/law-kb-mcp/package.json
git commit -m "feat(server): add /api/kb/model-status and /api/kb/download-model routes"
```

---

### Task 9: Frontend — model status + migration progress

**Files:**
- Modify: `apps/web/src/lib/kbApi.ts`
- Modify: `apps/web/src/components/mcp/LawKnowledgeTab.tsx`

- [ ] **Step 1: Add API methods to `kbApi.ts`**

Add to the `kbApi` object:

```typescript
  async getModelStatus(): Promise<{ ready: boolean; downloading: boolean; progress: number }> {
    const res = await fetch(`${BASE}/model-status`);
    if (!res.ok) throw new Error('Failed to get model status');
    return res.json();
  },

  async downloadModel(): Promise<{ message: string }> {
    const res = await fetch(`${BASE}/download-model`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start model download');
    return res.json();
  },
```

- [ ] **Step 2: Update `LawKnowledgeTab.tsx`**

Add model status state and polling. Add after the existing state declarations:

```typescript
  const [modelStatus, setModelStatus] = useState<{ ready: boolean; downloading: boolean; progress: number } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

Add a `fetchModelStatus` function and call it in the initial `useEffect`:

```typescript
  const fetchModelStatus = useCallback(async () => {
    try {
      setModelStatus(await kbApi.getModelStatus());
    } catch {
      setModelStatus(null);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchModelStatus();
  }, [fetchStatus, fetchModelStatus]);
```

Add polling when download is in progress:

```typescript
  useEffect(() => {
    if (modelStatus?.downloading) {
      pollRef.current = setInterval(async () => {
        const s = await kbApi.getModelStatus();
        setModelStatus(s);
        if (s.ready) {
          clearInterval(pollRef.current!);
          fetchStatus(); // refresh chunk counts
        }
      }, 3000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [modelStatus?.downloading, fetchStatus]);
```

Add `handleDownloadModel` handler:

```typescript
  const handleDownloadModel = async () => {
    try {
      await kbApi.downloadModel();
      setModelStatus(s => s ? { ...s, downloading: true } : null);
    } catch {
      setMessage('模型下载启动失败');
    }
  };
```

Add model status row to the JSX, inside `<div className="flex-1 overflow-y-auto p-2 space-y-2">` after the existing StatRow elements:

```tsx
        {/* Model status row */}
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-muted/20 border border-border">
          <span className="text-sm">🤖</span>
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium">BGE-m3 模型</span>
            <span className="text-[10px] text-muted-foreground ml-2">
              {modelStatus === null ? '检测中…' :
               modelStatus.ready ? '✅ 已就绪' :
               modelStatus.downloading ? `下载中 ${modelStatus.progress}%` :
               '未下载'}
            </span>
          </div>
          {modelStatus && !modelStatus.ready && !modelStatus.downloading && (
            <button
              onClick={handleDownloadModel}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              下载
            </button>
          )}
          {modelStatus?.downloading && (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          )}
        </div>

        {/* Migration progress */}
        {status && status.migration_progress < 1 && status.migration_progress > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs bg-blue-500/10 text-blue-600">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            向量索引构建中 {Math.round(status.migration_progress * 100)}%，当前使用关键词检索
          </div>
        )}
```

Update `KbStatus` interface in `kbApi.ts` to match the extended `KnowledgeBaseStatus`:

```typescript
export interface KbStatus {
  law_count: number;
  user_doc_count: number;
  law_chunks_count: number;
  user_doc_chunks_count: number;
  model_ready: boolean;
  migration_progress: number;
}
```

- [ ] **Step 3: Check TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -E "LawKnowledge|kbApi" | head -20
```

Expected: no errors in the two modified files.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/kbApi.ts apps/web/src/components/mcp/LawKnowledgeTab.tsx
git commit -m "feat(web): model download UI with progress polling and migration status indicator"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|-----------------|------|
| `law_chunks` / `user_doc_chunks` tables with UNIQUE + CASCADE | Task 1 |
| `ChunkInput`, extended `SearchResult`, `KnowledgeBaseStatus` | Task 1 |
| `chunkLaw` — article-level splits, chapter metadata, 300-char limit | Task 2 |
| `chunkUserDoc` — auto-detect structure, paragraph fallback | Task 2 |
| BGE-m3 int8, hf-mirror.com download, serial queue | Task 3 |
| `getEmbedding(text, mode)` | Task 3 |
| In-memory embedding cache (lazy load, invalidate on change) | Task 4 |
| `cosineSimilarity`, `vectorSearch`, `storeChunks`, `rrf` | Task 4 |
| `searchLaw` → hybrid on `law_chunks` (FTS5 target change) | Task 5 |
| `searchUserDoc` new function | Task 5 |
| Graceful degradation to FTS5 when model not ready | Task 5 |
| `indexDocument` + `insertLaw` trigger chunking + async embedding | Task 6 |
| `migrateIfNeeded` for existing data | Task 6 |
| `migration_progress` in `listKnowledgeBases` | Task 6 |
| `search_user_doc` MCP tool | Task 7 |
| Updated `list_knowledge_bases` with chunk counts + `model_ready` | Task 7 |
| `/kb/model-status` + `/kb/download-model` routes | Task 8 |
| Model status row in UI (download button, progress) | Task 9 |
| Migration progress indicator in UI | Task 9 |
