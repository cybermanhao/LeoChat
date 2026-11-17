/**
 * LeoChat 命令行（harness 第一期的命令行外壳，设计文档 docs/superpowers/specs/2026-11-17-harness-design.md）。
 *
 *   leochat goal "<目标>"            创建目标并一轮接一轮推进，直到完成 / 卡住 / 暂停
 *   leochat goal --resume <会话 id>   恢复暂停或卡住的目标（--extra-rounds N 先加轮数）
 *   leochat goal --status <会话 id>   查看目标
 *   leochat chat "<消息>"            发一条消息，跑到停
 *   leochat list                     列出会话
 *
 * 输出约定（便于脚本使用）：模型的回复文字写到 stdout；轮次、工具调用、目标状态等进度写到 stderr。
 * 退出码：0 完成，1 出错，2 目标卡住，3 被暂停 / 中止，64 用法错误。
 * 会话保存在 --dir（默认 ./.leochat）下，每个会话一份 JSONL，和 GUI 的格式相同。
 */
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import {
  createCompactor,
  goalController,
  run,
  runGoal,
  stepCount,
  userMessage,
  type AgentEvent,
  type AnyTool,
  type Goal,
  type Provider,
  type ToolSource,
} from "@leochat/core";
import { deepseek } from "@leochat/deepseek";
import { conversationLog, stdioMcpTools, type ConversationLog } from "@leochat/node";

export const EXIT = { ok: 0, error: 1, blocked: 2, stopped: 3, usage: 64 } as const;

export interface CliIO {
  stdout: { write(s: string): unknown };
  stderr: { write(s: string): unknown };
  env: Record<string, string | undefined>;
  cwd: string;
  /** 第一次中断（Ctrl+C）：暂停目标 / 中止运行 */
  interrupt?: AbortSignal;
  /** 测试注入：不传则用 DEEPSEEK_API_KEY 创建 DeepSeek provider */
  provider?: Provider;
}

const USAGE = `用法:
  leochat goal "<目标>" [--max-rounds N] [--continue <会话id>]
  leochat goal --resume <会话id> [--extra-rounds N]
  leochat goal --status <会话id>
  leochat chat "<消息>" [--continue <会话id>]
  leochat list

通用选项:
  --dir <目录>        会话保存位置（默认 ./.leochat）
  --mcp <文件>        MCP 配置（{"mcpServers": {"名字": {"command", "args", "env"}}}），stdio 服务作为工具
  --model <id>        模型（默认 deepseek-flash）
  --web-search        打开 DeepSeek 联网搜索
  --system <文字>     系统提示
  --max-steps N       每次运行（目标的每一轮）最多几步（默认 20）
  -q, --quiet         不输出进度（stderr）

环境变量: DEEPSEEK_API_KEY（可用 node --env-file=.env 加载）
目标轮次无人值守：需要审批的工具一律拒绝。`;

const PHASE: Record<Goal["phase"], string> = { active: "进行中", paused: "已暂停", blocked: "卡住了", complete: "已完成" };

interface McpConfig {
  mcpServers?: Record<string, { command: string; args?: string[]; env?: Record<string, string>; cwd?: string }>;
}

async function loadMcpTools(file: string, cwd: string): Promise<ToolSource[]> {
  const raw = JSON.parse(await readFile(resolve(cwd, file), "utf8")) as McpConfig;
  const servers = Object.entries(raw.mcpServers ?? {});
  return servers.map(([name, s]) =>
    stdioMcpTools({
      command: s.command,
      ...(s.args ? { args: s.args } : {}),
      ...(s.env ? { env: s.env } : {}),
      ...(s.cwd ? { cwd: resolve(cwd, s.cwd) } : {}),
      // 多个服务时加前缀避免重名
      ...(servers.length > 1 ? { prefix: `${name}__` } : {}),
      stderr: "ignore",
    }),
  );
}

