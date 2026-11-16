/**
 * 文件系统上的 skill 来源：<root>/<skill>/SKILL.md（frontmatter 里写 name、description）。
 * 配合 core 的 skillCatalog() + loadSkillTool() 实现按需加载（参考 dsh skill-filesystem + tool-skill）。
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { SkillMeta, SkillSource } from "@leochat/core";

export interface ParsedSkill {
  meta: Record<string, string | boolean | string[]>;
  body: string;
}

function unquote(v: string): string {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

/**
 * 解析 SKILL.md 的 frontmatter。支持 CRLF、带引号的值、[a, b] 数组、true/false，
 * 以及 YAML 的折叠块（`key: >`）和字面块（`key: |`）。不依赖 YAML 库
 */
export function parseSkillMd(content: string): ParsedSkill {
  const text = content.replace(/\r\n/g, "\n").replace(/^﻿/, "");
  const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n([\s\S]*))?$/);
  if (!m) return { meta: {}, body: text.trim() };
  const meta: ParsedSkill["meta"] = {};
  const lines = m[1]!.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1]!;
    const raw = kv[2]!.trim();
    if (raw === ">" || raw === "|" || raw === ">-" || raw === "|-") {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+\S/.test(lines[i + 1]!) || lines[i + 1] === "")) block.push(lines[++i]!.trim());
      meta[key] = raw.startsWith(">") ? block.filter(Boolean).join(" ") : block.join("\n").trim();
    } else if (raw.startsWith("[") && raw.endsWith("]")) {
      meta[key] = raw
        .slice(1, -1)
        .split(",")
        .map((v) => unquote(v.trim()))
        .filter(Boolean);
    } else if (raw === "true" || raw === "false") {
      meta[key] = raw === "true";
    } else {
      meta[key] = unquote(raw);
    }
  }
  return { meta, body: (m[2] ?? "").trim() };
}

interface FoundSkill extends SkillMeta {
  file: string;
}

/**
 * 扫描若干根目录。同名 skill 以先出现的根目录为准（例如项目目录优先于用户目录）。
 * `disable-model-invocation: true` 的 skill 不进目录（只能由用户显式调用）
 */
export function fsSkills(roots: string[]): SkillSource & { scan(): Promise<FoundSkill[]> } {
  async function scan(): Promise<FoundSkill[]> {
    const found = new Map<string, FoundSkill>();
    for (const root of roots.map((r) => resolve(r))) {
      let entries: string[];
      try {
        entries = await readdir(root);
      } catch {
        continue; // 根目录不存在
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
          // 没有 SKILL.md 或无法读取：跳过
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
    },
  };
}
