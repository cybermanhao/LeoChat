// packages/law-kb-mcp/src/chunker.ts
import type { ChunkInput } from './types.js';

// Matches: 第一条, 第十条, 第两百零一条, etc.
const ARTICLE_RE = /第[零一二两三四五六七八九十百千]+条/g;
// Matches chapter headings: 第一章 xxx
const CHAPTER_RE = /第[零一二两三四五六七八九十百千]+章\s*[\S]*/;
// Clause sub-markers within a single article
const CLAUSE_RE = /[（(][一二三四五六七八九十]+[）)]|^[一二三四五六七八九十]+、/gm;

const MAX_CHUNK = 300;
const WINDOW = 200;

export function chunkLaw(lawTitle: string, content: string): ChunkInput[] {
  const matches = [...content.matchAll(ARTICLE_RE)];
  if (matches.length === 0) return fixedWindowChunks(lawTitle, content);

  const chunks: ChunkInput[] = [];
  let currentChapter = '';

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const start = match.index!;
    const end = matches[i + 1]?.index ?? content.length;
    const articleNumber = match[0];
    const articleContent = content.slice(start, end).trim();

    // Look backwards for the nearest chapter heading
    const before = content.slice(0, start);
    const chapterMatch = before.match(new RegExp(CHAPTER_RE, 'g'));
    if (chapterMatch) currentChapter = chapterMatch[chapterMatch.length - 1].trim();

    const hierarchyPath = currentChapter
      ? `${lawTitle} > ${currentChapter} > ${articleNumber}`
      : `${lawTitle} > ${articleNumber}`;

    if (articleContent.length <= MAX_CHUNK) {
      chunks.push({ content: articleContent, article_number: articleNumber, hierarchy_path: hierarchyPath });
    } else {
      // Split long article at clause markers
      const subChunks = splitAtClauses(articleContent, articleNumber, hierarchyPath);
      chunks.push(...subChunks);
    }
  }

  return chunks;
}

export function chunkUserDoc(filename: string, content: string): ChunkInput[] {
  // Detect structured legal text: ≥3 article markers → treat as law
  const articleCount = (content.match(ARTICLE_RE) || []).length;
  if (articleCount >= 3) {
    return chunkLaw(filename.replace(/\.[^.]+$/, ''), content);
  }
  return paragraphChunks(filename, content);
}

function splitAtClauses(
  articleContent: string,
  articleNumber: string,
  hierarchyPath: string
): ChunkInput[] {
  // Lookahead preserves clause markers at the start of each part
  const parts = articleContent.split(/(?=[（(][一二三四五六七八九十]+[）)])|(?=^[一二三四五六七八九十]+、)/m).filter(p => p.trim().length > 0);
  if (parts.length <= 1) {
    // No clause markers — use fixed window
    return fixedWindowChunks(hierarchyPath, articleContent).map(c => ({
      ...c,
      article_number: articleNumber,
      hierarchy_path: hierarchyPath,
    }));
  }
  return parts.map(part => ({
    content: part.trim(),
    article_number: articleNumber,
    hierarchy_path: hierarchyPath,
  }));
}

function paragraphChunks(filename: string, content: string): ChunkInput[] {
  const paragraphs = content.split(/\n{2,}/).filter(p => p.trim().length > 0);
  const chunks: ChunkInput[] = [];
  let buffer = '';
  let idx = 0;

  const flush = () => {
    if (buffer.trim()) {
      chunks.push({
        content: buffer.trim(),
        hierarchy_path: `${filename} > 第${idx + 1}段`,
      });
      idx++;
      buffer = '';
    }
  };

  for (const para of paragraphs) {
    if (buffer.length + para.length > 250) {
      flush();
    }
    // Split oversized single paragraph at sentence boundaries
    if (para.length > 250) {
      const sentences = para.split(/(?<=。|！|？)/);
      for (const s of sentences) {
        if (buffer.length + s.length > 250) flush();
        buffer += s;
      }
    } else {
      buffer += (buffer ? '\n' : '') + para;
    }
  }
  flush();
  return chunks;
}

function fixedWindowChunks(label: string, text: string): ChunkInput[] {
  const chunks: ChunkInput[] = [];
  let i = 0;
  let idx = 0;
  while (i < text.length) {
    chunks.push({
      content: text.slice(i, i + WINDOW),
      hierarchy_path: `${label} > chunk_${idx}`,
    });
    i += WINDOW;
    idx++;
  }
  return chunks;
}
