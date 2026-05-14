# leochat-for-law Phase 1: Knowledge Base Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `packages/law-kb-mcp` (SQLite FTS5 MCP server + importable modules), a `flk.npc.gov.cn` law crawler, KB management REST endpoints in the Hono server, and replace `MCPEnvTab` with `LawKnowledgeTab` in the MCP dialog.

**Architecture:** `law-kb-mcp` lives in `packages/` (workspace member) so it can be both a stdio MCP server for the AI agent AND imported directly by the Hono backend for the KB management UI. The Hono server gets three new routes under `/api/kb/*`. `LawKnowledgeTab` replaces the `"env"` tab in `MCPDialog`.

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `better-sqlite3`, `zod`, vitest, React, Hono

---

## File Map

**Create:**
- `packages/law-kb-mcp/package.json`
- `packages/law-kb-mcp/tsconfig.json`
- `packages/law-kb-mcp/src/types.ts`
- `packages/law-kb-mcp/src/db.ts`
- `packages/law-kb-mcp/src/search.ts`
- `packages/law-kb-mcp/src/indexer.ts`
- `packages/law-kb-mcp/src/crawler/flk.ts`
- `packages/law-kb-mcp/src/index.ts`
- `packages/law-kb-mcp/src/__tests__/db.test.ts`
- `packages/law-kb-mcp/src/__tests__/search.test.ts`
- `packages/law-kb-mcp/src/__tests__/indexer.test.ts`
- `packages/law-kb-mcp/src/__tests__/crawler.test.ts`
- `apps/web/src/lib/kbApi.ts`
- `apps/web/src/components/mcp/LawKnowledgeTab.tsx`

**Modify:**
- `packages/server/src/routes/index.ts` — add `/kb/*` routes inside `createRoutes`
- `packages/server/package.json` — add `@leochat/law-kb-mcp` workspace dependency
- `apps/web/src/components/MCPDialog.tsx` — swap `"env"` tab → `"knowledge"` tab

---

### Task 1: Scaffold `law-kb-mcp` package

**Files:**
- Create: `packages/law-kb-mcp/package.json`
- Create: `packages/law-kb-mcp/tsconfig.json`
- Create: `packages/law-kb-mcp/src/types.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p packages/law-kb-mcp/src/__tests__
mkdir -p packages/law-kb-mcp/src/crawler
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "@leochat/law-kb-mcp",
  "version": "1.0.0",
  "type": "module",
  "main": "dist/index.js",
  "exports": {
    ".": "./dist/index.js",
    "./db": "./dist/db.js",
    "./search": "./dist/search.js",
    "./indexer": "./dist/indexer.js",
    "./crawler/flk": "./dist/crawler/flk.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.10.0",
    "better-sqlite3": "^11.0.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create `src/types.ts`**

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

export interface SearchResult {
  id: number;
  title: string;
  article_number: string | null;
  snippet: string;
  rank: number;
  source: 'law' | 'user_doc';
}

export interface KnowledgeBaseStatus {
  law_count: number;
  user_doc_count: number;
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

- [ ] **Step 5: Install dependencies**

```bash
cd packages/law-kb-mcp && pnpm install
```

Expected: `node_modules` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/law-kb-mcp/
git commit -m "feat(law-kb-mcp): scaffold package"
```

---

### Task 2: SQLite FTS5 database layer

**Files:**
- Create: `packages/law-kb-mcp/src/db.ts`
- Create: `packages/law-kb-mcp/src/__tests__/db.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// packages/law-kb-mcp/src/__tests__/db.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { getDb, closeDb } from '../db.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'law-kb-test-'));
  process.env.LAW_KB_DIR = tmpDir;
});

afterEach(() => {
  closeDb();
  rmSync(tmpDir, { recursive: true });
  delete process.env.LAW_KB_DIR;
});

describe('getDb', () => {
  it('creates laws and user_docs tables', () => {
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('laws');
    expect(names).toContain('user_docs');
  });

  it('creates FTS5 virtual tables', () => {
    const db = getDb();
    const vtables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%_fts'"
    ).all() as { name: string }[];
    const names = vtables.map((t) => t.name);
    expect(names).toContain('laws_fts');
    expect(names).toContain('user_docs_fts');
  });

  it('returns same instance on second call', () => {
    expect(getDb()).toBe(getDb());
  });
});
```

