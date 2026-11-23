/**
 * 附件接口（重设计 P3b）：
 *   POST /attachments       multipart，字段 file；返回 AttachmentMeta（相同内容返回同一个 id）
 *   GET  /attachments/:id   取回内容（会话里的图片缩略图、文件下载）
 */
import { Hono } from "hono";
import type { ServerContext } from "../server.js";
import { MAX_FILE_BYTES, MAX_IMAGE_BYTES, isAttachmentId } from "../attachments.js";

export function createAttachmentRoutes(context: ServerContext): Hono {
  const app = new Hono();

  app.post("/attachments", async (c) => {
    const store = context.attachments;
    if (!store) return c.json({ error: "Attachments are not available" }, 404);
    // 先看声明的长度，避免把超大请求整个读进内存
    const declared = Number(c.req.header("content-length") ?? "0");
    if (declared > MAX_FILE_BYTES + 64 * 1024) return c.json({ error: "File too large" }, 413);
    let file: unknown;
    try {
      file = (await c.req.parseBody())["file"];
    } catch {
      return c.json({ error: "Invalid form body" }, 400);
    }
    if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);
    const limit = /^image\/(png|jpeg|webp|gif)$/i.test(file.type) ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    if (file.size === 0) return c.json({ error: "File is empty" }, 400);
    if (file.size > limit) return c.json({ error: "File too large" }, 413);
    try {
      const meta = await store.put(new Uint8Array(await file.arrayBuffer()), file.name || "file", file.type || "application/octet-stream");
      return c.json(meta);
    } catch (e) {
      console.error("[attachments] store failed", e);
      return c.json({ error: "Could not store the file" }, 500);
    }
  });

  app.get("/attachments/:id", async (c) => {
    const store = context.attachments;
    const id = c.req.param("id");
    if (!store || !isAttachmentId(id)) return c.json({ error: "Not found" }, 404);
    const found = await store.read(id);
    if (!found) return c.json({ error: "Not found" }, 404);
    const { meta, data } = found;
    // 只有确认是图片的才按原类型返回（页面里显示缩略图）；其它一律当下载，避免上传的 HTML 在本站执行
    const inline = meta.kind === "image";
    return c.body(new Uint8Array(data), 200, {
      "Content-Type": inline ? meta.mediaType : "application/octet-stream",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(meta.filename)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable", // 内容寻址，id 不变内容就不变
    });
  });

  return app;
}
