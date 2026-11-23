/**
 * 附件（P3b）：上传、去重、取回，发消息时引用，发给模型前把引用换成内容。
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Message } from "@leochat/core";
import { attachmentBlock, attachmentStore, filePurpose, resolveAttachments, type AttachmentMeta } from "../attachments.js";
import { makeApp, newConv, text, transcript } from "./helpers.js";
import { vi } from "vitest";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "leochat-att-test-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);

async function upload(app: ReturnType<typeof makeApp>["app"], data: Uint8Array, name: string, type: string) {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(data)], name, { type }));
  return app.request("/api/attachments", { method: "POST", body: form });
}

describe("attachment routes", () => {
  it("stores a file once per content and serves images inline, everything else as a download", async () => {
    const { app } = makeApp(dir, [], { attachments: true });
    const a = (await (await upload(app, PNG, "a.png", "image/png")).json()) as AttachmentMeta;
    const b = (await (await upload(app, PNG, "again.png", "image/png")).json()) as AttachmentMeta;
    expect(a).toMatchObject({ kind: "image", filename: "a.png", bytes: PNG.byteLength });
    expect(b.id).toBe(a.id);

    const img = await app.request(`/api/attachments/${a.id}`);
    expect(img.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(PNG);

    const html = (await (await upload(app, new TextEncoder().encode("<script>x</script>"), "x.html", "text/html")).json()) as AttachmentMeta;
    expect(html.kind).toBe("file");
    const dl = await app.request(`/api/attachments/${html.id}`);
    expect(dl.headers.get("content-type")).toBe("application/octet-stream");
    expect(dl.headers.get("content-disposition")).toMatch(/^attachment;/);
  });

  it("rejects bad ids, empty files and unknown attachments on a message", async () => {
    const { app } = makeApp(dir, [], { attachments: true });
    expect((await app.request("/api/attachments/../secret")).status).toBe(404);
    expect((await upload(app, new Uint8Array(), "e.txt", "text/plain")).status).toBe(400);
    const id = await newConv(app);
    const send = (body: unknown) =>
      app.request(`/api/conversations/${id}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    expect((await send({ text: "hi", attachments: ["att_" + "0".repeat(40)] })).status).toBe(400);
    expect((await send({ text: "hi", attachments: ["../x"] })).status).toBe(400);
    expect((await send({ text: "" })).status).toBe(400);
  });

  it("a message can carry only an attachment; the log keeps a reference, the model gets a note when it cannot see images", async () => {
    const t = makeApp(dir, [text("看不到图")], { attachments: true });
    const meta = (await (await upload(t.app, PNG, "photo.png", "image/png")).json()) as AttachmentMeta;
    const id = await newConv(t.app);
    const res = await t.app.request(`/api/conversations/${id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "", attachments: [meta.id] }),
    });
    expect(res.status).toBe(202);
    await vi.waitFor(async () => expect((await transcript(t.app, id)).transcript.some((m) => m.role === "assistant")).toBe(true), { timeout: 5000 });
    const conv = await transcript(t.app, id);
    expect(conv.meta.title).toBe("photo.png"); // 只有附件时用文件名做标题
    const user = conv.transcript.find((m) => m.role === "user")!;
    expect(user.content).toEqual([{ type: "image", source: { kind: "url", value: `attachment:${meta.id}`, mediaType: "image/png" } }]);
    // 测试里的模型走旧接口（不能看图）：收到一行说明，而不是 base64
    expect(JSON.stringify(t.requests[0]!.messages)).toContain("photo.png");
    expect(JSON.stringify(t.requests[0]!.messages)).not.toContain("base64");
  });
});

describe("resolveAttachments", () => {
  it("inlines images for vision models and uploads documents once per account", async () => {
    const store = attachmentStore(join(dir, "att"));
    const img = await store.put(PNG, "a.png", "image/png");
    const pdf = await store.put(new TextEncoder().encode("%PDF-1.4"), "report.pdf", "application/pdf");
    const msgs: Message[] = [{ id: "m1", role: "user", content: [{ type: "text", text: "看看" }, attachmentBlock(img), attachmentBlock(pdf)] }];
    const uploadFile = vi.fn(async () => "file-remote-1");

    const out = await resolveAttachments(msgs, store, { vision: true, uploadFile });
    expect(out[0]!.content[0]).toEqual({ type: "text", text: "看看" });
    expect(out[0]!.content[1]).toEqual({ type: "image", source: { kind: "base64", value: Buffer.from(PNG).toString("base64"), mediaType: "image/png" } });
    expect(out[0]!.content[2]).toEqual({ type: "file", fileId: "file-remote-1", filename: "report.pdf" });
    expect(filePurpose(pdf)).toBe("text_recognition");
    // 原消息不变（日志里仍然是引用）
    expect(msgs[0]!.content[1]).toEqual(attachmentBlock(img));
  });

  it("a failed upload or a missing file becomes a note instead of failing the run", async () => {
    const store = attachmentStore(join(dir, "att"));
    const doc = await store.put(new TextEncoder().encode("hello"), "notes.txt", "text/plain");
    const msgs: Message[] = [
      { id: "m1", role: "user", content: [attachmentBlock(doc), { type: "file", fileId: "attachment:att_" + "1".repeat(40), filename: "gone.pdf" }] },
    ];
    const out = await resolveAttachments(msgs, store, {
      vision: false,
      uploadFile: async () => {
        throw new Error("boom");
      },
    });
    expect(out[0]!.content.map((b) => (b.type === "text" ? b.text : b.type))).toEqual([
      "[用户附上了文件 notes.txt，但上传给模型失败，读不到内容]",
      "[附件已丢失：gone.pdf]",
    ]);
  });
});
