/**
 * 按需加载的 skill（参考 dsh packages/skill/tool-skill）。
 * - system prompt 里只放目录（名字 + 有长度上限的一句话说明），skill 集合不变时目录不变，不破坏前缀缓存
 * - 模型需要时调用 load_skill 读取完整指令
 * 这里只放和运行环境无关的部分；从磁盘读取 SKILL.md 的来源以后放在 @leochat/node。
 */
import { z } from "zod";
import { ToolError, defineTool } from "./tool";

export interface SkillMeta {
  name: string;
  description: string;
}

export interface SkillSource {
  list(): SkillMeta[] | Promise<SkillMeta[]>;
  /** 返回 skill 的完整指令；不存在时返回 null */
  load(name: string): string | null | Promise<string | null>;
}

/** 内存里的 skill 来源（测试、Workers 里打包进来的 skill） */
export function staticSkills(skills: Array<SkillMeta & { content: string }>): SkillSource {
  return {
    list: () => skills.map(({ name, description }) => ({ name, description })),
    load: (name) => skills.find((s) => s.name === name)?.content ?? null,
  };
}

/** 生成放进 system prompt 的 skill 目录。按名字排序，保证同一组 skill 生成的文字完全一样 */
export function skillCatalog(skills: SkillMeta[], opts: { descriptionMaxLength?: number; toolName?: string } = {}): string {
  if (skills.length === 0) return "";
  const max = opts.descriptionMaxLength ?? 200;
  const tool = opts.toolName ?? "load_skill";
  const lines = [...skills]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((s) => {
      const d = s.description.replace(/\s+/g, " ").trim();
      return `- ${s.name}: ${d.length > max ? `${d.slice(0, max - 1)}…` : d}`;
    });
  return [`Available skills (call the ${tool} tool with a skill name to read its full instructions before using it):`, ...lines].join("\n");
}

/** 模型调用的加载工具 */
export function loadSkillTool(source: SkillSource, opts: { name?: string } = {}) {
  return defineTool({
    name: opts.name ?? "load_skill",
    description: "Load the full instructions of a skill listed in the skills catalog. Call this before following a skill.",
    input: z.object({ name: z.string().min(1) }),
    async execute({ name }) {
      const content = await source.load(name);
      if (content === null) {
        const names = (await source.list()).map((s) => s.name).sort().join(", ");
        throw new ToolError(`Unknown skill: ${name}. Available skills: ${names || "(none)"}`);
      }
      return { content, data: { skill: name } };
    },
  });
}
