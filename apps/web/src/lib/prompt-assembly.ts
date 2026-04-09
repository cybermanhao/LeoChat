import type { ActivePrompt, CustomPrompt } from "../stores/prompt";

/**
 * 组装最终的系统提示词。
 *
 * 组装顺序：
 * 1. systemPrompt（基础指令）
 * 2. attachedMcpPrompts（已附加的 MCP 模板，按附加顺序）
 * 3. activePrompt（激活的自定义提示词）
 *
 * 各部分之间用 `\n\n` 分隔。
 * 如果没有任何有效内容，返回 undefined。
 */
export function assembleSystemPrompt(options: {
  systemPrompt: string;
  attachedMcpPrompts: string[];
  mcpPromptCache: Record<string, string>;
  activePrompt: ActivePrompt;
  customPrompts: CustomPrompt[];
}): string | undefined {
  const { systemPrompt, attachedMcpPrompts, mcpPromptCache, activePrompt, customPrompts } = options;
  const parts: string[] = [];

  // 1. 基础系统提示词
  if (systemPrompt.trim()) {
    parts.push(systemPrompt.trim());
  }

  // 2. 已附加的 MCP 模板（按附加顺序）
  for (const key of attachedMcpPrompts) {
    const content = mcpPromptCache[key];
    if (content) {
      parts.push(content);
    }
    // 如果 key 不在缓存中（服务器断开 / 尚未拉取），静默跳过
  }

  // 3. 激活的自定义提示词
  if (activePrompt?.type === "custom") {
    const custom = customPrompts.find((p) => p.id === activePrompt.id);
    if (custom?.content?.trim()) {
      parts.push(custom.content.trim());
    }
  }

  return parts.length > 0 ? parts.join("\n\n") : undefined;
}
