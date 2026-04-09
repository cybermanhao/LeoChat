import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { join, resolve } from "path";
import type { SkillMeta, ContextSlot } from "./types";

/** 解析 SKILL.md 的 YAML frontmatter，返回元数据和正文 */
function parseSkillMd(content: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const frontmatter = match[1];
  const body = match[2].trim();

  // 简单的 YAML key: value 解析（不依赖 js-yaml）
  const meta: Record<string, unknown> = {};
  for (const line of frontmatter.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();

    // 解析数组 [a, b, c]
    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      meta[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    } else if (rawValue === "true") {
      meta[key] = true;
    } else if (rawValue === "false") {
      meta[key] = false;
    } else {
      meta[key] = rawValue;
    }
  }

  return { meta, body };
}

function toSkillMeta(meta: Record<string, unknown>, dir: string): SkillMeta {
  return {
    name: String(meta.name ?? ""),
    description: String(meta.description ?? ""),
    version: meta.version ? String(meta.version) : undefined,
    model: meta.model ? String(meta.model) : undefined,
    allowedTools: Array.isArray(meta["allowed-tools"])
      ? (meta["allowed-tools"] as string[])
      : undefined,
    disableModelInvocation: Boolean(meta["disable-model-invocation"]),
    userInvocable: meta["user-invocable"] !== false,
    dir,
  };
}

/**
 * 扫描 skillsDir 目录，返回所有 skill 的元数据列表。
 * 级别 1：只读元数据，不加载正文（懒加载）。
 */
export function listSkills(skillsDir: string): SkillMeta[] {
  const absoluteDir = resolve(skillsDir);
  if (!existsSync(absoluteDir)) return [];

  const results: SkillMeta[] = [];
  for (const entry of readdirSync(absoluteDir)) {
    const skillDir = join(absoluteDir, entry);
    if (!statSync(skillDir).isDirectory()) continue;

    const skillMdPath = join(skillDir, "SKILL.md");
    if (!existsSync(skillMdPath)) continue;

    try {
      const content = readFileSync(skillMdPath, "utf-8");
      const { meta } = parseSkillMd(content);
      const skillMeta = toSkillMeta(meta, skillDir);
      if (!skillMeta.name) skillMeta.name = entry; // fallback to dir name
      results.push(skillMeta);
    } catch {
      // 解析失败的 skill 跳过
    }
  }

  return results;
}

/**
 * 加载指定 skill 的正文内容（级别 2）。
 * 超过 200 行时打印警告（spec 约束）。
 */
export function loadSkillContent(skillDir: string): {
  meta: SkillMeta;
  body: string;
  references: string[];
} {
  const skillMdPath = join(skillDir, "SKILL.md");
  const content = readFileSync(skillMdPath, "utf-8");
  const { meta, body } = parseSkillMd(content);

  const lineCount = body.split("\n").length;
  if (lineCount > 200) {
    console.warn(
      `[leochat-sdk] Skill "${meta.name ?? skillDir}" SKILL.md body is ${lineCount} lines (recommended <200).`
    );
  }

  // 提取正文中的 markdown 链接作为可用 reference 文件列表
  const references = extractReferences(body, skillDir);

  return {
    meta: toSkillMeta(meta, skillDir),
    body,
    references,
  };
}

/** 从正文 markdown 链接中提取 references/ 目录下的文件路径 */
function extractReferences(body: string, skillDir: string): string[] {
  const referencesDir = join(skillDir, "references");
  if (!existsSync(referencesDir)) return [];

  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const refs: string[] = [];

  for (const match of body.matchAll(linkPattern)) {
    const href = match[2];
    if (href.startsWith("references/") || href.startsWith("./references/")) {
      const filename = href.replace(/^\.?\/references\//, "");
      const fullPath = join(referencesDir, filename);
      // 路径遍历保护：确保在 skillDir 范围内
      if (fullPath.startsWith(skillDir) && existsSync(fullPath)) {
        refs.push(fullPath);
      }
    }
  }

  return refs;
}

/**
 * 安全读取 skill references 目录中的文件（级别 3）。
 * 带路径遍历保护。
 */
export function readSkillFile(skillDir: string, relativePath: string): string {
  const fullPath = resolve(join(skillDir, relativePath));
  if (!fullPath.startsWith(resolve(skillDir))) {
    throw new Error(`Path traversal detected: ${relativePath}`);
  }
  return readFileSync(fullPath, "utf-8");
}

/**
 * 把激活的 skill 转换为 ContextSlot，用于注入 system prompt。
 */
export function skillToContextSlot(skillDir: string): ContextSlot {
  const { meta, body } = loadSkillContent(skillDir);
  return {
    key: `skill:${meta.name}`,
    content: body,
    priority: 100,
  };
}
