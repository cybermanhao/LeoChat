/**
 * 补齐知识库缺失法律 — 从 flk.npc.gov.cn 抓取并写入 prebuilt DB 和用户 DB
 *
 * 用法:
 *   node scripts/seed-missing-laws.mjs            # 只写 packages/law-kb-mcp/data/laws.db
 *   node scripts/seed-missing-laws.mjs --user-db  # 同时写入 ~/.leochat-for-law/law.db
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const PREBUILT_DB = resolve(root, 'packages/law-kb-mcp/data/laws.db');
const USER_DB = homedir() + '/.leochat-for-law/law.db';
const writeUserDb = process.argv.includes('--user-db');

const FLK_SEARCH = 'https://flk.npc.gov.cn/law-search/search/list';
const FLK_DETAIL = 'https://flk.npc.gov.cn/law-search/search/flfgDetails';
const FLK_DOWNLOAD = 'https://flk.npc.gov.cn/law-search/download/pc';
const FLK_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://flk.npc.gov.cn/',
  'Content-Type': 'application/json;charset=utf-8',
};

const EXTRACT_PY = resolve(__dirname, '_extract-docx.py');
const TMP_DOCX = resolve(root, 'packages/law-kb-mcp/data/_tmp_seed.docx');

// ── 目标法律（按优先级） ──────────────────────────────────────────────────────
// flfgCodeId ranges: 100-139=宪法/法律, 140-199=行政法规, 200-299=司法解释, 300+=地方
// We filter flfgCodeId < 400 to include judicial interpretations (200-299)
const TARGETS = [
  // P0: 缺失的核心法律
  { keyword: '反不正当竞争法', flfgCodeMax: 200, limit: 1 },

  // P0: 劳动 / 竞业限制 司法解释
  { keyword: '劳动争议案件适用法律问题的解释', flfgCodeMax: 400, limit: 3 },

  // P0: 公司法司法解释
  { keyword: '公司法若干问题的规定', flfgCodeMax: 400, limit: 4 },

  // P1: 合同纠纷
  { keyword: '买卖合同纠纷案件适用法律问题的解释', flfgCodeMax: 400, limit: 2 },

  // P1: 商品房买卖
  { keyword: '商品房买卖合同纠纷案件适用法律若干问题的解释', flfgCodeMax: 400, limit: 2 },

  // P1: 建设工程施工
  { keyword: '建设工程施工合同纠纷案件适用法律问题的解释', flfgCodeMax: 400, limit: 2 },

  // P1: 保险法
  { keyword: '保险法若干问题的解释', flfgCodeMax: 400, limit: 4 },

  // P1: 知识产权 / 竞争
  { keyword: '不正当竞争民事案件适用法律', flfgCodeMax: 400, limit: 2 },

  // P1: 九民纪要 (全国法院民商事审判工作会议纪要)
  { keyword: '全国法院民商事审判工作会议纪要', flfgCodeMax: 400, limit: 1 },

  // P2: 反垄断
  { keyword: '反垄断法', flfgCodeMax: 200, limit: 1 },
];

// ── FLK API ──────────────────────────────────────────────────────────────────

async function flkSearch(keyword, limit = 5) {
  const resp = await fetch(FLK_SEARCH, {
    method: 'POST',
    headers: FLK_HEADERS,
    body: JSON.stringify({
      searchContent: keyword,
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
      pageNum: 1,
      pageSize: limit,
    }),
  });
  if (!resp.ok) throw new Error(`Search HTTP ${resp.status}`);
  return resp.json();
}

async function flkGetDetail(bbbs) {
  const id = Buffer.from(bbbs).toString('base64');
  const resp = await fetch(`${FLK_DETAIL}?id=${encodeURIComponent(id)}&bbbs=${bbbs}`, {
    headers: { ...FLK_HEADERS, 'Content-Type': undefined },
  });
  if (!resp.ok) throw new Error(`Detail HTTP ${resp.status}`);
  return resp.json();
}

async function flkDownloadText(bbbs) {
  const resp = await fetch(`${FLK_DOWNLOAD}?bbbs=${bbbs}&format=docx`, {
    headers: { ...FLK_HEADERS, 'Content-Type': undefined },
  });
  if (!resp.ok) throw new Error(`Download-meta HTTP ${resp.status}`);
  const meta = await resp.json();
  if (meta.code !== 200 || !meta.data?.url) throw new Error('No download URL in response');

  const docxResp = await fetch(meta.data.url, {
    headers: { 'User-Agent': FLK_HEADERS['User-Agent'] },
  });
  if (!docxResp.ok) throw new Error(`Docx fetch HTTP ${docxResp.status}`);
  const buf = Buffer.from(await docxResp.arrayBuffer());
  if (buf.length < 100) throw new Error('Docx too small');

  writeFileSync(TMP_DOCX, buf);
  try {
    const text = execFileSync('python', [EXTRACT_PY, TMP_DOCX], {
      timeout: 30_000,
      encoding: 'utf-8',
    }).trim();
    return text || null;
  } finally {
    try { unlinkSync(TMP_DOCX); } catch {}
  }
}

// ── DB helpers ───────────────────────────────────────────────────────────────

const ARTICLE_RE = /^第[一二三四五六七八九十百千零〇\d]+条/;
const MAX_CHUNK = 500;

function chunkLawText(text) {
  const chunks = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let buf = '', articleNum = null;
  const flush = () => {
    if (!buf.trim()) return;
    if (buf.length > MAX_CHUNK) {
      for (let i = 0; i < buf.length; i += MAX_CHUNK)
        chunks.push({ content: buf.slice(i, i + MAX_CHUNK), article_number: articleNum });
    } else {
      chunks.push({ content: buf.trim(), article_number: articleNum });
    }
    buf = '';
  };
  for (const line of lines) {
    if (ARTICLE_RE.test(line)) { flush(); articleNum = line.match(ARTICLE_RE)?.[0] ?? null; buf = line; }
    else buf += '\n' + line;
  }
  flush();
  return chunks;
}

function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS laws (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT,
      effective_date TEXT,
      source_url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS law_chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      law_id INTEGER NOT NULL REFERENCES laws(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      article_number TEXT,
      embedding BLOB,
      UNIQUE(law_id, chunk_index)
    );
  `);
  return db;
}

function insertLaw(db, { title, content, category, effective_date, source_url }) {
  const existing = db.prepare('SELECT id FROM laws WHERE title = ?').get(title);
  if (existing) return { inserted: false };

  const res = db.prepare(`
    INSERT INTO laws (title, content, category, effective_date, source_url)
    VALUES (?, ?, ?, ?, ?)
  `).run(title, content, category ?? null, effective_date ?? null, source_url ?? null);

  const lawId = Number(res.lastInsertRowid);
  const chunks = chunkLawText(content);
  const stmt = db.prepare('INSERT OR IGNORE INTO law_chunks (law_id, chunk_index, content, article_number) VALUES (?, ?, ?, ?)');
  chunks.forEach((ch, i) => stmt.run(lawId, i, ch.content, ch.article_number ?? null));
  return { inserted: true };
}

// ── Color output ─────────────────────────────────────────────────────────────
const c = {
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  green:  s => `\x1b[32m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  gray:   s => `\x1b[90m${s}\x1b[0m`,
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Main ─────────────────────────────────────────────────────────────────────

console.log(c.bold('\n📚 补齐法律知识库'));
console.log(c.gray(`prebuilt: ${PREBUILT_DB}`));
if (writeUserDb) console.log(c.gray(`user db : ${USER_DB}`));
console.log('');

const dbs = [openDb(PREBUILT_DB)];
if (writeUserDb) dbs.push(openDb(USER_DB));

let totalInserted = 0;
let totalSkipped = 0;

for (const target of TARGETS) {
  console.log(c.cyan(`\n搜索: "${target.keyword}"`));

  let searchResult;
  try {
    searchResult = await flkSearch(target.keyword, target.limit + 2);
  } catch (e) {
    console.log(c.red(`  ✗ 搜索失败: ${e.message}`));
    continue;
  }

  if (searchResult.code !== 200 || !searchResult.rows?.length) {
    console.log(c.yellow(`  △ 无结果 (code=${searchResult.code})`));
    continue;
  }

  // Filter to target flfgCodeId range, limit count
  const rows = (searchResult.rows ?? [])
    .filter(r => (r.flfgCodeId ?? 0) < target.flfgCodeMax)
    .slice(0, target.limit);

  if (rows.length === 0) {
    console.log(c.yellow('  △ 过滤后无结果'));
    continue;
  }

  for (const row of rows) {
    const { bbbs, flxz } = row;
    const rawTitle = (row.title ?? '').replace(/<[^>]+>/g, '').trim();
    if (!bbbs) continue;

    process.stdout.write(`  处理: ${rawTitle.slice(0, 30)} ...`);

    // Download and extract text
    let text;
    try {
      text = await flkDownloadText(bbbs);
    } catch (e) {
      console.log(c.red(` ✗ 下载失败: ${e.message.slice(0, 60)}`));
      await sleep(500);
      continue;
    }

    if (!text || text.length < 50) {
      console.log(c.yellow(' △ 正文为空'));
      await sleep(500);
      continue;
    }

    const detail = await flkGetDetail(bbbs).catch(() => null);
    const title = detail?.data?.title?.replace(/<[^>]+>/g, '').trim() || rawTitle;
    const effective_date = detail?.data?.sxrq ?? detail?.data?.gbrq ?? row.sxrq ?? row.gbrq;
    const category = flxz ?? '司法解释';
    const source_url = `https://flk.npc.gov.cn/detail2.html?${encodeURIComponent(Buffer.from(bbbs).toString('base64'))}`;

    let anyInserted = false;
    for (const db of dbs) {
      const { inserted } = insertLaw(db, { title, content: text, category, effective_date, source_url });
      if (inserted) anyInserted = true;
    }

    if (anyInserted) {
      totalInserted++;
      console.log(c.green(` ✓`) + c.gray(` [${category}] ${text.length}字`));
    } else {
      totalSkipped++;
      console.log(c.gray(' ─ 已存在'));
    }

    await sleep(800);
  }
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(60));
console.log(c.bold(`\n新增: ${totalInserted} 部  跳过: ${totalSkipped} 部`));
console.log('');

for (const db of dbs) {
  const total = db.prepare('SELECT COUNT(*) as n FROM laws').get().n;
  const byCat = db.prepare('SELECT category, COUNT(*) as n FROM laws GROUP BY category ORDER BY n DESC').all();
  console.log(c.bold(`DB 共 ${total} 部:`));
  for (const row of byCat) console.log(`  ${row.category ?? '未分类'}: ${row.n}`);
}
console.log('');
