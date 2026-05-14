// packages/law-kb-mcp/src/search.ts
import { getDb } from './db.js';
import type { LawArticle, SearchResult } from './types.js';

export function searchLaw(query: string, limit: number): SearchResult[] {
  const db = getDb();
  // Sanitize FTS5 special characters to prevent syntax errors
  const safe = query.replace(/["'*]/g, ' ').trim();
  if (!safe) return [];

  try {
    // Use trigram-style matching: split into characters for Chinese text support
    // Wrap each token in quotes for FTS5 phrase search, fall back to LIKE if FTS returns nothing
    const ftsQuery = safe.split(/\s+/).map(t => `"${t}"`).join(' OR ');
    const rows = db.prepare(`
      SELECT
        l.id,
        l.title,
        l.article_number,
        snippet(laws_fts, 1, '【', '】', '...', 32) AS snippet,
        laws_fts.rank
      FROM laws_fts
      JOIN laws l ON l.id = laws_fts.rowid
      WHERE laws_fts MATCH ?
      ORDER BY laws_fts.rank
      LIMIT ?
    `).all(ftsQuery, limit) as Array<{
      id: number;
      title: string;
      article_number: string | null;
      snippet: string;
      rank: number;
    }>;

    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        article_number: r.article_number,
        snippet: r.snippet,
        rank: r.rank,
        source: 'law' as const,
      }));
    }

    // Fallback: LIKE search for Chinese text (FTS5 unicode61 may not tokenize CJK well)
    const likePattern = `%${safe}%`;
    const likeRows = db.prepare(`
      SELECT
        id,
        title,
        article_number,
        substr(content, 1, 100) AS snippet,
        0 AS rank
      FROM laws
      WHERE title LIKE ? OR content LIKE ?
      LIMIT ?
    `).all(likePattern, likePattern, limit) as Array<{
      id: number;
      title: string;
      article_number: string | null;
      snippet: string;
      rank: number;
    }>;

    return likeRows.map((r) => ({
      id: r.id,
      title: r.title,
      article_number: r.article_number,
      snippet: r.snippet,
      rank: r.rank,
      source: 'law' as const,
    }));
  } catch {
    return [];
  }
}

export function getLawArticle(id: number): LawArticle | null {
  const db = getDb();
  const result = db.prepare('SELECT * FROM laws WHERE id = ?').get(id);
  return result !== undefined ? (result as LawArticle) : null;
}