/** 把事件渲染成终端输出：回复文字到 stdout，进度到 stderr */
function printer(io: CliIO, quiet: boolean) {
  const progress = (s: string) => {
    if (!quiet) io.stderr.write(s + "\n");
  };
  let atLineStart = true;
  const out = (s: string) => {
    io.stdout.write(s);
    if (s) atLineStart = s.endsWith("\n");
  };
  const endLine = () => {
    if (!atLineStart) out("\n");
  };
  return {
    progress,
    event(e: AgentEvent) {
      switch (e.type) {
        case "block_delta":
          if (e.delta.kind === "text") out(e.delta.text);
          break;
        case "step_end":
          endLine();
          break;
        case "tool_start":
          endLine();
          progress(`[工具] ${e.name} ${JSON.stringify(e.input ?? {}).slice(0, 120)}`);
          break;
        case "tool_end":
          progress(`[工具] ${e.ok ? "✓" : "✗"} ${e.ms}ms${e.ok ? "" : " " + JSON.stringify(e.output.content).slice(0, 160)}`);
          break;
        case "retry":
          progress(`[重试] 第 ${e.attempt} 次，${e.delayMs}ms 后（${e.error.kind}）`);
          break;
        case "compaction":
          progress(`[压缩] ${e.info.kind}，约释放 ${e.info.estimatedTokensFreed} tokens`);
          break;
        case "custom":
          if (e.name === "goal_round") {
            const { round } = e.data as { round: number };
            endLine();
            progress(`\n── 目标第 ${round} 轮 ──`);
          } else if (e.name === "goal" && e.data) {
            const g = e.data as Goal;
            if (g.phase !== "active") progress(`[目标] ${PHASE[g.phase]}${g.blocker ? `：${g.blocker.reason}` : ""}`);
          }
          break;
        case "error":
          endLine();
          progress(`[错误] ${e.error.kind}: ${e.error.message}`);
          break;
      }
    },
    endLine,
  };
}

