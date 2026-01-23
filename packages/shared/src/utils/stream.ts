import type { StreamChunk, CodeBlockState } from "../types";

/**
 * Parse streaming text for code blocks and special markers
 */
export function parseStreamChunk(
  text: string,
  currentState: CodeBlockState | null
): { chunks: StreamChunk[]; state: CodeBlockState | null } {
  const chunks: StreamChunk[] = [];
  let state = currentState;

  // Check for code block markers
  const codeBlockStart = /```(\w+)?/g;
  const codeBlockEnd = /```\s*$/;

  if (state) {
    // We're inside a code block
    if (codeBlockEnd.test(text)) {
      state.content += text.replace(codeBlockEnd, "");
      state.isComplete = true;
      chunks.push({
        type: "code",
        content: state.content,
        metadata: { language: state.language },
        isComplete: true,
      });
      state = null;
    } else {
      state.content += text;
      chunks.push({
        type: "code",
        content: state.content,
        metadata: { language: state.language },
        isComplete: false,
      });
    }
  } else {
    // Check if starting a new code block
    const match = codeBlockStart.exec(text);
    if (match) {
      const beforeCode = text.slice(0, match.index);
      if (beforeCode.trim()) {
        chunks.push({
          type: "text",
          content: beforeCode,
          isComplete: true,
        });
      }
      state = {
        language: match[1] || "plaintext",
        content: text.slice(match.index + match[0].length),
        isComplete: false,
      };
      chunks.push({
        type: "code",
        content: state.content,
        metadata: { language: state.language },
        isComplete: false,
      });
    } else {
      chunks.push({
        type: "text",
        content: text,
        isComplete: true,
      });
    }
  }

  return { chunks, state };
}

/**
 * Detect special XML action tags in content
 */
export function parseActionTags(
  content: string
): { actions: Array<{ name: string; attributes: Record<string, string> }>; cleanContent: string } {
  const actionRegex = /<action\s+name="([^"]+)"([^/>]*)\s*\/>/g;
  const actions: Array<{ name: string; attributes: Record<string, string> }> = [];

  let cleanContent = content.replace(actionRegex, (_match, name, attrsStr) => {
    const attributes: Record<string, string> = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
      attributes[attrMatch[1]] = attrMatch[2];
    }
    actions.push({ name, attributes });
    return ""; // Remove from content
  });

  return { actions, cleanContent: cleanContent.trim() };
}

/**
 * Check if content contains incomplete special blocks
 */
export function hasIncompleteBlock(content: string): {
  type: "mermaid" | "table" | "code" | null;
  isIncomplete: boolean;
} {
  // Check for incomplete mermaid
  if (content.includes("```mermaid") && !content.match(/```mermaid[\s\S]*?```/)) {
    return { type: "mermaid", isIncomplete: true };
  }

  // Check for incomplete table (has <table> but no </table>)
  if (content.includes("<table") && !content.includes("</table>")) {
    return { type: "table", isIncomplete: true };
  }

  // Check for any incomplete code block
  const codeBlockStarts = (content.match(/```/g) || []).length;
  if (codeBlockStarts % 2 !== 0) {
    return { type: "code", isIncomplete: true };
  }

  return { type: null, isIncomplete: false };
}
