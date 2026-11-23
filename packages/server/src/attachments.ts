/**
 * 附件（重设计 P3b，按 dsh 的 attachment / attachment-local）：
 * - 按内容的 sha256 存在 <dataDir>/attachments 下，相同内容只存一份，从不自动删除；
 * - 会话日志里只记引用（图片 source.value / 文件 fileId 写成 "attachment:<id>"），不存 base64、不存本机路径；
 * - 发给模型前由 withAttachments 换成模型能用的内容：图片 → base64；文档 → DeepSeek Files 的 file_id（缓存）；
 *   模型读不了的情况换成一行说明，而不是悄悄丢掉。
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Block, Message, ModelRequest, ProviderEvent } from "@leochat/core";

export interface AttachmentMeta {
  id: string;
  filename: string;
  mediaType: string;
  bytes: number;
  kind: "image" | "file";
}

export const ATTACHMENT_PREFIX = "attachment:";
/** 图片走 base64 内联（DeepSeek 上限 32 MiB）；文件走 Files API（文档上限 100 MiB） */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

/** 发给模型当图片的格式（与 dsh 一致）；SVG 不算图片（可以带脚本），按普通文件处理 */
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const ID = /^att_[0-9a-f]{40}$/;

export function isAttachmentId(id: string): boolean {
  return ID.test(id);
}

function safeFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\u0000-\u001f\\/]/g, "_").trim().slice(0, 200);
  return cleaned || "file";
}

export interface AttachmentStore {
  put(data: Uint8Array, filename: string, mediaType: string): Promise<AttachmentMeta>;
  meta(id: string): Promise<AttachmentMeta | null>;
  read(id: string): Promise<{ meta: AttachmentMeta; data: Buffer } | null>;
  /** 取 / 记某个 DeepSeek 账号上的 file_id（按 key 的指纹区分账号） */
  remoteId(id: string, account: string): Promise<string | undefined>;
  setRemoteId(id: string, account: string, fileId: string): Promise<void>;
}

export function attachmentStore(dir: string): AttachmentStore {
  const ready = mkdir(dir, { recursive: true });
  const paths = (id: string) => ({ data: join(dir, `${id}.bin`), meta: join(dir, `${id}.json`), remote: join(dir, `${id}.remote.json`) });

  async function meta(id: string): Promise<AttachmentMeta | null> {
    if (!isAttachmentId(id)) return null;
    try {
      return JSON.parse(await readFile(paths(id).meta, "utf8")) as AttachmentMeta;
    } catch {
      return null;
    }
  }
  async function remoteMap(id: string): Promise<Record<string, string>> {
    try {
      return JSON.parse(await readFile(paths(id).remote, "utf8")) as Record<string, string>;
    } catch {
      return {};
    }
  }

  return {
    async put(data, filename, mediaType) {
      await ready;
      const id = `att_${createHash("sha256").update(data).digest("hex").slice(0, 40)}`;
      const existing = await meta(id);
      if (existing) return existing; // 相同内容只存一份（沿用第一次上传时的文件名）
      const type = mediaType.toLowerCase();
      const m: AttachmentMeta = {
        id,
        filename: safeFilename(filename),
        mediaType: type || "application/octet-stream",
        bytes: data.byteLength,
        kind: IMAGE_TYPES.has(type) ? "image" : "file",
      };
      const p = paths(id);
      await writeFile(p.data, data);
      await writeFile(p.meta, JSON.stringify(m));
      return m;
    },
    meta,
    async read(id) {
      const m = await meta(id);
      if (!m) return null;
      const data = await readFile(paths(id).data);
      // 读的时候核对长度和内容（dsh：reads verify file length and content）
      if (data.byteLength !== m.bytes || `att_${createHash("sha256").update(data).digest("hex").slice(0, 40)}` !== id) return null;
      return { meta: m, data };
    },
    async remoteId(id, account) {
      return (await remoteMap(id))[account];
    },
    async setRemoteId(id, account, fileId) {
      const map = await remoteMap(id);
      map[account] = fileId;
      await writeFile(paths(id).remote, JSON.stringify(map));
    },
  };
}