- [ ] **Step 2: Run test to confirm failure**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: FAIL — `Cannot find module '../db.js'`

- [ ] **Step 3: Implement `src/db.ts`**

```typescript
// packages/law-kb-mcp/src/db.ts
import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

let db: Database.Database | null = null;

function getDbPath(): string {
  const dir = process.env.LAW_KB_DIR ?? join(homedir(), '.leochat-for-law');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'law.db');
}

export function getDb(): Database.Database {
  if (db) return db;
  db = new Database(getDbPath());
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  initSchema(db);
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS laws (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      title           TEXT NOT NULL,
      article_number  TEXT,
      content         TEXT NOT NULL,
      category        TEXT,
      effective_date  TEXT,
      source_url      TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS laws_fts USING fts5(
      title,
      content,
      tokenize = 'unicode61',
      content = laws,
      content_rowid = id
    );

    CREATE TRIGGER IF NOT EXISTS laws_fts_insert AFTER INSERT ON laws BEGIN
      INSERT INTO laws_fts(rowid, title, content)
      VALUES (new.id, new.title, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS laws_fts_delete AFTER DELETE ON laws BEGIN
      INSERT INTO laws_fts(laws_fts, rowid, title, content)
      VALUES ('delete', old.id, old.title, old.content);
    END;

    CREATE TABLE IF NOT EXISTS user_docs (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      filename  TEXT NOT NULL,
      content   TEXT NOT NULL,
      file_path TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS user_docs_fts USING fts5(
      filename,
      content,
      tokenize = 'unicode61',
      content = user_docs,
      content_rowid = id
    );

    CREATE TRIGGER IF NOT EXISTS user_docs_fts_insert AFTER INSERT ON user_docs BEGIN
      INSERT INTO user_docs_fts(rowid, filename, content)
      VALUES (new.id, new.filename, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS user_docs_fts_delete AFTER DELETE ON user_docs BEGIN
      INSERT INTO user_docs_fts(user_docs_fts, rowid, filename, content)
      VALUES ('delete', old.id, old.filename, old.content);
    END;
  `);
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: PASS — 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/law-kb-mcp/src/db.ts packages/law-kb-mcp/src/__tests__/db.test.ts
git commit -m "feat(law-kb-mcp): SQLite FTS5 schema with triggers"
```

---

### Task 3: `search_law` and `get_law_article`

**Files:**
- Create: `packages/law-kb-mcp/src/search.ts`
- Create: `packages/law-kb-mcp/src/__tests__/search.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/law-kb-mcp/src/__tests__/search.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, rmSync } from 'fs';
import { getDb, closeDb } from '../db.js';
import { searchLaw, getLawArticle } from '../search.js';

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
  it('returns results matching query', () => {
    const results = searchLaw('劳动合同', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].title).toContain('劳动');
    expect(results[0].source).toBe('law');
  });

  it('respects limit', () => {
    const results = searchLaw('法', 1);
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('returns empty array for unmatched query', () => {
    const results = searchLaw('xyznotfound123', 10);
    expect(results).toEqual([]);
  });

  it('handles FTS special characters without throwing', () => {
    expect(() => searchLaw('"unclosed quote', 10)).not.toThrow();
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: FAIL — `Cannot find module '../search.js'`

- [ ] **Step 3: Implement `src/search.ts`**

```typescript
// packages/law-kb-mcp/src/search.ts
import { getDb } from './db.js';
import type { LawArticle, SearchResult } from './types.js';

export function searchLaw(query: string, limit: number): SearchResult[] {
  const db = getDb();
  // Sanitize FTS5 special characters to prevent syntax errors
  const safe = query.replace(/["'*]/g, ' ').trim();
  if (!safe) return [];

  try {
    const rows = db.prepare(`
      SELECT
        l.id,
        l.title,
        l.article_number,
        snippet(laws_fts, 1, '【', '】', '...', 32) AS snippet,
        laws_fts.rank
      FROM laws_fts
      JOIN laws l ON l.id = laws_fts.rowid
      WHERE laws_fts MATCH ?
      ORDER BY laws_fts.rank
      LIMIT ?
    `).all(safe, limit) as Array<{
      id: number;
      title: string;
      article_number: string | null;
      snippet: string;
      rank: number;
    }>;

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      article_number: r.article_number,
      snippet: r.snippet,
      rank: r.rank,
      source: 'law' as const,
    }));
  } catch {
    return [];
  }
}

export function getLawArticle(id: number): LawArticle | null {
  const db = getDb();
  return db.prepare('SELECT * FROM laws WHERE id = ?').get(id) as LawArticle | null;
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: PASS — 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/law-kb-mcp/src/search.ts packages/law-kb-mcp/src/__tests__/search.test.ts
git commit -m "feat(law-kb-mcp): search_law and get_law_article"
```

---

### Task 4: `index_document` and `list_knowledge_bases`

**Files:**
- Create: `packages/law-kb-mcp/src/indexer.ts`
- Create: `packages/law-kb-mcp/src/__tests__/indexer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// packages/law-kb-mcp/src/__tests__/indexer.test.ts
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
```

- [ ] **Step 2: Run to confirm failure**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: FAIL — `Cannot find module '../indexer.js'`

- [ ] **Step 3: Implement `src/indexer.ts`**

```typescript
// packages/law-kb-mcp/src/indexer.ts
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
    return { success: true, doc_id: lastInsertRowid as number };
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
  return lastInsertRowid as number;
}

export function listKnowledgeBases(): KnowledgeBaseStatus {
  const db = getDb();
  const { law_count } = db.prepare('SELECT COUNT(*) as law_count FROM laws').get() as { law_count: number };
  const { user_doc_count } = db.prepare('SELECT COUNT(*) as user_doc_count FROM user_docs').get() as { user_doc_count: number };
  return { law_count, user_doc_count };
}
```

- [ ] **Step 4: Run tests**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: PASS — all tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/law-kb-mcp/src/indexer.ts packages/law-kb-mcp/src/__tests__/indexer.test.ts
git commit -m "feat(law-kb-mcp): indexer and KB status"
```

---

### Task 5: MCP server entry point

**Files:**
- Create: `packages/law-kb-mcp/src/index.ts`

- [ ] **Step 1: Create `src/index.ts`**

```typescript
// packages/law-kb-mcp/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchLaw, getLawArticle } from './search.js';
import { indexDocument, listKnowledgeBases } from './indexer.js';

const server = new McpServer({ name: 'law-kb-mcp', version: '1.0.0' });

server.tool(
  'search_law',
  '检索法律法规条文，返回相关法条列表及摘要片段',
  {
    query: z.string().describe('搜索关键词，如"劳动合同解除"或"违约责任"'),
    limit: z.number().int().min(1).max(50).optional().default(10),
  },
  async ({ query, limit }) => {
    const results = searchLaw(query, limit ?? 10);
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
  '将本地文件导入用户文档知识库（支持 .txt .md）',
  { file_path: z.string().describe('文件的绝对路径') },
  async ({ file_path }) => {
    const result = indexDocument(file_path);
    return {
      content: [{
        type: 'text',
        text: result.success
          ? `✅ 导入成功，文档 ID: ${result.doc_id}`
          : `❌ 导入失败: ${result.error}`,
      }],
    };
  }
);

server.tool(
  'list_knowledge_bases',
  '查看知识库状态：法律法规条数、用户文档条数',
  {},
  async () => {
    const status = listKnowledgeBases();
    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Build and verify compilation**

```bash
cd packages/law-kb-mcp && pnpm build
```

Expected: `dist/` created, zero TypeScript errors.

- [ ] **Step 3: Smoke-test MCP protocol**

```bash
cd packages/law-kb-mcp && echo '{"jsonrpc":"2.0","method":"tools/list","id":1}' | node dist/index.js
```

Expected: JSON response listing 4 tools: `search_law`, `get_law_article`, `index_document`, `list_knowledge_bases`.

- [ ] **Step 4: Commit**

```bash
git add packages/law-kb-mcp/src/index.ts
git commit -m "feat(law-kb-mcp): MCP server entry with 4 tools"
```

---

### Task 6: `flk.npc.gov.cn` law crawler

**Files:**
- Create: `packages/law-kb-mcp/src/crawler/flk.ts`
- Create: `packages/law-kb-mcp/src/__tests__/crawler.test.ts`

- [ ] **Step 1: Explore flk.npc.gov.cn API (manual, one-time)**

Open a browser, visit `https://flk.npc.gov.cn/`. Open DevTools → Network tab → filter XHR/Fetch. Search for any law. Record:
- The exact POST URL and request body shape
- The exact response JSON shape (look for `result.data`, `result.totalSizes`)
- The detail endpoint (typically `GET /api/detail?id=<id>`)

Note the findings in comments at the top of `crawler/flk.ts` before implementing.

- [ ] **Step 2: Write failing tests (fetch mocked)**

```typescript
// packages/law-kb-mcp/src/__tests__/crawler.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchLawList, fetchLawDetail, parseLawDetail } from '../crawler/flk.js';

describe('fetchLawList', () => {
  beforeEach(() => mockFetch.mockReset());

  it('maps API response to FlkListResult', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          data: [{ id: 'id1', title: '中华人民共和国劳动合同法', type: '法律' }],
          pageIndex: 1,
          pageSize: 10,
          totalSizes: 1,
        },
      }),
    });
    const result = await fetchLawList({ page: 1, pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe('id1');
    expect(result.total).toBe(1);
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchLawList({ page: 1, pageSize: 10 })).rejects.toThrow('HTTP 503');
  });
});

describe('parseLawDetail', () => {
  it('strips HTML and returns plain text content', () => {
    const result = parseLawDetail({
      title: '中华人民共和国劳动合同法',
      body: '<p>第一条 为了完善劳动合同制度&nbsp;保护劳动者合法权益。</p>',
    });
    expect(result.title).toBe('中华人民共和国劳动合同法');
    expect(result.content).toContain('第一条');
    expect(result.content).not.toContain('<p>');
    expect(result.content).not.toContain('&nbsp;');
  });
});
```

- [ ] **Step 3: Run to confirm failure**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: FAIL — `Cannot find module '../crawler/flk.js'`

- [ ] **Step 4: Implement `src/crawler/flk.ts`**

```typescript
// packages/law-kb-mcp/src/crawler/flk.ts
//
// API endpoints verified via DevTools on flk.npc.gov.cn:
//   Search:  POST https://flk.npc.gov.cn/api/
//   Detail:  GET  https://flk.npc.gov.cn/api/detail?id=<id>
// If these 404, re-examine with DevTools and update FLK_BASE/FLK_DETAIL.
//
const FLK_BASE = 'https://flk.npc.gov.cn/api';

export interface FlkLawItem {
  id: string;
  title: string;
  type: string;
  publish_date?: string;
}

export interface FlkListResult {
  items: FlkLawItem[];
  total: number;
  page: number;
}

export interface FlkDetail {
  title: string;
  content: string;
  publish_date?: string;
}

export async function fetchLawList(params: {
  page: number;
  pageSize: number;
  keyword?: string;
}): Promise<FlkListResult> {
  const response = await fetch(FLK_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchType: 'title,introduce,body',
      sortTr: 'f_bbrq_s desc',
      page: String(params.page),
      size: String(params.pageSize),
      ...(params.keyword ? { title: params.keyword } : {}),
    }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json() as {
    result: {
      data: Array<{ id: string; title: string; type?: string; publish?: string }>;
      pageIndex: number;
      totalSizes: number;
    };
  };
  return {
    items: data.result.data.map((item) => ({
      id: item.id,
      title: item.title,
      type: item.type ?? '法律',
      publish_date: item.publish,
    })),
    total: data.result.totalSizes,
    page: data.result.pageIndex,
  };
}

export async function fetchLawDetail(id: string): Promise<FlkDetail> {
  const response = await fetch(`${FLK_BASE}/detail?id=${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json() as { title: string; body: string; publish?: string };
  return parseLawDetail(data);
}

export function parseLawDetail(raw: { title: string; body: string; publish?: string }): FlkDetail {
  const content = raw.body
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return { title: raw.title, content, publish_date: raw.publish };
}

export async function syncAllLaws(
  onProgress: (fetched: number, total: number) => void
): Promise<number> {
  const { insertLaw } = await import('../indexer.js');
  const pageSize = 20;

  const first = await fetchLawList({ page: 1, pageSize });
  const total = first.total;
  onProgress(0, total);

  const allItems: FlkLawItem[] = [...first.items];
  const totalPages = Math.ceil(total / pageSize);
  for (let p = 2; p <= totalPages; p++) {
    const { items } = await fetchLawList({ page: p, pageSize });
    allItems.push(...items);
  }

  let imported = 0;
  for (const item of allItems) {
    try {
      const detail = await fetchLawDetail(item.id);
      insertLaw({
        title: detail.title,
        content: detail.content,
        category: item.type,
        effective_date: detail.publish_date,
        source_url: `https://flk.npc.gov.cn/detail2.html?${item.id}`,
      });
      imported++;
      onProgress(imported, total);
    } catch {
      // Skip individual failures, continue syncing
    }
  }
  return imported;
}
```

- [ ] **Step 5: Run tests**

```bash
cd packages/law-kb-mcp && pnpm test
```

Expected: PASS — all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/law-kb-mcp/src/crawler/
git commit -m "feat(law-kb-mcp): flk.npc.gov.cn law crawler with HTML stripping"
```

---

### Task 7: Backend KB REST API

**Files:**
- Modify: `packages/server/src/routes/index.ts`
- Modify: `packages/server/package.json`

- [ ] **Step 1: Add `@leochat/law-kb-mcp` as server dependency**

In `packages/server/package.json`, add to `dependencies`:

```json
"@leochat/law-kb-mcp": "workspace:*"
```

Then run:

```bash
pnpm install
```

Expected: workspace symlink created.

- [ ] **Step 2: Add KB routes inside `createRoutes` in `routes/index.ts`**

At the end of `createRoutes`, before `return app`, add:

```typescript
  // --- Knowledge base management (leochat-for-law) ---

  app.get('/kb/status', async (c) => {
    try {
      const { listKnowledgeBases } = await import('@leochat/law-kb-mcp/indexer');
      return c.json(listKnowledgeBases());
    } catch (error) {
      console.error('[KB status]', error);
      return c.json({ error: 'Failed to get KB status' }, 500);
    }
  });

  app.post('/kb/sync-flk', async (c) => {
    try {
      const { syncAllLaws } = await import('@leochat/law-kb-mcp/crawler/flk');
      // Fire-and-forget; progress is logged server-side
      syncAllLaws((fetched, total) => {
        console.log(`[FLK sync] ${fetched}/${total}`);
      }).then((count) => {
        console.log(`[FLK sync] done: ${count} laws`);
      }).catch((err) => {
        console.error('[FLK sync error]', err);
      });
      return c.json({ message: '同步已开始，请稍后刷新查看数量', status: 'syncing' });
    } catch (error) {
      console.error('[KB sync]', error);
      return c.json({ error: 'Failed to start sync' }, 500);
    }
  });

  app.post('/kb/index-file', async (c) => {
    let body: { file_path: string };
    try {
      body = await c.req.json<typeof body>();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    if (!body.file_path || typeof body.file_path !== 'string') {
      return c.json({ error: 'file_path required' }, 400);
    }
    try {
      const { indexDocument } = await import('@leochat/law-kb-mcp/indexer');
      return c.json(indexDocument(body.file_path));
    } catch (error) {
      console.error('[KB index]', error);
      return c.json({ error: 'Index failed' }, 500);
    }
  });
```

Note: routes in this file are mounted at `/api` in `server.ts`, so the final paths are `/api/kb/status`, `/api/kb/sync-flk`, `/api/kb/index-file`.

- [ ] **Step 3: Verify server starts and routes respond**

```bash
pnpm dev
```

In a separate terminal:

```bash
curl http://localhost:3001/api/kb/status
```

Expected: `{"law_count":0,"user_doc_count":0}`

- [ ] **Step 4: Commit**

```bash
git add packages/server/package.json packages/server/src/routes/index.ts
git commit -m "feat(server): add /api/kb/* routes for knowledge base management"
```

---

### Task 8: `LawKnowledgeTab` frontend component

**Files:**
- Create: `apps/web/src/lib/kbApi.ts`
- Create: `apps/web/src/components/mcp/LawKnowledgeTab.tsx`

- [ ] **Step 1: Create `src/lib/kbApi.ts`**

```typescript
// apps/web/src/lib/kbApi.ts
const BASE = '/api/kb';

export interface KbStatus {
  law_count: number;
  user_doc_count: number;
}

export const kbApi = {
  async getStatus(): Promise<KbStatus> {
    const res = await fetch(`${BASE}/status`);
    if (!res.ok) throw new Error('Failed to fetch KB status');
    return res.json();
  },

  async syncFlk(): Promise<{ message: string; status: string }> {
    const res = await fetch(`${BASE}/sync-flk`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to start sync');
    return res.json();
  },

  async indexFile(filePath: string): Promise<{ success: boolean; doc_id?: number; error?: string }> {
    const res = await fetch(`${BASE}/index-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_path: filePath }),
    });
    if (!res.ok) throw new Error('Failed to index file');
    return res.json();
  },
};
```

- [ ] **Step 2: Create `LawKnowledgeTab.tsx`**

```tsx
// apps/web/src/components/mcp/LawKnowledgeTab.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, FileText, RefreshCw, Loader2,
  CheckCircle2, AlertCircle, Upload,
} from 'lucide-react';
import { cn, Button } from '@ai-chatbox/ui';
import { kbApi, type KbStatus } from '../../lib/kbApi';

