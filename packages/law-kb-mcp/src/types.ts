// packages/law-kb-mcp/src/types.ts

export interface LawArticle {
  id: number;
  title: string;
  article_number: string | null;
  content: string;
  category: string | null;
  effective_date: string | null;
  source_url: string | null;
  created_at: string;
}

export interface UserDoc {
  id: number;
  filename: string;
  content: string;
  file_path: string | null;
  created_at: string;
}

export interface SearchResult {
  id: number;
  title: string;
  article_number: string | null;
  snippet: string;
  rank: number;
  source: 'law' | 'user_doc';
}

export interface KnowledgeBaseStatus {
  law_count: number;
  user_doc_count: number;
}

export interface IndexResult {
  success: boolean;
  doc_id?: number;
  error?: string;
}

export interface InsertLawParams {
  title: string;
  article_number?: string;
  content: string;
  category?: string;
  effective_date?: string;
  source_url?: string;
}