/** 用户消息里的附件块（只有引用） */
export function attachmentBlock(m: AttachmentMeta): Block {
  return m.kind === "image"
    ? { type: "image", source: { kind: "url", value: ATTACHMENT_PREFIX + m.id, mediaType: m.mediaType } }
    : { type: "file", fileId: ATTACHMENT_PREFIX + m.id, filename: m.filename };
}

const refOf = (b: Block): string | null => {
  if (b.type === "image" && b.source.kind === "url" && b.source.value.startsWith(ATTACHMENT_PREFIX)) return b.source.value.slice(ATTACHMENT_PREFIX.length);
  if (b.type === "file" && b.fileId.startsWith(ATTACHMENT_PREFIX)) return b.fileId.slice(ATTACHMENT_PREFIX.length);
  return null;
};

export interface ResolveOptions {
  /** 模型能看图 */
  vision: boolean;
  /** 能把文档交给模型读（DeepSeek Files）；不提供时文件换成一行说明 */
  uploadFile?: (meta: AttachmentMeta, data: Buffer, signal?: AbortSignal) => Promise<string>;
}

const note = (text: string): Block => ({ type: "text", text });

/** 把消息里的附件引用换成模型能用的内容 */
export async function resolveAttachments(messages: Message[], store: AttachmentStore, opts: ResolveOptions, signal?: AbortSignal): Promise<Message[]> {
  if (!messages.some((m) => m.content.some((b) => refOf(b) !== null))) return messages;
  return Promise.all(
    messages.map(async (m) => {
      if (!m.content.some((b) => refOf(b) !== null)) return m;
      const content: Block[] = [];
      for (const b of m.content) {
        const id = refOf(b);
        if (id === null) {
          content.push(b);
          continue;
        }
        const found = await store.read(id);
        if (!found) {
          content.push(note(`[附件已丢失：${b.type === "file" ? (b.filename ?? id) : id}]`));
          continue;
        }
        const { meta, data } = found;
        if (meta.kind === "image") {
          content.push(
            opts.vision
              ? { type: "image", source: { kind: "base64", value: data.toString("base64"), mediaType: meta.mediaType } }
              : note(`[用户附上了图片 ${meta.filename}，但当前模型不能看图]`),
          );
        } else if (opts.uploadFile) {
          try {
            content.push({ type: "file", fileId: await opts.uploadFile(meta, data, signal), filename: meta.filename });
          } catch (e) {
            console.error("[attachments] upload failed", meta.id, e);
            content.push(note(`[用户附上了文件 ${meta.filename}，但上传给模型失败，读不到内容]`));
          }
        } else {
          content.push(note(`[用户附上了文件 ${meta.filename}（${meta.mediaType}，${meta.bytes} 字节），当前模型读不到附件内容]`));
        }
      }
      return { ...m, content };
    }),
  );
}

/** Files API 的 purpose：PDF / Word / PPT 要解析；图片、文本、表格等用 user_data（DeepSeek 文档） */
export function filePurpose(meta: AttachmentMeta): "text_recognition" | "user_data" {
  return /\.(pdf|docx?|pptx?)$/i.test(meta.filename) ||
    /^application\/(pdf|msword|vnd\.openxmlformats-officedocument\.(wordprocessingml|presentationml)|vnd\.ms-powerpoint)/.test(meta.mediaType)
    ? "text_recognition"
    : "user_data";
}

/**
 * 给 provider 加上附件解析：请求前把附件引用换成内容。
 * 就地替换 stream（provider 每轮新建；不能复制对象，lastError 之类的状态要留在原对象上）
 */
export function withAttachments<P extends { stream(req: ModelRequest, signal?: AbortSignal): AsyncIterable<ProviderEvent> }>(
  provider: P,
  store: AttachmentStore,
  opts: ResolveOptions,
): P {
  const inner = provider.stream.bind(provider);
  provider.stream = async function* (req: ModelRequest, signal?: AbortSignal) {
    const messages = await resolveAttachments(req.messages, store, opts, signal);
    yield* inner(messages === req.messages ? req : { ...req, messages }, signal);
  };
  return provider;
}
