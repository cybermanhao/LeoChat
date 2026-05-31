/**
 * 对 prebuilt DB 中缺少 embedding 的 law_chunks 补算向量
 * 用法: node scripts/embed-missing-chunks.mjs [--user-db]
 */
import { DatabaseSync } from 'node:sqlite';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { homedir } from 'os';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const PREBUILT_DB = resolve(root, 'packages/law-kb-mcp/data/laws.db');
const USER_DB = homedir() + '/.leochat-for-law/law.db';
const MODEL_DIR = resolve(root, 'packages/law-kb-mcp/data/model');
const MODEL_ID = 'Xenova/bge-small-zh-v1.5';
const writeUserDb = process.argv.includes('--user-db');

const c = {
  bold:  s => `\x1b[1m${s}\x1b[0m`,
  green: s => `\x1b[32m${s}\x1b[0m`,
  gray:  s => `\x1b[90m${s}\x1b[0m`,
  cyan:  s => `\x1b[36m${s}\x1b[0m`,
};

console.log(c.bold('\n🔢 补算缺失向量 embedding'));

// Load model
console.log(c.gray(`模型路径: ${MODEL_DIR}`));
if (!existsSync(join(MODEL_DIR, 'Xenova', MODEL_ID.split('/')[1], 'config.json'))) {
  console.error('❌ 模型文件不存在，请先下载模型');
  process.exit(1);
}

const { pipeline, env } = await import('@xenova/transformers');
env.allowLocalModels = true;
env.localModelPath = MODEL_DIR;

console.log(c.gray('加载模型中...'));
const extractor = await pipeline('feature-extraction', MODEL_ID, {
  quantized: true,
  cache_dir: MODEL_DIR,
});
console.log(c.green('✓ 模型已加载'));

async function getEmbedding(text) {
  const out = await extractor(text, { pooling: 'cls', normalize: true });
  return Buffer.from(out.data.buffer, out.data.byteOffset, out.data.byteLength);
}

async function embedDb(dbPath, label) {
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL');

  const missing = db.prepare(
    'SELECT DISTINCT law_id FROM law_chunks WHERE embedding IS NULL'
  ).all();

  if (missing.length === 0) {
    console.log(c.green(`✓ ${label}: 无缺失 embedding`));
    return;
  }

  let totalChunks = 0;
  for (const { law_id } of missing) {
    const count = db.prepare('SELECT COUNT(*) as n FROM law_chunks WHERE law_id = ? AND embedding IS NULL').get(law_id).n;
    totalChunks += count;
  }

  const lawTitles = Object.fromEntries(
    db.prepare('SELECT id, title FROM laws WHERE id IN (' + missing.map(() => '?').join(',') + ')').all(...missing.map(r => r.law_id)).map(r => [r.id, r.title])
  );

  console.log(c.cyan(`\n${label}: ${missing.length} 部法律，${totalChunks} 个 chunk 需要计算`));

  const updateStmt = db.prepare('UPDATE law_chunks SET embedding = ? WHERE law_id = ? AND chunk_index = ?');

  let done = 0;
  for (const { law_id } of missing) {
    const chunks = db.prepare(
      'SELECT chunk_index, content FROM law_chunks WHERE law_id = ? AND embedding IS NULL ORDER BY chunk_index'
    ).all(law_id);

    process.stdout.write(`  ${lawTitles[law_id]?.slice(0, 25) ?? law_id} (${chunks.length} chunks) `);
    for (const chunk of chunks) {
      const emb = await getEmbedding(chunk.content);
      updateStmt.run(emb, law_id, chunk.chunk_index);
      done++;
      if (done % 10 === 0) process.stdout.write('.');
    }
    console.log(c.green(' ✓'));
  }

  const { embedded } = db.prepare('SELECT COUNT(*) as embedded FROM law_chunks WHERE embedding IS NOT NULL').get();
  const { total } = db.prepare('SELECT COUNT(*) as total FROM law_chunks').get();
  console.log(c.bold(`  ${label} 完成: ${embedded}/${total} (${Math.round(embedded/total*100)}%)`));
}

await embedDb(PREBUILT_DB, 'prebuilt DB');
if (writeUserDb) await embedDb(USER_DB, 'user DB');

console.log(c.bold('\n✅ 全部完成\n'));
