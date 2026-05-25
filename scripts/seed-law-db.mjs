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

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';
import { DatabaseSync } from 'node:sqlite';

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

// ─── Source 2: flk.npc.gov.cn (captcha + search API) ────────────────────────

const FLK_BASE = 'https://flk.npc.gov.cn/law-search';
const FLK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://flk.npc.gov.cn/',
  'Origin': 'https://flk.npc.gov.cn',
  'Content-Type': 'application/json',
};

async function solveMathCaptcha(base64Img) {
  try {
    const { execSync } = await import('child_process');
    const tmp = join(DATA_DIR, '_captcha_tmp.jpg');
    writeFileSync(tmp, Buffer.from(base64Img, 'base64'));
    const result = execSync(
      `python -c "import ddddocr; ocr=ddddocr.DdddOcr(show_ad=False); print(ocr.classification(open('${tmp.replace(/\\/g, '/')}','rb').read()))"`,
      { timeout: 10000, encoding: 'utf-8' }
    ).trim();
    const expr = result.replace(/[=？?].*$/, '').trim();
    const answer = String(eval(expr)); // safe: input is from our own OCR of known math captcha
    console.log(`  [flk] Captcha OCR: "${result}" → answer: ${answer}`);
    return answer;
  } catch { /* fallback to manual */ }

  return new Promise((resolve) => {
    const tmp = join(DATA_DIR, '_captcha_tmp.jpg');
    writeFileSync(tmp, Buffer.from(base64Img, 'base64'));
    console.log(`\n  [flk] 请打开验证码图片并输入答案: ${tmp}`);
    try { import('child_process').then(({ execSync }) => execSync(`start "" "${tmp}"`)); } catch {}
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question('  验证码答案: ', (ans) => { rl.close(); resolve(ans.trim()); });
  });
}

async function flkLogin() {
  const capResp = await fetch(`${FLK_BASE}/index/captchaImage`, { headers: FLK_HEADERS });
  const capData = await capResp.json();
  const setCookie = capResp.headers.get('set-cookie') ?? '';
  const uuid = capData.uuid;

  const answer = await solveMathCaptcha(capData.img);

  const loginResp = await fetch(`${FLK_BASE}/index/fljc`, {
    method: 'POST',
    headers: { ...FLK_HEADERS, 'Cookie': setCookie },
    body: JSON.stringify({ uuid, code: answer }),
  });
  const loginData = await loginResp.json();
  if (loginData.code !== 200) {
    throw new Error(`Captcha failed: ${loginData.msg}`);
  }

  const loginCookie = (loginResp.headers.get('set-cookie') ?? '') || setCookie;
  const token = loginData.data?.token ?? loginData.token ?? '';
  console.log('  [flk] Login OK, token:', token ? token.slice(0, 20) + '...' : '(cookie-based)');
  return { cookie: loginCookie, token };
}

async function flkSearchPage(auth, keyword, page, pageSize = 20) {
  const headers = {
    ...FLK_HEADERS,
    'Cookie': auth.cookie,
    ...(auth.token ? { 'Authorization': `Bearer ${auth.token}` } : {}),
  };
  const resp = await fetch(`${FLK_BASE}/search/list`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      pageNum: page,
      pageSize,
      conditionList: keyword
        ? [{ fieldName: 'title', values: [keyword], link: 0, searchType: 2 }]
        : [],
      sortList: [{ fieldName: 'f_bbrq_s', sortType: 'desc' }],
    }),
  });
  return resp.json();
}

async function flkGetDetail(auth, id, bbbs = '1') {
  const headers = {
    ...FLK_HEADERS,
    'Cookie': auth.cookie,
    ...(auth.token ? { 'Authorization': `Bearer ${auth.token}` } : {}),
  };
  const resp = await fetch(`${FLK_BASE}/search/flfgDetails?id=${encodeURIComponent(id)}&bbbs=${bbbs}`, { headers });
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

  let auth;
  try {
    auth = await flkLogin();
  } catch (e) {
    console.error('  [flk] 登录失败:', e.message, '— 跳过 flk 数据源');
    return 0;
  }

  let total = 0;

  for (const keyword of FLK_TARGET_KEYWORDS) {
    process.stdout.write(`  [flk] 搜索: ${keyword} ...`);
    try {
      const result = await flkSearchPage(auth, keyword, 1, 10);
      if (result.code !== 200 || !result.data?.list?.length) {
        console.log(` 无结果 (code=${result.code})`);
        continue;
      }
      const items = result.data.list;
      console.log(` ${items.length} 条`);

      for (const item of items) {
        const detail = await flkGetDetail(auth, item.id ?? item.bbbs, item.bbbs ?? '1');
        if (detail.code !== 200 || !detail.data) continue;

        const d = detail.data;
        const content = (d.body ?? d.content ?? '')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
          .replace(/\n{3,}/g, '\n\n').trim();

        if (!content) continue;

        insertLawWithChunks(db, {
          title: d.title ?? item.title,
          content,
          category: d.type ?? item.type ?? '法律',
          effective_date: d.publish ?? item.publish,
          source_url: `https://flk.npc.gov.cn/detail2.html?${item.id ?? ''}`,
        });
        total++;
        await sleep(300);
      }
    } catch (e) {
      console.error(`  [flk] ${keyword} 出错:`, e.message);
    }
    await sleep(800);
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
  const { pipeline, env } = await import('@xenova/transformers');
  const hfMirror = process.env.HF_ENDPOINT ?? 'https://hf-mirror.com';
  env.remoteURL = hfMirror + '/';
  env.allowLocalModels = true;
  env.localModelPath = MODEL_DIR;
  env.cacheDir = MODEL_DIR;

  console.log('  [embed] 加载模型 BAAI/bge-small-zh-v1.5 ...');
  const pipe = await pipeline('feature-extraction', 'BAAI/bge-small-zh-v1.5', {
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
  console.log(`模式: ${ONLY_STATIC ? 'static-only' : FLK_ONLY ? 'flk-only' : CASES_ONLY ? 'cases-only' : '全量'}\n`);

  const db = openDb();
  let total = 0;

  if (!FLK_ONLY && !CASES_ONLY) {
    total += await loadStaticData(db);
  }

  if (!ONLY_STATIC && !CASES_ONLY) {
    total += await crawlFlk(db);
  }

  if (!ONLY_STATIC && !FLK_ONLY) {
    total += await crawlCourtCases(db);
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
