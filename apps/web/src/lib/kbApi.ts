// apps/web/src/lib/kbApi.ts
const BASE = '/api/kb';

export interface KbStatus {
  law_count: number;
  user_doc_count: number;
  law_chunks_count?: number;
  user_doc_chunks_count?: number;
  model_ready?: boolean;
  migration_progress?: number;
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

  async uploadContent(filename: string, content: string): Promise<{ success: boolean; doc_id?: number; error?: string }> {
    const res = await fetch(`${BASE}/upload-content`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename, content }),
    });
    if (!res.ok) throw new Error('Failed to upload content');
    return res.json();
  },

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
};