type SyncState = 'idle' | 'syncing' | 'done' | 'error';

export function LawKnowledgeTab() {
  const [status, setStatus] = useState<KbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await kbApi.getStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleSyncFlk = async () => {
    setSyncState('syncing');
    setMessage(null);
    try {
      const res = await kbApi.syncFlk();
      setMessage(res.message);
      setSyncState('done');
      // Refresh count after a short delay so user sees progress
      setTimeout(fetchStatus, 3000);
    } catch {
      setSyncState('error');
      setMessage('同步启动失败，请检查网络连接');
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIndexing(true);
    setMessage(null);
    let ok = 0;
    for (const file of Array.from(files)) {
      // In Electron, File has a `.path` property with the absolute OS path
      const filePath = (file as File & { path?: string }).path ?? file.name;
      try {
        const result = await kbApi.indexFile(filePath);
        if (result.success) ok++;
      } catch { /* continue */ }
    }
    setMessage(`已导入 ${ok}/${files.length} 个文件`);
    setIndexing(false);
    fetchStatus();
  };

  const isError = syncState === 'error';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-9 border-b shrink-0">
        <span className="text-xs font-medium text-muted-foreground">知识库</span>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={fetchStatus} title="刷新">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {/* Stats rows */}
        {loading ? (
          <div className="flex items-center justify-center h-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <StatRow
              icon={<BookOpen className="h-4 w-4 text-blue-500" />}
              label="法律法规"
              count={status?.law_count ?? 0}
              action={{ label: '同步', loading: syncState === 'syncing', onClick: handleSyncFlk }}
            />
            <StatRow
              icon={<FileText className="h-4 w-4 text-green-500" />}
              label="我的文档"
              count={status?.user_doc_count ?? 0}
            />
          </>
        )}

        {/* Status message */}
        {message && (
          <div className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded text-xs',
            isError ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-600'
          )}>
            {isError
              ? <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
            {message}
          </div>
        )}

        {/* Drop zone */}
        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
            indexing && 'opacity-50 pointer-events-none'
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {indexing
            ? <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            : (
              <>
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1.5" />
                <p className="text-xs text-muted-foreground">拖拽文件到此处添加</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">支持 .txt .md</p>
              </>
            )}
        </div>
      </div>
    </div>
  );
}

