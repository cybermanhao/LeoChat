/**
 * 流式输出：把 delta 文本直接写到 stdout（不加换行）
 */
export function printChunk(text: string): void {
  process.stdout.write(text);
}

/**
 * 确保输出结束时有换行
 */
export function printDone(): void {
  process.stdout.write("\n");
}

/**
 * 把完整文本写到 stdout（非流式模式用）
 */
export function printText(text: string): void {
  process.stdout.write(text + "\n");
}
