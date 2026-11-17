/** 消息文本里的 <card> 卡片标签解析结果 */
export interface CardData {
  title?: string;
  description?: string;
  image?: string;
  link?: string;
  linkText?: string;
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
 * Parse card tags from content
 * Supports both single <card /> tags and grouped <cards> containers
 *
 * Single card: <card title="..." description="..." image="..." link="..." linkText="..." />
 * Card group: <cards columns="2"><card ... /><card ... /></cards>
 */
export function parseCardTags(
  content: string
): { cards: CardData[]; columns: number; cleanContent: string } {
  const cards: CardData[] = [];
  let columns = 2; // 默认两栏

  // 先检查是否有 <cards> 容器
  const cardsContainerRegex = /<cards(?:\s+columns="(\d+)")?\s*>([\s\S]*?)<\/cards>/g;
  let cleanContent = content.replace(cardsContainerRegex, (_match, cols, innerContent) => {
    if (cols) {
      columns = Math.min(Math.max(parseInt(cols, 10), 1), 3); // 限制 1-3 列
    }
    // 解析容器内的 card 标签
    const cardRegex = /<card\s+([^/>]*)\s*\/>/g;
    let cardMatch;
    while ((cardMatch = cardRegex.exec(innerContent)) !== null) {
      const card = parseCardAttributes(cardMatch[1]);
      if (card.title || card.image) {
        cards.push(card);
      }
    }
    return "";
  });

  // 再解析独立的 <card /> 标签
  const singleCardRegex = /<card\s+([^/>]*)\s*\/>/g;
  cleanContent = cleanContent.replace(singleCardRegex, (_match, attrsStr) => {
    const card = parseCardAttributes(attrsStr);
    if (card.title || card.image) {
      cards.push(card);
    }
    return "";
  });

  return { cards, columns, cleanContent: cleanContent.trim() };
}

/**
 * Parse card attributes from attribute string
 */
function parseCardAttributes(attrsStr: string): CardData {
  const card: CardData = {};
  // Support double quotes, single quotes, and unquoted values
  const attrRegex = /(\w+)=(?:"([^"]*)"|'([^']*)'|([^\s>]*))/g;
  let attrMatch;
  while ((attrMatch = attrRegex.exec(attrsStr)) !== null) {
    const key = attrMatch[1] as keyof CardData;
    const value = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? "";
    if (["title", "description", "image", "link", "linkText"].includes(key)) {
      card[key] = value;
    }
  }
  return card;
}
