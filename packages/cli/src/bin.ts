#!/usr/bin/env node
/** leochat 命令入口：第一次 Ctrl+C 暂停目标 / 中止运行，第二次立即退出 */
import { main } from "./cli";

const interrupt = new AbortController();
let interrupted = false;
process.on("SIGINT", () => {
  if (interrupted) process.exit(130);
  interrupted = true;
  process.stderr.write("\n[中断] 正在停止（再按一次 Ctrl+C 立即退出）…\n");
  interrupt.abort();
});

const code = await main(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
  cwd: process.cwd(),
  interrupt: interrupt.signal,
});
process.exit(code);
