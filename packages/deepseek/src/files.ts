/**
 * DeepSeek Files API（OpenAI 兼容的 /files 端点；file_id 在 Messages 端点同样可用）。
 * 用途：
 * - 图片：purpose 'user_data'，在消息里用 { type: 'image', source: { kind: 'file_id', value } }
 * - 文档（PDF / Word / PPT）：purpose 'text_recognition' 或 'rich_layout_recognition'，上传时就完成解析，
 *   在消息里用 { type: 'file', fileId }。这比 OCR 工具更直接：模型直接读文档，不需要工具调用（Q9）
 */
import { errorFromStatus } from "./provider";

export type FilePurpose = "user_data" | "text_recognition" | "rich_layout_recognition";

export interface UploadedFile {
  id: string;
  bytes: number;
  filename: string;
  purpose: FilePurpose;
  created_at: number;
  expires_at?: number;
}

export interface DeepSeekFilesOptions {
  apiKey: string;
  baseURL?: string;
  fetch?: typeof fetch;
}

export function deepseekFiles(opts: DeepSeekFilesOptions) {
  const base = (opts.baseURL ?? "https://api.deepseek.com").replace(/\/+$/, "");
  const doFetch = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const auth = { Authorization: `Bearer ${opts.apiKey}` };

  async function check(res: Response): Promise<unknown> {
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const msg = (json as { error?: { message?: string } } | undefined)?.error?.message ?? `HTTP ${res.status}`;
      throw errorFromStatus(res.status, msg, res.headers.get("retry-after"));
    }
    return json;
  }

  return {
    /**
     * 上传文件。文档在上传时解析，返回后 file_id 即可使用。
     * expiresAfterSeconds：3600–2592000；省略则永久保存（每个账号 25 GiB、1 万个文件上限）
     */
    async upload(
      file: Blob,
      filename: string,
      purpose: FilePurpose,
      o: { expiresAfterSeconds?: number; signal?: AbortSignal } = {},
    ): Promise<UploadedFile> {
      const form = new FormData();
      // 文档要求 purpose 写在 file 之前
      form.append("purpose", purpose);
      if (o.expiresAfterSeconds !== undefined) {
        form.append("expires_after[anchor]", "created_at");
        form.append("expires_after[seconds]", String(o.expiresAfterSeconds));
      }
      form.append("file", file, filename);
      const res = await doFetch(`${base}/files`, { method: "POST", headers: auth, body: form, ...(o.signal ? { signal: o.signal } : {}) });
      return (await check(res)) as UploadedFile;
    },
    async delete(fileId: string): Promise<void> {
      await check(await doFetch(`${base}/files/${encodeURIComponent(fileId)}`, { method: "DELETE", headers: auth }));
    },
  };
}
