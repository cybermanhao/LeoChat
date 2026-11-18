/**
 * 指令文件（参考 dsh 的 context/agent-instructions；与 AGENTS.md 兼容）。
 *
 * - 用户全局指令链：$LEOCHAT_HOME/AGENTS.md（默认 ~/.leochat），然后是共享的 $LEOCHAT_AGENTS_HOME/AGENTS.md（默认 ~/.agents）
 * - 项目指令链：从项目根（含 .git 的目录）到工作目录，每一层依次加载 AGENTS.md、CLAUDE.md，再加载 AGENTS.local.md、CLAUDE.local.md
 * - 同一组候选里内容相同（去掉首尾空白后）的文件只加载一次；与全局文件重复的也折叠
 * - 字节预算：先丢弃较宽泛的整份文件，再截断最具体的文件；渲染结果绝不超过 maxBytes
 */
import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

export interface InstructionOptions {
  /** 工作目录；不给时只加载全局指令（例如 GUI 没有工作目录） */
  cwd?: string;
  env?: Record<string, string | undefined>;
  /** 渲染结果的上限（字节），dsh 默认 65536 */
  maxBytes?: number;
  /** 单个文件读入的上限（字节），dsh 默认 1 MiB */
  maxSourceBytes?: number;
  projectRootMarkers?: string[];
  instructionFileCandidates?: string[];
  localInstructionFileCandidates?: string[];
}

export interface InstructionFile {
  path: string;
  scope: "global" | "project";
  content: string;
}

export interface LoadedInstructions {
  /** 放进系统提示的文字；没有任何指令时为空字符串 */
  text: string;
  /** 实际渲染的文件，从宽泛到具体 */
  files: InstructionFile[];
  /** 因预算被整份丢弃的文件 */
  omitted: string[];
  /** 因预算被截断的文件 */
  truncated?: string;
}

export const DEFAULT_INSTRUCTION_BYTES = 65_536;
const DEFAULT_SOURCE_BYTES = 1_048_576;

export function leochatHome(env: Record<string, string | undefined> = process.env): string {
  return env.LEOCHAT_HOME || join(homedir(), ".leochat");
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function readCapped(path: string, cap: number): Promise<string | null> {
  try {
    const buf = await readFile(path);
    return buf.subarray(0, cap).toString("utf8");
  } catch {
    return null;
  }
}

/** 从 cwd 向上找项目根（含标记目录的那一层）；找不到时只用 cwd 本身 */
async function projectDirs(cwd: string, markers: string[]): Promise<string[]> {
  const start = resolve(cwd);
  const chain: string[] = [];
  for (let dir = start; ; dir = dirname(dir)) {
    chain.unshift(dir);
    for (const m of markers) if (await exists(join(dir, m))) return chain;
    if (dirname(dir) === dir) return [start];
  }
}

/** 发给模型的路径：家目录下的写成 ~/...，不把本机用户名之类的细节带出去 */
export function displayPath(path: string, home: string = homedir()): string {
  const norm = (x: string) => x.replace(/\\/g, "/").replace(/\/+$/, "");
  const p = norm(path);
  const h = norm(home);
  return h && p.toLowerCase().startsWith(h.toLowerCase() + "/") ? `~${p.slice(h.length)}` : p;
}
const render = (f: InstructionFile, body: string) => `<instructions path="${displayPath(f.path)}" scope="${f.scope}">\n${body}\n</instructions>`;
const HEADER =
  "The following instruction files come from the user (global) and from the project the work happens in. Follow them; more specific (later) files take precedence over broader (earlier) ones.\n\n";

export async function loadAgentInstructions(opts: InstructionOptions = {}): Promise<LoadedInstructions> {
  const env = opts.env ?? process.env;
  const maxBytes = opts.maxBytes ?? DEFAULT_INSTRUCTION_BYTES;
  const cap = opts.maxSourceBytes ?? DEFAULT_SOURCE_BYTES;
  const candidates = opts.instructionFileCandidates ?? ["AGENTS.md", "CLAUDE.md"];
  const locals = opts.localInstructionFileCandidates ?? ["AGENTS.local.md", "CLAUDE.local.md"];

  const files: InstructionFile[] = [];
  const seen = new Set<string>();
  const add = async (path: string, scope: InstructionFile["scope"], group: Set<string>) => {
    const content = await readCapped(path, cap);
    if (content === null) return;
    const key = content.trim();
    if (!key || group.has(key)) return; // 空文件，或与同组 / 全局文件重复
    group.add(key);
    if (seen.has(path)) return;
    seen.add(path);
    files.push({ path, scope, content: key });
  };

  // 全局链：harness home，然后共享 agents 根目录
  const globalGroup = new Set<string>();
  await add(join(leochatHome(env), "AGENTS.md"), "global", globalGroup);
  await add(join(env.LEOCHAT_AGENTS_HOME || join(homedir(), ".agents"), "AGENTS.md"), "global", globalGroup);

  // 项目链：从根到 cwd，每层先基础候选、再本地叠加
  if (opts.cwd) {
    for (const dir of await projectDirs(opts.cwd, opts.projectRootMarkers ?? [".git"])) {
      const base = new Set(globalGroup);
      for (const name of candidates) await add(join(dir, name), "project", base);
      const local = new Set<string>();
      for (const name of locals) await add(join(dir, name), "project", local);
    }
  }

  if (!files.length) return { text: "", files: [], omitted: [] };

  // 预算：先丢弃最宽泛的整份文件，再截断最具体的文件
  const enc = (s: string) => Buffer.byteLength(s, "utf8");
  let kept = [...files];
  const omitted: string[] = [];
  const total = (fs: InstructionFile[]) => enc(HEADER) + fs.reduce((n, f) => n + enc(render(f, f.content)) + 2, 0);
  while (kept.length > 1 && total(kept) > maxBytes) omitted.push(kept.shift()!.path);
  let truncated: string | undefined;
  if (total(kept) > maxBytes) {
    const last = kept[kept.length - 1]!;
    const notice = "\n[truncated: instruction budget exceeded]";
    const room = maxBytes - (total(kept) - enc(render(last, last.content))) - enc(render(last, "")) - enc(notice) - 2;
    let body = Buffer.from(last.content, "utf8").subarray(0, Math.max(0, room)).toString("utf8");
    while (body.endsWith("�")) body = body.slice(0, -1); // 不留下半个字符
    kept = [...kept.slice(0, -1), { ...last, content: body + notice }];
    truncated = last.path;
  }
  const text = HEADER + kept.map((f) => render(f, f.content)).join("\n\n");
  return { text, files: kept, omitted, ...(truncated ? { truncated } : {}) };
}

/** 把指令放在系统提示前面（没有指令时原样返回） */
export function withInstructions(system: string | undefined, instructions: LoadedInstructions): string | undefined {
  if (!instructions.text) return system;
  return system ? `${instructions.text}\n\n${system}` : instructions.text;
}
