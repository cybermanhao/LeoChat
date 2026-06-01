/**
 * Download bge-small-zh-v1.5 model for CI builds.
 * Uses HF_ENDPOINT env var (set to https://hf-mirror.com in CI).
 */
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODEL_DIR = resolve(__dirname, '../packages/law-kb-mcp/data/model');
const MODEL_ID = 'Xenova/bge-small-zh-v1.5';
const CONFIG_PATH = resolve(MODEL_DIR, MODEL_ID, 'config.json');

if (existsSync(CONFIG_PATH)) {
  console.log('Model already present, skipping download.');
  process.exit(0);
}

console.log(`Downloading ${MODEL_ID} to ${MODEL_DIR}...`);
if (process.env.HF_ENDPOINT) {
  console.log(`Using mirror: ${process.env.HF_ENDPOINT}`);
}

mkdirSync(MODEL_DIR, { recursive: true });

const { pipeline, env } = await import('@xenova/transformers');
env.allowLocalModels = false;
env.cacheDir = MODEL_DIR;
if (process.env.HF_ENDPOINT) {
  env.remoteHost = process.env.HF_ENDPOINT + '/';
}

await pipeline('feature-extraction', MODEL_ID, {
  quantized: true,
  cache_dir: MODEL_DIR,
  progress_callback: (p) => {
    if (p.status === 'downloading' && p.name) {
      const pct = p.progress != null ? ` ${Math.round(p.progress)}%` : '';
      process.stdout.write(`\r  ${p.name}${pct}          `);
    }
  },
});

console.log(`\nModel downloaded to ${MODEL_DIR}`);