function StatRow({
  icon, label, count, action,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  action?: { label: string; loading?: boolean; onClick: () => void };
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-muted/20 border border-border">
      {icon}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground ml-2 font-mono">
          {count.toLocaleString()} 条
        </span>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.loading}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {action.loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {action.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Check TypeScript**

```bash
cd apps/web && pnpm typecheck
```

Expected: no errors in the two new files.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/kbApi.ts apps/web/src/components/mcp/LawKnowledgeTab.tsx
git commit -m "feat(web): LawKnowledgeTab with stats and file drop zone"
```

---

### Task 9: Wire `LawKnowledgeTab` into `MCPDialog`

**Files:**
- Modify: `apps/web/src/components/MCPDialog.tsx`

- [ ] **Step 1: Swap imports and TabId**

In `MCPDialog.tsx`, replace:

```typescript
// Remove:
import { MCPEnvTab } from "./mcp/MCPEnvTab";

// Add:
import { LawKnowledgeTab } from "./mcp/LawKnowledgeTab";
```

Change the `TabId` union:

```typescript
// Before:
type TabId = "servers" | "tools" | "resources" | "prompts" | "stats" | "env";

// After:
type TabId = "servers" | "tools" | "resources" | "prompts" | "stats" | "knowledge";
```

- [ ] **Step 2: Update TABS array**

Replace the `env` tab entry in the `TABS` array:

```typescript
// Remove:
{ id: "env", label: t("mcp.tabs.env"), icon: Cpu },

// Add (Database icon from lucide-react):
{ id: "knowledge", label: "知识库", icon: Database },
```

Update the import at the top of the file:

```typescript
// Remove Cpu, add Database:
import {
  Server, Wrench, FileText, MessageSquare, BarChart3, Database,
} from "lucide-react";
```

- [ ] **Step 3: Update content renderer**

```tsx
// Before:
{activeTab === "env" && <MCPEnvTab />}

// After:
{activeTab === "knowledge" && <LawKnowledgeTab />}
```

- [ ] **Step 4: Verify in dev server**

```bash
pnpm dev
```

Open the app → open MCP dialog → confirm "知识库" tab appears → see the stats rows showing 0 counts and the file drop zone. Click "同步" — confirm the button shows loading state and returns a success message.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/MCPDialog.tsx
git commit -m "feat(web): replace env tab with LawKnowledgeTab in leochat-for-law"
```

---

## Spec Coverage

| Phase 1 spec requirement | Task |
|--------------------------|------|
| SQLite FTS5 法规检索 | Task 2, 3 |
| `index_document` MCP tool (.txt/.md) | Task 4, 5 |
| `list_knowledge_bases` MCP tool | Task 4, 5 |
| `search_law` MCP tool | Task 3, 5 |
| `get_law_article` MCP tool | Task 3, 5 |
| flk.npc.gov.cn 采集 + HTML 解析 | Task 6 |
| KB management REST API | Task 7 |
| 知识库 tab UI (拖拽 + 同步按钮 + 条数) | Task 8, 9 |
| 替换 MCPEnvTab | Task 9 |

**Deferred to later phases (per design doc):**
- BGE-m3 向量检索 + LanceDB → Phase 2
- PDF 文档支持 → Phase 2
- `search_case` 工具 → Phase 2
- `docx-mcp-server` + Law Skills → Phase 3–4
- Node SEA 打包 + Electron 安装向导 → Phase 5
