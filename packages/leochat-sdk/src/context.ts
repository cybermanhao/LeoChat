import type { ContextSlot } from "./types";

/**
 * 组装最终 system prompt。
 *
 * 遵循 claude-code-sourcemap services/claude.ts formatSystemPromptWithContext 的权威格式：
 * 每个 slot 注入为 <context name="${key}">content</context> 标签，
 * 模型已针对此格式做过优化。
 *
 * Key 命名约定：
 *   skill:<name>     → skill 内容
 *   memory:<scope>   → 记忆系统（v1 预留，不实现）
 *   project:<name>   → 项目级上下文
 *
 * @param userPrompt 用户定义的 system prompt
 * @param slots 各来源的上下文槽（v1 只用 key + content）
 */
export function buildSystemPrompt(userPrompt: string, slots: ContextSlot[]): string {
  if (slots.length === 0) return userPrompt;

  const contextSection = [
    "\nAs you answer the user's questions, you can use the following context:",
    ...slots.map(({ key, content }) => `<context name="${key}">${content}</context>`),
  ].join("\n");

  return userPrompt + contextSection;
}