export async function main(argv: string[], io: CliIO): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        dir: { type: "string" },
        mcp: { type: "string" },
        model: { type: "string" },
        "web-search": { type: "boolean" },
        system: { type: "string" },
        "max-steps": { type: "string" },
        "max-rounds": { type: "string" },
        "extra-rounds": { type: "string" },
        continue: { type: "string" },
        resume: { type: "string" },
        status: { type: "string" },
        quiet: { type: "boolean", short: "q" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (e) {
    io.stderr.write(`${e instanceof Error ? e.message : String(e)}\n\n${USAGE}\n`);
    return EXIT.usage;
  }
  const { values: opt, positionals } = parsed;
  const [command, ...rest] = positionals;
  if (opt.help || !command) {
    io.stderr.write(USAGE + "\n");
    return opt.help ? EXIT.ok : EXIT.usage;
  }
  const int = (v: string | undefined, name: string): number | undefined => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < 1) throw new UsageError(`--${name} 需要正整数`);
    return n;
  };

  try {
    const log = await conversationLog(join(resolve(io.cwd, opt.dir ?? ".leochat"), "conversations"));
    if (command === "list") {
      for (const c of await log.list()) io.stdout.write(`${c.id}\t${new Date(c.updatedAt).toISOString()}\t${c.title}\n`);
      return EXIT.ok;
    }
    if (command === "goal" && opt.status) return await goalStatus(log, opt.status, io);
    if (command !== "goal" && command !== "chat") throw new UsageError(`未知命令: ${command}`);

    const text = rest.join(" ").trim();
    if (command === "chat" && !text) throw new UsageError("chat 需要消息内容");
    if (command === "goal" && !text && !opt.resume) throw new UsageError("goal 需要目标内容，或用 --resume <会话id>");

    const provider = io.provider ?? makeProvider(io.env);
    const tools: Array<AnyTool | ToolSource> = opt.mcp ? await loadMcpTools(opt.mcp, io.cwd) : [];
    const runOptions = {
      provider,
      model: opt.model ?? "deepseek-flash",
      ...(opt.system ? { system: opt.system } : {}),
      ...(opt["web-search"] ? { serverTools: ["web_search" as const] } : {}),
      tools,
      compactor: createCompactor(),
      stopWhen: stepCount(int(opt["max-steps"], "max-steps") ?? 20),
      ...(io.interrupt ? { signal: io.interrupt } : {}),
    };
    const p = printer(io, opt.quiet ?? false);

    // 会话：--continue / --resume 用已有的，否则新建
    const existing = opt.resume ?? opt.continue;
    let convId: string;
    if (existing) {
      if (!(await log.load(existing))) throw new UsageError(`找不到会话 ${existing}`);
      convId = existing;
    } else {
      convId = (await log.create(command === "goal" ? `目标：${text.slice(0, 36)}` : text.slice(0, 40))).id;
    }
    p.progress(`[会话] ${convId}`);

    if (command === "chat") {
      const conv = (await log.load(convId))!;
      const message = userMessage(text);
      await log.append(convId, { kind: "append", message });
      const handle = run({
        ...runOptions,
        messages: [...conv.transcript, message],
        approval: { policy: "never", neverMessage: "This tool needs approval, which the command line cannot ask for, so it was not run." },
        persist: log.persistFor(convId),
      });
      for await (const e of handle) p.event(e);
      const r = await handle.result;
      p.endLine();
      return r.reason === "error" || r.reason === "refusal" ? EXIT.error : r.reason === "aborted" ? EXIT.stopped : EXIT.ok;
    }

    // goal
    const goals = await goalController(log.goalStore(convId));
    if (opt.resume) {
      let g = goals.get();
      if (!g) throw new UsageError("这个会话没有目标");
      const extra = int(opt["extra-rounds"], "extra-rounds");
      if (extra) g = await goals.edit({ id: g.id, revision: g.revision }, { maxRounds: Math.max(g.maxRounds, g.roundsStarted) + extra });
      if (g.phase === "paused" || g.phase === "blocked") g = await goals.resume({ id: g.id, revision: g.revision });
      if (g.phase !== "active") throw new UsageError(`目标${PHASE[g.phase]}，不能继续`);
    } else {
      const maxRounds = int(opt["max-rounds"], "max-rounds");
      await goals.create({ objective: text, ...(maxRounds ? { maxRounds } : {}) });
    }
    const g0 = goals.get()!;
    p.progress(`[目标] ${g0.objective}（第 ${g0.roundsStarted}/${g0.maxRounds} 轮起）`);

    const conv = (await log.load(convId))!;
    const { signal: _signal, ...goalRunOptions } = runOptions;
    const handle = runGoal({ ...goalRunOptions, messages: conv.transcript, goals, persist: log.persistFor(convId) });
    io.interrupt?.addEventListener("abort", () => handle.stop("pause"), { once: true });
    for await (const e of handle) p.event(e);
    const r = await handle.result;
    p.endLine();
    p.progress(`[目标] 结束：${r.reason}，本次 ${r.rounds} 轮；继续用 leochat goal --resume ${convId}`);
    return r.reason === "complete" ? EXIT.ok : r.reason === "blocked" ? EXIT.blocked : r.reason === "error" ? EXIT.error : EXIT.stopped;
  } catch (e) {
    if (e instanceof UsageError) {
      io.stderr.write(`${e.message}\n\n${USAGE}\n`);
      return EXIT.usage;
    }
    io.stderr.write(`[错误] ${e instanceof Error ? e.message : String(e)}\n`);
    return EXIT.error;
  }
}

class UsageError extends Error {}

function makeProvider(env: Record<string, string | undefined>): Provider {
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new UsageError("没有设置 DEEPSEEK_API_KEY（可以 export，或用 node --env-file=.env 运行）");
  return deepseek({ apiKey, ...(env.DEEPSEEK_BASE_URL ? { baseURL: env.DEEPSEEK_BASE_URL } : {}) });
}

async function goalStatus(log: ConversationLog, id: string, io: CliIO): Promise<number> {
  const conv = await log.load(id);
  if (!conv) {
    io.stderr.write(`找不到会话 ${id}\n`);
    return EXIT.usage;
  }
  const g = conv.goal;
  if (!g) {
    io.stdout.write("没有目标\n");
    return EXIT.ok;
  }
  io.stdout.write(
    `${PHASE[g.phase]}\t第 ${g.roundsStarted}/${g.maxRounds} 轮\t${g.objective}${g.blocker ? `\n卡住原因（${g.blocker.code}）：${g.blocker.reason}` : ""}\n`,
  );
  return EXIT.ok;
}
