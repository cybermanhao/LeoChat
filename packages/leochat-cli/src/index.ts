import { fileURLToPath } from "url";
import { Command } from "commander";
import { LeoAgent } from "@leochat/sdk";
import type { AgentResult } from "@leochat/sdk";
import { printChunk, printDone, printText } from "./stream-printer";
import { printToolCall, printToolResult, printToolSummary } from "./tool-printer";
import { runInteractive } from "./interactive";

const program = new Command();

program
  .name("leochat")
  .description("LeoChat CLI - run AI agents from the command line")
  .version("0.1.0");

// ─── 单次执行（默认命令）────────────────────────────────────────────

program
  .argument("[query]", "User message to send to the agent")
  .option("-c, --config <path>", "Path to MCP config JSON file")
  .option("-m, --model <model>", "Model override (e.g. anthropic/claude-sonnet-4-5)")
  .option("-s, --skill <name>", "Activate a specific skill by name")
  .option("--skills-dir <dir>", "Directory containing skill definitions")
  .option("--system-prompt <text>", "Override system prompt")
  .option("--max-turns <n>", "Maximum tool call rounds", "50")
  .option("--no-stream", "Wait for complete response before printing")
  .option("-o, --output <format>", "Output format: text (default) or json")
  .option("-i, --interactive", "Start interactive REPL mode")
  .action(async (query: string | undefined, opts) => {
    const agent = new LeoAgent();

    // 1. 加载配置
    if (opts.config) {
      agent.loadConfig(opts.config);
    }

    // 2. 模型覆盖
    if (opts.model) {
      agent.setModel(opts.model);
    }

    // 3. 系统 prompt 覆盖
    if (opts.systemPrompt) {
      agent.setSystemPrompt(opts.systemPrompt);
    }

    // 4. Skills
    if (opts.skillsDir) {
      agent.loadSkills(opts.skillsDir);
    }

    // 5. 工具调用输出（stderr，不污染 stdout 管道）
    if (opts.output !== "json") {
      agent.onToolCall((tc) => {
        printToolCall(tc.name, tc.arguments as Record<string, unknown>);
        return tc;
      });
      agent.onToolCalled((id, result) => {
        printToolResult(id);
        return result;
      });
    }

    // 6. 交互模式
    if (opts.interactive) {
      await runInteractive(agent);
      return;
    }

    // 7. 单次执行
    if (!query) {
      program.help();
      return;
    }

    let result: AgentResult;
    try {
      result = await agent.ainvoke({
        messages: query,
        skill: opts.skill,
      });
    } catch (e) {
      process.stderr.write(`\x1b[31mError: ${(e as Error).message}\x1b[0m\n`);
      process.exit(1);
      return;
    } finally {
      await agent.disconnect().catch(() => {});
    }

    // 8. 输出结果
    if (opts.output === "json") {
      printText(JSON.stringify({
        text: result.text,
        toolCalls: result.toolCalls,
        usage: result.usage,
      }, null, 2));
    } else {
      printChunk(result.text);
      printDone();
      printToolSummary(result.toolCalls);

      // 打印 token 统计到 stderr
      if (result.usage.input > 0 || result.usage.output > 0) {
        process.stderr.write(
          `\x1b[2m[tokens] in: ${result.usage.input} / out: ${result.usage.output}\x1b[0m\n`
        );
      }
    }
  });

// ─── check 子命令：验证配置 + 测试 MCP 连接 ──────────────────────────

program
  .command("check")
  .description("Validate config and test MCP server connections")
  .option("-c, --config <path>", "Path to MCP config JSON file")
  .option("--skills-dir <dir>", "Directory containing skill definitions")
  .action(async (opts) => {
    process.stderr.write("Checking configuration...\n\n");

    const agent = new LeoAgent();

    // 1. Config file
    if (opts.config) {
      try {
        agent.loadConfig(opts.config);
        process.stderr.write(`\x1b[32m✓\x1b[0m Config loaded: ${opts.config}\n`);
      } catch (e) {
        process.stderr.write(`\x1b[31m✗\x1b[0m Config error: ${(e as Error).message}\n`);
        process.exit(1);
      }
    } else {
      process.stderr.write(`\x1b[33m⚠\x1b[0m No config file specified (use --config)\n`);
    }

    // 2. LLM config
    const llm = agent.getLLMConfig();
    if (llm) {
      const hasKey = llm.apiKey && llm.apiKey.length > 0;
      const keyStatus = hasKey ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m";
      process.stderr.write(`${keyStatus} LLM: ${llm.provider} / ${llm.model}${hasKey ? "" : " (no API key)"}\n`);
    } else {
      process.stderr.write(`\x1b[33m⚠\x1b[0m No LLM configured\n`);
    }

    // 3. Skills
    if (opts.skillsDir) {
      agent.loadSkills(opts.skillsDir);
      const skills = agent.listSkills();
      if (skills.length > 0) {
        process.stderr.write(`\x1b[32m✓\x1b[0m Skills found: ${skills.map(s => s.name).join(", ")}\n`);
      } else {
        process.stderr.write(`\x1b[33m⚠\x1b[0m No skills found in: ${opts.skillsDir}\n`);
      }
    }

    // 4. MCP server connections
    process.stderr.write("\nTesting MCP server connections...\n");
    const results = await agent.checkConnections();

    if (results.length === 0) {
      process.stderr.write(`\x1b[33m⚠\x1b[0m No MCP servers configured\n`);
    } else {
      for (const r of results) {
        if (r.status === "connected") {
          process.stderr.write(`\x1b[32m✓\x1b[0m ${r.name} — ${r.tools} tool(s)\n`);
        } else {
          process.stderr.write(`\x1b[31m✗\x1b[0m ${r.name} — ${r.error}\n`);
        }
      }
    }

    await agent.disconnect().catch(() => {});
    process.stderr.write("\nDone.\n");
  });

export async function run(argv: string[] = process.argv): Promise<void> {
  await program.parseAsync(argv);
}

// Only auto-run when executed directly (ESM main module detection)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
