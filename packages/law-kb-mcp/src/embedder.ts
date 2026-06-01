// packages/law-kb-mcp/src/embedder.ts
import { join } from 'path';
import { homedir } from 'os';
import { existsSync } from 'fs';

// Xenova/bge-small-zh-v1.5: ONNX-converted version, ~130MB quantized, strong Chinese semantic search
const MODEL_ID = 'Xenova/bge-small-zh-v1.5';

function getModelDir(): string {
  // LAW_MODEL_DIR: explicit override (packaged app points here via extraResources)
  if (process.env.LAW_MODEL_DIR) return process.env.LAW_MODEL_DIR;
  const base = process.env.LAW_KB_DIR ?? join(homedir(), '.leochat-for-law');
  return join(base, 'models', 'bge-small-zh');
}

let extractor: ((text: string, opts: object) => Promise<{ data: Float32Array }>) | null = null;
let extractorFailed = false; // true when runtime load failed; skip further attempts
let embeddingQueue: Promise<void> = Promise.resolve();
let isDownloading = false;
let downloadProgress = 0;

export function getDownloadStatus(): { downloading: boolean; progress: number } {
  return { downloading: isDownloading, progress: downloadProgress };
}

async function getExtractor() {
  if (extractor) return extractor;
  if (extractorFailed) return null;
  try {
    const { pipeline, env } = await import('@xenova/transformers');
    const modelDir = getModelDir();
    if (!process.env.HF_ENDPOINT) process.env.HF_ENDPOINT = 'https://hf-mirror.com';
    (env as any).allowLocalModels = true;
    (env as any).localModelPath = modelDir;
    extractor = await pipeline('feature-extraction', MODEL_ID, {
      quantized: true,
      cache_dir: modelDir,
    }) as any;
    return extractor!;
  } catch (err) {
    extractorFailed = true;
    console.error('[embedder] Runtime load failed, falling back to keyword search:', (err as Error).message);
    return null;
  }
}

// Returns null when the runtime is unavailable; callers should fall back to keyword search.
export async function getEmbedding(
  text: string,
  _mode: 'query' | 'document' = 'document'
): Promise<Float32Array | null> {
  const pipe = await getExtractor();
  if (!pipe) return null;
  const output = await pipe(text, { pooling: 'cls', normalize: true });
  return output.data;
}

export async function isModelReady(): Promise<boolean> {
  // xenova stores at {modelDir}/Xenova/bge-small-zh-v1.5/config.json
  return existsSync(join(getModelDir(), 'Xenova', 'bge-small-zh-v1.5', 'config.json'));
}

export async function downloadModel(onProgress: (pct: number) => void): Promise<void> {
  isDownloading = true;
  downloadProgress = 0;
  try {
    const { pipeline, env } = await import('@xenova/transformers');
    const modelDir = getModelDir();
    if (!process.env.HF_ENDPOINT) process.env.HF_ENDPOINT = 'https://hf-mirror.com';
    (env as any).allowLocalModels = false;
    extractor = null; // reset so next getEmbedding reloads from local
    await (pipeline as any)('feature-extraction', MODEL_ID, {
      quantized: true,
      cache_dir: modelDir,
      progress_callback: (p: { progress?: number }) => {
        if (p.progress != null) {
          downloadProgress = Math.round(p.progress);
          onProgress(downloadProgress);
        }
      },
    });
    extractor = null;
  } finally {
    isDownloading = false;
  }
}

export function queueEmbedding(fn: () => Promise<void>): Promise<void> {
  const next = embeddingQueue.then(fn).catch(err => console.error('[embedder queue]', err));
  embeddingQueue = next;
  return next;
}
