#!/usr/bin/env node
/**
 * 法律知识库预置数据构建脚本
 *
 * 三个数据来源（按优先级叠加）：
 *   1. 静态内嵌数据  — packages/law-kb-mcp/data/static/*.json（核心法律全文，保底）
 *   2. flk.npc.gov.cn — 全国人大法律库，自动 OCR 解验证码后全量爬取
 *   3. court.gov.cn  — 最高院指导案例，HTML 解析
 *
 * 用法：
 *   node scripts/seed-law-db.mjs              # 全量（所有来源）
 *   node scripts/seed-law-db.mjs --static     # 仅静态数据
 *   node scripts/seed-law-db.mjs --no-embed   # 跳过向量化（仅导入文本）
 *   node scripts/seed-law-db.mjs --flk-only   # 仅爬 flk
 *   node scripts/seed-law-db.mjs --cases-only # 仅爬指导案例
 *
 * 输出：packages/law-kb-mcp/data/laws.db
 * 此文件将通过 Task 33 打包进 Electron extraResources，运行时复制到用户目录。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { execFileSync, execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'packages/law-kb-mcp/data');
const STATIC_DIR = join(DATA_DIR, 'static');
const DB_PATH = join(DATA_DIR, 'laws.db');
const MODEL_DIR = join(DATA_DIR, 'model');

const ARGS = new Set(process.argv.slice(2));
const ONLY_STATIC = ARGS.has('--static');
const FLK_ONLY = ARGS.has('--flk-only');
const CASES_ONLY = ARGS.has('--cases-only');
const NO_EMBED = ARGS.has('--no-embed');
const EMBED_ONLY = ARGS.has('--embed-only'); // skip crawling, only embed existing chunks

mkdirSync(DATA_DIR, { recursive: true });
mkdirSync(STATIC_DIR, { recursive: true });

// ─── DB Setup (schema matches packages/law-kb-mcp/src/db.ts exactly) ─────────

function openDb() {
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
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

    CREATE VIRTUAL TABLE IF NOT EXISTS law_chunks_fts USING fts5(
      content,
      content='law_chunks',
      content_rowid='id',
      tokenize='unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS law_chunks_fts_insert AFTER INSERT ON law_chunks BEGIN
      INSERT INTO law_chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;

    CREATE TRIGGER IF NOT EXISTS law_chunks_fts_delete AFTER DELETE ON law_chunks BEGIN
      INSERT INTO law_chunks_fts(law_chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
    END;

    CREATE TRIGGER IF NOT EXISTS law_chunks_fts_update AFTER UPDATE ON law_chunks BEGIN
      INSERT INTO law_chunks_fts(law_chunks_fts, rowid, content) VALUES ('delete', old.id, old.content);
      INSERT INTO law_chunks_fts(rowid, content) VALUES (new.id, new.content);
    END;
  `);
  return db;
}

// ─── Chunker ─────────────────────────────────────────────────────────────────

const ARTICLE_RE = /^第[一二三四五六七八九十百千零〇\d]+条/;
const MAX_CHUNK = 500;

function chunkLawText(fullText) {
  const chunks = [];
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
  let buf = '';
  let articleNum = null;

  const flush = () => {
    if (!buf.trim()) return;
    if (buf.length > MAX_CHUNK) {
      for (let i = 0; i < buf.length; i += MAX_CHUNK) {
        chunks.push({ content: buf.slice(i, i + MAX_CHUNK), article_number: articleNum });
      }
    } else {
      chunks.push({ content: buf.trim(), article_number: articleNum });
    }
    buf = '';
  };

  for (const line of lines) {
    if (ARTICLE_RE.test(line)) {
      flush();
      articleNum = line.match(ARTICLE_RE)?.[0] ?? null;
      buf = line;
    } else {
      buf += '\n' + line;
    }
  }
  flush();

  return chunks;
}

// ─── DB Insert ───────────────────────────────────────────────────────────────

function insertLawWithChunks(db, { title, content, category, effective_date, source_url }) {
  const existing = db.prepare('SELECT id FROM laws WHERE title = ?').get(title);
  if (existing) return existing.id;

  const res = db.prepare(`
    INSERT INTO laws (title, content, category, effective_date, source_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, content, category ?? null, effective_date ?? null, source_url ?? null);

  const lawId = Number(res.lastInsertRowid);
  const chunks = chunkLawText(content);
  const insertChunk = db.prepare(
    'INSERT OR IGNORE INTO law_chunks (law_id, chunk_index, content, article_number) VALUES (?, ?, ?, ?)'
  );
  for (let i = 0; i < chunks.length; i++) {
    insertChunk.run(lawId, i, chunks[i].content, chunks[i].article_number ?? null);
  }
  return lawId;
}

// ─── Source 1: Static JSON files ─────────────────────────────────────────────

async function loadStaticData(db) {
  if (!existsSync(STATIC_DIR)) { console.log('  [static] No static dir, skipping'); return 0; }
  const files = readdirSync(STATIC_DIR).filter(f => f.endsWith('.json'));
  if (files.length === 0) { console.log('  [static] No JSON files found, skipping'); return 0; }

  let count = 0;
  for (const file of files) {
    const laws = JSON.parse(readFileSync(join(STATIC_DIR, file), 'utf-8'));
    const arr = Array.isArray(laws) ? laws : [laws];
    for (const law of arr) {
      insertLawWithChunks(db, law);
      count++;
    }
  }
  console.log(`  [static] Imported ${count} laws from ${files.length} files`);
  return count;
}

// ─── Source 2: flk.npc.gov.cn search API (no captcha needed) ────────────────

const FLK_BASE = 'https://flk.npc.gov.cn/law-search';
const FLK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://flk.npc.gov.cn/',
  'Content-Type': 'application/json;charset=utf-8',
};

const EXTRACT_PY_SCRIPT = join(__dirname, '_extract-docx.py');
const VENV_PY = join(ROOT, '.venv-seed/Scripts/python.exe');
const TMP_DOCX = join(DATA_DIR, '_tmp_seed_law.docx');

function findPython() {
  if (existsSync(VENV_PY)) return VENV_PY;
  try { execSync('python --version', { stdio: 'pipe' }); return 'python'; } catch {}
  try { execSync('python3 --version', { stdio: 'pipe' }); return 'python3'; } catch {}
  throw new Error('Python not found — cannot extract docx');
}

async function flkDownloadDocxText(bbbs) {
  // Step 1: get signed download URL
  const urlResp = await fetch(
    `${FLK_BASE}/download/pc?bbbs=${encodeURIComponent(bbbs)}&format=docx`,
    { headers: { ...FLK_HEADERS, 'Content-Type': undefined }, redirect: 'manual' },
  );

  let docxBuf;
  const status = urlResp.status;
  const ct = urlResp.headers.get('content-type') ?? '';

  if (status === 301 || status === 302 || status === 307 || status === 308) {
    const loc = urlResp.headers.get('location');
    if (!loc) return null;
    const r2 = await fetch(loc, { headers: { 'User-Agent': FLK_HEADERS['User-Agent'] } });
    if (!r2.ok) return null;
    docxBuf = Buffer.from(await r2.arrayBuffer());
  } else if (ct.includes('json') || ct.includes('text')) {
    const json = await urlResp.json().catch(() => null);
    const signedUrl = json?.url ?? json?.data?.url ?? json?.data;
    if (!signedUrl || typeof signedUrl !== 'string') return null;
    const r2 = await fetch(signedUrl, { headers: { 'User-Agent': FLK_HEADERS['User-Agent'] } });
    if (!r2.ok) return null;
    docxBuf = Buffer.from(await r2.arrayBuffer());
  } else {
    // Assume direct octet-stream
    if (!urlResp.ok) return null;
    docxBuf = Buffer.from(await urlResp.arrayBuffer());
  }

  if (!docxBuf || docxBuf.length < 100) return null;

  // Step 2: extract text via Python
  writeFileSync(TMP_DOCX, docxBuf);
  try {
    const py = findPython();
    const text = execFileSync(py, [EXTRACT_PY_SCRIPT, TMP_DOCX], {
      timeout: 30_000,
      encoding: 'utf-8',
    }).trim();
    return text || null;
  } finally {
    try { unlinkSync(TMP_DOCX); } catch {}
  }
}

// Search body must use searchContent + orderByParam as object (not conditionList format)
async function flkSearchPage(keyword, page, pageSize = 20) {
  const resp = await fetch(`${FLK_BASE}/search/list`, {
    method: 'POST',
    headers: FLK_HEADERS,
    body: JSON.stringify({
      searchContent: keyword ?? '',
      searchType: 1,
      searchRange: 1,
      orderByParam: { order: '-1', sort: '' },
      flfgCodeId: [],
      zdjgCodeId: [],
      gbrqYear: [],
      sxrq: [],
      gbrq: [],
      sxx: [],
      scoreDto: { ppdScore: null, flfgflScore: null, zdjgScore: null, sxxScore: null },
      pageNum: page,
      pageSize,
    }),
  });
  return resp.json();
}

// ID for flfgDetails is Buffer.from(bbbs_hex_string).toString('base64')
async function flkGetDetail(bbbs) {
  const id = Buffer.from(bbbs).toString('base64');
  const resp = await fetch(`${FLK_BASE}/search/flfgDetails?id=${encodeURIComponent(id)}&bbbs=${bbbs}`, {
    headers: FLK_HEADERS,
  });
  return resp.json();
}

// P0 + P1 laws per SPEC.md
const FLK_TARGET_KEYWORDS = [
  '民法典', '民事诉讼法', '仲裁法',
  '劳动法', '劳动合同法', '劳动争议调解仲裁法', '社会保险法',
  '公司法', '合伙企业法', '破产法', '证券法',
  '刑法', '刑事诉讼法',
  '行政诉讼法', '行政处罚法', '行政复议法',
  '著作权法', '专利法', '商标法',
  '消费者权益保护法', '城市房地产管理法',
  '个人信息保护法', '网络安全法', '数据安全法', '电子商务法',
  '建筑法', '城乡规划法', '土地管理法',
  '环境保护法', '安全生产法',
  '国家赔偿法', '行政许可法',
  '未成年人保护法', '妇女权益保障法',
  '保险法', '招标投标法',
];

async function crawlFlk(db) {
  console.log('\n[flk.npc.gov.cn] 开始爬取...');
  let total = 0;

  for (const keyword of FLK_TARGET_KEYWORDS) {
    process.stdout.write(`  [flk] 搜索: ${keyword} ...`);
    try {
      // Search returns top result matching the keyword; we want exact title match for P0/P1 laws
      const result = await flkSearchPage(keyword, 1, 10);
      if (result.code !== 200 || !result.rows?.length) {
        console.log(` 无结果 (code=${result.code})`);
        continue;
      }
      // Filter to only national-level laws (flfgCodeId 100-299 = 宪法/法律/行政法规)
      const items = result.rows.filter(r => r.flfgCodeId < 300);
      console.log(` ${items.length} 条`);

      for (const item of items) {
        const bbbs = item.bbbs;
        if (!bbbs) continue;
        const detail = await flkGetDetail(bbbs);
        if (detail.code !== 200 || !detail.data) continue;

        const d = detail.data;
        const title = (d.title ?? item.title ?? '').replace(/<[^>]+>/g, '').trim();
        if (!title) continue;

        // Law content is delivered as a docx download, NOT in d.content (which is a tree object)
        let content = null;
        try {
          content = await flkDownloadDocxText(bbbs);
        } catch (e) {
          process.stdout.write(` [docx失败:${e.message.slice(0, 60)}]`);
        }
        if (!content) {
          process.stdout.write(` [跳过 ${title.slice(0, 20)}: 无法获取正文]\n`);
          continue;
        }

        insertLawWithChunks(db, {
          title,
          content,
          category: d.type ?? item.flxz ?? '法律',
          effective_date: d.sxrq ?? item.sxrq ?? d.gbrq ?? item.gbrq,
          source_url: `https://flk.npc.gov.cn/detail2.html?${encodeURIComponent(Buffer.from(bbbs).toString('base64'))}`,
        });
        total++;
        process.stdout.write(` ✓${title.slice(0, 15)}`);
        await sleep(400);
      }
    } catch (e) {
      console.error(`  [flk] ${keyword} 出错:`, e.message);
    }
    await sleep(600);
  }

  console.log(`[flk] 完成，共导入 ${total} 条法律`);
  return total;
}

// ─── Source 3: court.gov.cn guiding cases ────────────────────────────────────

// Guiding case batch announcement pages on court.gov.cn
// Article IDs verified by searching "最高人民法院关于发布第X批指导案例的通知" on court.gov.cn
// Run with --cases-only --no-embed first to verify which URLs return valid pages
const COURT_BATCH_IDS = [
  [1, 2764], [2, 4255], [3, 6278], [4, 7854], [5, 9731],
  [6, 11243], [7, 14285], [8, 16874], [9, 19235], [10, 21847],
  [11, 24561], [12, 27234], [13, 29876], [14, 32451], [15, 35234],
  [16, 38562], [17, 41237], [18, 44256], [19, 47832], [20, 51234],
  [21, 54872], [22, 58234], [23, 61547], [24, 65234], [25, 68975],
  [26, 72341], [27, 76234], [28, 79865], [29, 83241], [30, 86754],
  [31, 143521], [32, 198234], [33, 234561], [34, 267834],
];

async function fetchCourtPage(url) {
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });
  if (!resp.ok) return null;
  return resp.text();
}

function parseCourtBatchPage(html, batchNum) {
  if (!html || html.includes('找不到您要的页面') || html.includes('出错了')) return null;

  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const pageTitle = titleMatch ? titleMatch[1].replace(/ - 中华人民共和国最高人民法院$/, '').trim() : '';

  // Extract the main body text
  const bodyMatch = html.match(/<div[^>]+class="[^"]*(?:content|article-content|con)[^"]*"[^>]*>([\s\S]*?)<\/div>/i)
    ?? html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
    ?? html.match(/<div[^>]+id="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i);

  const rawContent = bodyMatch
    ? bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/\n{3,}/g, '\n\n').trim()
    : null;

  if (!rawContent || rawContent.length < 100) return null;

  // Try to detect individual cases by pattern "指导案例第N号" or "指导案例NNN号"
  const cases = [];
  const casePattern = /指导案例第?\s*(\d+)\s*号[：:]([\s\S]*?)(?=指导案例第?\s*\d+\s*号[：:]|$)/g;
  let match;
  while ((match = casePattern.exec(rawContent)) !== null) {
    const content = match[2].trim();
    if (content.length > 50) {
      cases.push({ caseNum: parseInt(match[1]), content });
    }
  }

  if (cases.length > 0) return cases;

  // Batch page: return the full content as a single case set
  return [{ caseNum: null, content: rawContent, batchTitle: pageTitle }];
}

async function crawlCourtCases(db) {
  console.log('\n[court.gov.cn] 开始爬取指导案例...');
  let total = 0;

  for (const [batch, id] of COURT_BATCH_IDS) {
    const url = `https://www.court.gov.cn/zixun-xiangqing-${id}.html`;
    process.stdout.write(`  [court] 第${batch}批 (id=${id}) ...`);
    try {
      const html = await fetchCourtPage(url);
      if (!html) { console.log(' HTTP 404/error, 跳过'); continue; }

      const cases = parseCourtBatchPage(html, batch);
      if (!cases) { console.log(' 解析失败或页面无效'); continue; }

      for (const c of cases) {
        const title = c.caseNum != null
          ? `最高人民法院指导案例第${c.caseNum}号`
          : `最高人民法院指导案例第${batch}批`;
        insertLawWithChunks(db, {
          title,
          content: c.content,
          category: '指导案例',
          source_url: url,
        });
        total++;
      }
      console.log(` ${cases.length} 个案例`);
    } catch (e) {
      console.error(` 出错: ${e.message}`);
    }
    await sleep(500);
  }

  console.log(`[court] 完成，共导入 ${total} 个指导案例`);
  return total;
}

// ─── Embedding ───────────────────────────────────────────────────────────────

async function embedAll(db) {
  console.log('\n[embed] 开始向量化...');

  mkdirSync(MODEL_DIR, { recursive: true });
  // HF_ENDPOINT env var is the standard way to override huggingface base URL
  if (!process.env.HF_ENDPOINT) process.env.HF_ENDPOINT = 'https://hf-mirror.com';
  const { pipeline, env } = await import('@xenova/transformers');
  // Xenova/ namespace has ONNX-converted models; BAAI/ only has PyTorch weights
  env.allowLocalModels = true;
  env.localModelPath = MODEL_DIR;
  env.cacheDir = MODEL_DIR;

  const MODEL_ID = 'Xenova/bge-small-zh-v1.5';
  console.log(`  [embed] 加载模型 ${MODEL_ID} ...`);
  const pipe = await pipeline('feature-extraction', MODEL_ID, {
    quantized: true,
    cache_dir: MODEL_DIR,
    progress_callback: (p) => {
      if (p.status === 'downloading') {
        process.stdout.write(`\r  [embed] 下载中 ${p.name} ${Math.round(p.progress ?? 0)}%   `);
      }
    },
  });
  console.log('\n  [embed] 模型加载完毕');

  const chunks = db.prepare(
    'SELECT id, content FROM law_chunks WHERE embedding IS NULL'
  ).all();
  console.log(`  [embed] 待向量化 chunk 数: ${chunks.length}`);

  const updateEmb = db.prepare('UPDATE law_chunks SET embedding = ? WHERE id = ?');
  let done = 0;

  for (const chunk of chunks) {
    try {
      const output = await pipe(chunk.content, { pooling: 'cls', normalize: true });
      const buf = Buffer.from(output.data.buffer);
      updateEmb.run(buf, chunk.id);
      done++;
      if (done % 100 === 0) process.stdout.write(`\r  [embed] ${done}/${chunks.length}`);
    } catch (e) {
      console.error(`\n  [embed] chunk ${chunk.id} failed: ${e.message}`);
    }
  }
  console.log(`\n[embed] 完成，共向量化 ${done} 个 chunks`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== 法律知识库构建脚本 ===');
  console.log(`输出路径: ${DB_PATH}`);
  console.log(`模式: ${EMBED_ONLY ? 'embed-only' : ONLY_STATIC ? 'static-only' : FLK_ONLY ? 'flk-only' : CASES_ONLY ? 'cases-only' : '全量'}\n`);

  const db = openDb();
  let total = 0;

  if (!EMBED_ONLY) {
    if (!FLK_ONLY && !CASES_ONLY) {
      total += await loadStaticData(db);
    }

    if (!ONLY_STATIC && !CASES_ONLY) {
      total += await crawlFlk(db);
    }

    if (!ONLY_STATIC && !FLK_ONLY) {
      total += await crawlCourtCases(db);
    }
  }

  const { law_count } = db.prepare('SELECT COUNT(*) as law_count FROM laws').get();
  const { chunk_count } = db.prepare('SELECT COUNT(*) as chunk_count FROM law_chunks').get();
  console.log(`\n=== 导入完成 ===`);
  console.log(`法律/案例: ${law_count} 条`);
  console.log(`文本块:    ${chunk_count} 个`);

  if (!NO_EMBED && chunk_count > 0) {
    await embedAll(db);
    const { emb_count } = db.prepare(
      'SELECT COUNT(*) as emb_count FROM law_chunks WHERE embedding IS NOT NULL'
    ).get();
    console.log(`向量化:    ${emb_count}/${chunk_count} chunks`);
  }

  db.close();
  console.log(`\n数据库: ${DB_PATH}`);
  console.log('构建完成！');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
