import * as readline from "readline";
import type { LeoAgent, AgentResult } from "@leochat/sdk";
import { printChunk, printDone } from "./stream-printer";
import { printToolCall, printToolResult } from "./tool-printer";

/**
 * 启动交互式 REPL 模式。
 * history 在多轮之间自动传递。
 * 输入 /exit 或 Ctrl+C 退出。
 */
export async function runInteractive(agent: LeoAgent): Promise<void> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,  // prompt 到 stderr，不污染 stdout
    terminal: true,
  });

  // 注册工具调用打印钩子
  agent.onToolCall((toolCall) => {
    printToolCall(toolCall.name, toolCall.arguments as Record<string, unknown>);
    return toolCall;
  });
  agent.onToolCalled((id, result) => {
    printToolResult(id);
    return result;
  });

  let history: AgentResult["history"] = [];

  process.stderr.write('\x1b[36mLeoChat Interactive\x1b[0m  (type /exit to quit)\n\n');

  const prompt = () => rl.question("\x1b[1m> \x1b[0m", handleInput);

  const handleInput = async (input: string) => {
    const trimmed = input.trim();

    if (!trimmed) {
      prompt();
      return;
    }

    if (trimmed === "/exit" || trimmed === "/quit") {
      process.stderr.write("Bye.\n");
      rl.close();
      await agent.disconnect();
      return;
    }

    try {
      const result = await agent.ainvoke({
        messages: trimmed,
        history: history.length > 0 ? history : undefined,
      });

      // 输出文本（流式 chunk 已在 SDK 内部通过 onToolCall 打印）
      printChunk(result.text);
      printDone();

      history = result.history;
    } catch (e) {
      process.stderr.write(`\x1b[31mError: ${(e as Error).message}\x1b[0m\n`);
    }

    prompt();
  };

  prompt();

  // 等待 rl 关闭
  await new Promise<void>((resolve) => rl.on("close", resolve));
}
