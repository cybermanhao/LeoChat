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

export interface LawChunk {
  id: number;
  law_id: number;
  chunk_index: number;
  content: string;
  article_number: string | null;
  hierarchy_path: string | null;
  embedding: Buffer | null;
  created_at: string;
}

export interface UserDocChunk {
  id: number;
  doc_id: number;
  chunk_index: number;
  content: string;
  hierarchy_path: string | null;
  embedding: Buffer | null;
  created_at: string;
}

/** Input shape for chunker functions — no DB IDs yet */
export interface ChunkInput {
  content: string;
  article_number?: string;
  hierarchy_path?: string;
}

export interface Case {
  id: number;
  title: string;
  case_number: string | null;
  court: string | null;
  judgment_date: string | null;
  case_type: string | null;
  summary: string | null;
  content: string;
  source_url: string | null;
  created_at: string;
}

export interface InsertCaseParams {
  title: string;
  case_number?: string;
  court?: string;
  judgment_date?: string;
  case_type?: string;
  summary?: string;
  content: string;
  source_url?: string;
}

export interface SearchResult {
  id: number;
  title: string;
  article_number: string | null;
  snippet: string;
  rank: number;
  source: 'law' | 'user_doc' | 'case';
  hierarchy_path?: string | null;
  chunk_id?: number;
  similarity?: number;
  case_number?: string | null;
  court?: string | null;
  judgment_date?: string | null;
}

export interface KnowledgeBaseStatus {
  law_count: number;
  user_doc_count: number;
  case_count: number;
  law_chunks_count?: number;
  user_doc_chunks_count?: number;
  model_ready?: boolean;
  migration_progress?: number;
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
