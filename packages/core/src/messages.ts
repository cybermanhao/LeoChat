/** 消息相关的小工具 */
import type { Block, ImageBlock, Message, TextBlock } from "./blocks";

/** 只用 Web 标准 API 生成 ID（Workers、浏览器、Node 18+ 都有 crypto.randomUUID） */
export function newId(prefix = ""): string {
  return prefix + crypto.randomUUID();
}

export function userMessage(content: string | Array<TextBlock | ImageBlock | Block>, id = newId("msg_")): Message {
  return {
    id,
    role: "user",
    content: typeof content === "string" ? [{ type: "text", text: content }] : content,
  };
}

export function systemMessage(text: string, id = newId("msg_")): Message {
  return { id, role: "system", content: [{ type: "text", text }] };
}

/** 拼出一条消息里所有 text 块的文字 */
export function textOf(message: Message): string {
  return message.content
    .filter((b): b is TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
