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
    expect((result as Float32Array).length).toBe(1024);
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
    // await the last enqueued promise — all prior tasks must finish first
    await queueEmbedding(task(3));
    expect(order).toEqual([1, 2, 3]);
  });
});
