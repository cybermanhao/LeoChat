#!/usr/bin/env node
/**
 * Automated smoke test for the packaged Electron app.
 *
 * Tests:
 *   1. Required files present in resources/ (laws.db, model, MCP bundles)
 *   2. law-kb MCP server starts and responds to MCP protocol
 *   3. list_laws returns ≥ 100 laws
 *   4. list_knowledge_bases shows model_ready = true
 *   5. search_law (FTS/LIKE path) returns relevant results
 *   6. search_law with semantic query has similarity > 0 (vector search active)
 *   7. First-call latency (ONNX model loading overhead)
 *
 * Usage:
 *   node scripts/test-packed-app.mjs [releaseDir]
 *   node scripts/test-packed-app.mjs apps/electron/release/win-unpacked
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';
import { mkdirSync, rmSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';
import { createInterface } from 'readline';

const ROOT = join(import.meta.dirname, '..');
const DEFAULT_RELEASE = join(ROOT, 'apps/electron/release/win-unpacked');
const releaseDir = resolve(process.argv[2] ?? DEFAULT_RELEASE);
const resourcesDir = join(releaseDir, 'resources');

// ─── Colours ─────────────────────────────────────────────────────────────────
const C = {
  ok:   s => `\x1b[32m✓ ${s}\x1b[0m`,
  fail: s => `\x1b[31m✗ ${s}\x1b[0m`,
  info: s => `\x1b[36m  ${s}\x1b[0m`,
  head: s => `\x1b[1m${s}\x1b[0m`,
};

let passed = 0, failed = 0;
function ok(msg)   { console.log(C.ok(msg));   passed++; }
function fail(msg) { console.log(C.fail(msg)); failed++; }
function info(msg) { console.log(C.info(msg)); }

// ─── 1. File presence checks ──────────────────────────────────────────────────
console.log(C.head('\n[1] File presence checks'));
info(`Resources: ${resourcesDir}`);

const REQUIRED_FILES = [
  'node.exe',
  'mcp-servers/law-kb-mcp.mjs',
  'mcp-servers/laws.db',
  'mcp-servers/model/Xenova/bge-small-zh-v1.5/config.json',
  'mcp-servers/model/Xenova/bge-small-zh-v1.5/onnx/model_quantized.onnx',
  'mcp-servers/model/Xenova/bge-small-zh-v1.5/tokenizer.json',
  'leochat-mcp.js',
  'mcp-servers/filesystem.js',
];

for (const f of REQUIRED_FILES) {
  const full = join(resourcesDir, f);
  if (existsSync(full)) {
    ok(f);
  } else {
    fail(`MISSING: ${f}`);
  }
}

// Check sizes for key files
import { statSync } from 'fs';
const lawsDbSize = existsSync(join(resourcesDir, 'mcp-servers/laws.db'))
  ? statSync(join(resourcesDir, 'mcp-servers/laws.db')).size
  : 0;
const modelSize = existsSync(join(resourcesDir, 'mcp-servers/model/Xenova/bge-small-zh-v1.5/onnx/model_quantized.onnx'))
  ? statSync(join(resourcesDir, 'mcp-servers/model/Xenova/bge-small-zh-v1.5/onnx/model_quantized.onnx')).size
  : 0;

if (lawsDbSize > 40 * 1024 * 1024) {
  ok(`laws.db size OK: ${(lawsDbSize / 1024 / 1024).toFixed(1)}MB (≥40MB expected with embeddings)`);
} else {
  fail(`laws.db too small: ${(lawsDbSize / 1024 / 1024).toFixed(1)}MB — embeddings missing?`);
}

if (modelSize > 20 * 1024 * 1024) {
  ok(`model_quantized.onnx size OK: ${(modelSize / 1024 / 1024).toFixed(1)}MB`);
} else {
  fail(`model file too small or missing: ${(modelSize / 1024 / 1024).toFixed(1)}MB`);
}

if (failed > 0) {
  console.log(C.fail(`\nFile checks failed — cannot continue MCP tests\n`));
  process.exit(1);
}

// ─── 2. Spawn law-kb MCP server and run tests ─────────────────────────────────
console.log(C.head('\n[2] MCP server tests'));

const tmpLawDir = join(tmpdir(), `leochat-test-${Date.now()}`);
mkdirSync(tmpLawDir, { recursive: true });

const nodeExe  = join(resourcesDir, 'node.exe');
const mcpScript = join(resourcesDir, 'mcp-servers/law-kb-mcp.mjs');
const lawsDb   = join(resourcesDir, 'mcp-servers/laws.db');
const modelDir = join(resourcesDir, 'mcp-servers/model');

info(`Spawning: ${nodeExe} --experimental-sqlite ${mcpScript}`);
info(`LAW_PREBUILT_DB = ${lawsDb}`);
info(`LAW_MODEL_DIR   = ${modelDir}`);
info(`LAW_KB_DIR      = ${tmpLawDir}`);

const proc = spawn(nodeExe, ['--experimental-sqlite', mcpScript], {
  env: {
    ...process.env,
    LAW_PREBUILT_DB: lawsDb,
    LAW_MODEL_DIR:   modelDir,
    LAW_KB_DIR:      tmpLawDir,
  },
  stdio: ['pipe', 'pipe', 'pipe'],
});

// Collect stderr for diagnostics
const stderrLines = [];
proc.stderr.on('data', d => stderrLines.push(d.toString()));

// ─── JSON-RPC 2.0 over stdio ──────────────────────────────────────────────────
let reqId = 1;
const pending = new Map(); // id → { resolve, reject, sentAt }

const rl = createInterface({ input: proc.stdout });
rl.on('line', line => {
  if (!line.trim()) return;
  try {
    const msg = JSON.parse(line);
    if (msg.id != null && pending.has(msg.id)) {
      const { resolve, sentAt } = pending.get(msg.id);
      pending.delete(msg.id);
      resolve({ result: msg.result, error: msg.error, ms: Date.now() - sentAt });
    }
  } catch {}
});

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = reqId++;
    const sentAt = Date.now();
    pending.set(id, { resolve, reject, sentAt });
    const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    proc.stdin.write(msg + '\n');
    // 30-second timeout per request
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`Timeout: ${method}`));
      }
    }, 30_000);
  });
}

async function callTool(name, args) {
  const resp = await send('tools/call', { name, arguments: args });
  if (resp.error) throw new Error(JSON.stringify(resp.error));
  const content = resp.result?.content ?? [];
  const text = content.map(c => c.text ?? '').join('');
  return { text, ms: resp.ms };
}

async function runTests() {
  // MCP initialize handshake
  info('Initializing MCP connection...');
  const tInit = Date.now();
  try {
    await send('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test-runner', version: '1.0' },
    });
    await send('notifications/initialized', {});
  } catch (e) {
    fail(`MCP initialize failed: ${e.message}`);
    return;
  }
  ok(`MCP handshake (${Date.now() - tInit}ms)`);

  // ── list_laws ────────────────────────────────────────────────────────────────
  console.log(C.head('\n  list_laws'));
  try {
    const { text, ms } = await callTool('list_laws', {});
    const countMatch = text.match(/共收录\s*(\d+)\s*部/);
    const count = countMatch ? parseInt(countMatch[1]) : 0;
    if (count >= 100) {
      ok(`${count} laws returned (${ms}ms)`);
    } else {
      fail(`Only ${count} laws — expected ≥ 100`);
      info('Response: ' + text.slice(0, 200));
    }
  } catch (e) {
    fail(`list_laws error: ${e.message}`);
  }

  // ── list_knowledge_bases ─────────────────────────────────────────────────────
  console.log(C.head('\n  list_knowledge_bases'));
  try {
    const { text, ms } = await callTool('list_knowledge_bases', {});
    const data = JSON.parse(text);
    if (data.model_ready === true) {
      ok(`model_ready = true (${ms}ms)`);
    } else {
      fail(`model_ready = ${data.model_ready} — vector search disabled`);
    }
    if (data.law_count >= 100) {
      ok(`law_count = ${data.law_count}`);
    } else {
      fail(`law_count = ${data.law_count} (expected ≥ 100)`);
    }
    info(`law_chunks_count = ${data.law_chunks_count}, migration_progress = ${(data.migration_progress * 100).toFixed(0)}%`);
  } catch (e) {
    fail(`list_knowledge_bases error: ${e.message}`);
  }

  // ── search_law: FTS path (keyword in law title/article) ──────────────────────
  console.log(C.head('\n  search_law (FTS/LIKE path)'));
  const FTS_QUERY = '劳动合同';
  try {
    const { text, ms } = await callTool('search_law', { query: FTS_QUERY, limit: 5 });
    if (text === '未找到相关法条') {
      fail(`No FTS results for "${FTS_QUERY}"`);
    } else {
      let results;
      try { results = JSON.parse(text); } catch { results = []; }
      if (results.length > 0) {
        ok(`FTS "${FTS_QUERY}": ${results.length} results (${ms}ms)`);
        results.slice(0, 2).forEach(r => info(`  • ${r.title} — ${r.snippet?.slice(0, 60)}`));
      } else {
        fail(`FTS returned 0 results for "${FTS_QUERY}"`);
      }
    }
  } catch (e) {
    fail(`search_law FTS error: ${e.message}`);
  }

  // ── search_law: vector search (semantic query, checks similarity > 0) ─────────
  console.log(C.head('\n  search_law (vector search)'));
  const VEC_QUERY = '合同违约金上限如何确定';
  const tVec = Date.now();
  try {
    const { text, ms } = await callTool('search_law', { query: VEC_QUERY, limit: 5 });
    if (text === '未找到相关法条') {
      fail(`No vector results for "${VEC_QUERY}"`);
    } else {
      let results;
      try { results = JSON.parse(text); } catch { results = []; }
      if (results.length === 0) {
        fail(`Vector search returned empty for "${VEC_QUERY}"`);
      } else {
        const maxSim = Math.max(...results.map(r => r.similarity ?? 0));
        if (maxSim > 0) {
          ok(`Vector search "${VEC_QUERY}": ${results.length} results, max_similarity=${maxSim.toFixed(3)} (${ms}ms)`);
        } else {
          fail(`similarity = 0 for all results — vector search not active (${ms}ms)`);
        }
        results.slice(0, 2).forEach(r =>
          info(`  • [sim=${(r.similarity??0).toFixed(3)}] ${r.title} — ${r.snippet?.slice(0, 60)}`));
      }
    }
  } catch (e) {
    fail(`search_law vector error: ${e.message}`);
  }
  info(`Vector query total (incl. ONNX model init): ${Date.now() - tVec}ms`);

  // ── second search: model already loaded, should be faster ────────────────────
  console.log(C.head('\n  search_law (warm — model already loaded)'));
  const WARM_QUERY = '股东会决议效力';
  try {
    const { text, ms } = await callTool('search_law', { query: WARM_QUERY, limit: 3 });
    let results;
    try { results = JSON.parse(text); } catch { results = []; }
    const maxSim = results.length > 0 ? Math.max(...results.map(r => r.similarity ?? 0)) : 0;
    if (ms < 3000) {
      ok(`Warm query (${ms}ms) — acceptable latency`);
    } else {
      fail(`Warm query slow: ${ms}ms (expected <3000ms after model init)`);
    }
    info(`  max_similarity = ${maxSim.toFixed(3)}, results = ${results.length}`);
  } catch (e) {
    fail(`Warm search error: ${e.message}`);
  }
}

try {
  await runTests();
} catch (e) {
  fail(`Unexpected error: ${e.message}`);
  console.error(e);
} finally {
  proc.stdin.end();
  proc.kill();
  try { rmSync(tmpLawDir, { recursive: true }); } catch {}
  if (stderrLines.length > 0) {
    console.log(C.head('\n[server stderr]'));
    stderrLines.join('').split('\n').filter(l => l.trim()).slice(-20).forEach(l => info(l));
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log(C.head('\n════════════════════════════════'));
if (failed === 0) {
  console.log(C.ok(`All ${passed} tests passed`));
} else {
  console.log(`${C.ok(`${passed} passed`)}  ${C.fail(`${failed} failed`)}`);
}
console.log('');
process.exit(failed > 0 ? 1 : 0);
