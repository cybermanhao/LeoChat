import { mkdir, appendFile, readFile, rm, readdir, stat, open, writeFile, rename } from 'fs/promises';
import { resolve, join } from 'path';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mcpToolsFromTransport } from '@leochat/mcp-kit';
import { applyTranscriptOps, newId } from '@leochat/core';

// src/jsonl-store.ts
var SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;
function assertId(runId) {
  if (!SAFE_ID.test(runId)) throw new Error(`jsonlStore: invalid runId ${JSON.stringify(runId)}`);
}
var isExists = (e) => e?.code === "EEXIST";
var isMissing = (e) => e?.code === "ENOENT";
var isBusy = (e) => ["EPERM", "EBUSY", "EACCES"].includes(e?.code ?? "");
async function retryBusy(fn, attempts = 20) {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (!isBusy(e) || i >= attempts) throw e;
      await new Promise((r) => setTimeout(r, 5 + Math.random() * 15));
    }
  }
}
async function readJson(path) {
  try {
    return JSON.parse(await retryBusy(() => readFile(path, "utf8")));
  } catch (e) {
    if (isMissing(e)) return null;
    throw e;
  }
}
async function writeAtomic(path, data) {
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, data, "utf8");
  await retryBusy(() => rename(tmp, path));
}
async function createExclusive(path, content) {
  try {
    const fh = await open(path, "wx");
    await fh.writeFile(content, "utf8");
    await fh.close();
    return true;
  } catch (e) {
    if (isExists(e) || isBusy(e)) return false;
    throw e;
  }
}
async function jsonlStore(dir, opts = {}) {
  await mkdir(dir, { recursive: true });
  const now = opts.now ?? Date.now;
  const lockTimeout = opts.lockTimeoutMs ?? 5e3;
  const paths = (runId) => {
    assertId(runId);
    return {
      paused: join(dir, `${runId}.paused.json`),
      events: join(dir, `${runId}.events.jsonl`),
      claim: join(dir, `${runId}.claim`),
      mutex: join(dir, `${runId}.mutex`)
    };
  };
  async function withMutex(path, fn) {
    const deadline = Date.now() + lockTimeout;
    for (; ; ) {
      if (await createExclusive(path, String(Date.now()))) break;
      const held = Number(await readFile(path, "utf8").catch(() => "0"));
      if (Date.now() - held > lockTimeout) {
        await rm(path, { force: true });
        continue;
      }
      if (Date.now() > deadline) throw new Error(`jsonlStore: lock timeout ${path}`);
      await new Promise((r) => setTimeout(r, 10 + Math.random() * 20));
    }
    try {
      return await fn();
    } finally {
      await rm(path, { force: true });
    }
  }
  return {
    dir,
    async savePaused(run) {
      const p = paths(run.runId);
      await withMutex(p.mutex, async () => {
        const prev = await readJson(p.paused);
        const approvals = run.approvals.map((a) => ({
          ...a,
          consumed: a.consumed || (prev?.approvals.find((x) => x.approvalId === a.approvalId)?.consumed ?? false)
        }));
        await writeAtomic(p.paused, JSON.stringify({ ...run, approvals }));
      });
      await rm(p.claim, { force: true });
    },
    async loadPaused(runId) {
      return readJson(paths(runId).paused);
    },
    async claimPaused(runId, ttlMs) {
      const p = paths(runId);
      if (await readJson(p.paused) === null) return false;
      if (await createExclusive(p.claim, String(now()))) return true;
      const at = Number(await readFile(p.claim, "utf8").catch(() => "0"));
      if (now() - at < ttlMs) return false;
      await rm(p.claim, { force: true });
      return createExclusive(p.claim, String(now()));
    },
    async consumeApproval(runId, approvalId) {
      const p = paths(runId);
      return withMutex(p.mutex, async () => {
        const run = await readJson(p.paused);
        const a = run?.approvals.find((x) => x.approvalId === approvalId);
        if (!run || !a || a.consumed) return null;
        a.consumed = true;
        await writeAtomic(p.paused, JSON.stringify(run));
        return { callId: a.callId };
      });
    },
    async deletePaused(runId) {
      const p = paths(runId);
      await rm(p.paused, { force: true });
      await rm(p.claim, { force: true });
    },
    async appendEvents(runId, events) {
      if (events.length === 0) return;
      await appendFile(paths(runId).events, events.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
    },
    async readEvents(runId) {
      let text;
      try {
        text = await readFile(paths(runId).events, "utf8");
      } catch (e) {
        if (isMissing(e)) return [];
        throw e;
      }
      return text.split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l));
    },
    async archiveMessages(runId, messages) {
      await appendFile(
        paths(runId).events,
        JSON.stringify({ type: "custom", name: "leochat.compaction_archive", data: { at: now(), messages } }) + "\n",
        "utf8"
      );
    }
  };
}
function unquote(v) {
  if (v.startsWith('"') && v.endsWith('"') || v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  return v;
}
function parseSkillMd(content) {
  const text = content.replace(/\r\n/g, "\n").replace(/^﻿/, "");
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/);
  if (!m) return { meta: {}, body: text.trim() };
  const meta = {};
  const lines = m[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    const raw = kv[2].trim();
    if (raw === ">" || raw === "|" || raw === ">-" || raw === "|-") {
      const block = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]) || lines[i + 1] === "")) block.push(lines[++i].trim());
      meta[key] = raw.startsWith(">") ? block.filter(Boolean).join(" ") : block.join("\n").trim();
    } else if (raw.startsWith("[") && raw.endsWith("]")) {
      meta[key] = raw.slice(1, -1).split(",").map((v) => unquote(v.trim())).filter(Boolean);
    } else if (raw === "true" || raw === "false") {
      meta[key] = raw === "true";
    } else {
      meta[key] = unquote(raw);
    }
  }
  return { meta, body: (m[2] ?? "").trim() };
}
function fsSkills(roots) {
  async function scan() {
    const found = /* @__PURE__ */ new Map();
    for (const root of roots.map((r) => resolve(r))) {
      let entries;
      try {
        entries = await readdir(root);
      } catch {
        continue;
      }
      for (const entry of entries.sort()) {
        const file = join(root, entry, "SKILL.md");
        try {
          if (!(await stat(join(root, entry))).isDirectory()) continue;
          const { meta } = parseSkillMd(await readFile(file, "utf8"));
          if (meta["disable-model-invocation"] === true) continue;
          const name = typeof meta.name === "string" && meta.name ? meta.name : entry;
          if (found.has(name)) continue;
          found.set(name, { name, description: typeof meta.description === "string" ? meta.description : "", file });
        } catch {
        }
      }
    }
    return [...found.values()];
  }
  return {
    scan,
    async list() {
      return (await scan()).map(({ name, description }) => ({ name, description }));
    },
    async load(name) {
      const skill = (await scan()).find((s) => s.name === name);
      if (!skill) return null;
      return parseSkillMd(await readFile(skill.file, "utf8")).body;
    }
  };
}
function stdioMcpTools(opts) {
  return mcpToolsFromTransport({
    ...opts.prefix !== void 0 ? { prefix: opts.prefix } : {},
    createTransport: () => new StdioClientTransport({
      command: opts.command,
      ...opts.args ? { args: opts.args } : {},
      ...opts.env ? { env: opts.env } : {},
      ...opts.cwd ? { cwd: opts.cwd } : {},
      stderr: opts.stderr ?? "inherit"
    })
  });
}
var SAFE_ID2 = /^[A-Za-z0-9_-]{1,128}$/;
var INDEX = "index.json";
function assertId2(id) {
  if (!SAFE_ID2.test(id)) throw new Error(`conversationLog: invalid id ${JSON.stringify(id)}`);
}
async function appendDurable(path, line) {
  const fh = await open(path, "a");
  try {
    await fh.appendFile(line + "\n", "utf8");
    await fh.datasync();
  } finally {
    await fh.close();
  }
}
function parseLog(text) {
  const lines = text.split("\n");
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      out.push(JSON.parse(line));
    } catch (e) {
      const isLast = lines.slice(i + 1).every((l) => !l.trim());
      if (isLast) break;
      throw e;
    }
  }
  return out;
}
async function conversationLog(dir, opts = {}) {
  await mkdir(dir, { recursive: true });
  const now = opts.now ?? Date.now;
  const file = (id) => {
    assertId2(id);
    return join(dir, `${id}.jsonl`);
  };
  const queues = /* @__PURE__ */ new Map();
  const serial = (id, fn) => {
    const run = (queues.get(id) ?? Promise.resolve()).then(fn, fn);
    queues.set(id, run.catch(() => {
    }));
    return run;
  };
  async function readMeta(id) {
    let text;
    try {
      text = await readFile(file(id), "utf8");
    } catch {
      return null;
    }
    const records = parseLog(text);
    const meta = records.find((r) => r.t === "meta");
    if (!meta) return null;
    let title = meta.title;
    let updatedAt = meta.createdAt;
    for (const r of records) {
      if (r.t === "title") title = r.title;
      if (r.t !== "meta") updatedAt = Math.max(updatedAt, r.at);
    }
    return { id: meta.id, title, createdAt: meta.createdAt, updatedAt };
  }
  let index = null;
  async function loadIndex() {
    if (index) return index;
    try {
      const raw = JSON.parse(await readFile(join(dir, INDEX), "utf8"));
      index = new Map(raw.conversations.map((c) => [c.id, c]));
    } catch {
      index = /* @__PURE__ */ new Map();
      for (const f of await readdir(dir)) {
        if (!f.endsWith(".jsonl")) continue;
        const meta = await readMeta(f.slice(0, -".jsonl".length)).catch(() => null);
        if (meta) index.set(meta.id, meta);
      }
      await saveIndex();
    }
    return index;
  }
  async function saveIndex() {
    if (!index) return;
    const tmp = join(dir, `${INDEX}.${process.pid}.tmp`);
    await writeFile(tmp, JSON.stringify({ conversations: [...index.values()] }), "utf8");
    await rename(tmp, join(dir, INDEX));
  }
  async function touch(meta) {
    (await loadIndex()).set(meta.id, meta);
    await saveIndex().catch(() => {
    });
  }
  const self = {
    dir,
    async create(title = "") {
      const id = newId("conv_").replace(/[^A-Za-z0-9_-]/g, "");
      const meta = { id, title, createdAt: now(), updatedAt: now() };
      await appendDurable(file(id), JSON.stringify({ t: "meta", id, title, createdAt: meta.createdAt, v: 1 }));
      await touch(meta);
      return meta;
    },
    async list() {
      return [...(await loadIndex()).values()].sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async load(id) {
      let text;
      try {
        text = await readFile(file(id), "utf8");
      } catch {
        return null;
      }
      const records = parseLog(text);
      const meta = await readMeta(id);
      if (!meta) return null;
      const ops = records.filter((r) => r.t === "op").map((r) => r.op);
      return { meta, transcript: applyTranscriptOps([], ops) };
    },
    append(id, op) {
      return serial(id, async () => {
        const at = now();
        await appendDurable(file(id), JSON.stringify({ t: "op", op, at }));
        const meta = (await loadIndex()).get(id);
        if (meta) await touch({ ...meta, updatedAt: at });
      });
    },
    setTitle(id, title) {
      return serial(id, async () => {
        const at = now();
        await appendDurable(file(id), JSON.stringify({ t: "title", title, at }));
        const meta = (await loadIndex()).get(id);
        if (meta) await touch({ ...meta, title, updatedAt: at });
      });
    },
    delete(id) {
      return serial(id, async () => {
        await rm(file(id), { force: true });
        (await loadIndex()).delete(id);
        await saveIndex().catch(() => {
        });
      });
    },
    persistFor(id) {
      return (op) => self.append(id, op);
    }
  };
  return self;
}

export { conversationLog, fsSkills, jsonlStore, parseSkillMd, stdioMcpTools };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map