// packages/law-kb-mcp/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchLaw, getLawArticle, searchUserDoc } from './search.js';
import { indexDocument, listKnowledgeBases, migrateIfNeeded } from './indexer.js';

const server = new McpServer({ name: 'law-kb-mcp', version: '2.0.0' });

server.tool(
  'search_law',
  '检索法律法规条文（语义 + 关键词混合检索），返回相关法条列表及摘要',
  {
    query: z.string().describe('搜索关键词或自然语言问题，如"劳动合同提前解除赔偿"'),
    limit: z.number().int().min(1).max(50).optional().default(10),
  },
  async ({ query, limit }) => {
    const results = await searchLaw(query, limit ?? 10);
    return {
      content: [{
        type: 'text',
        text: results.length === 0
          ? '未找到相关法条'
          : JSON.stringify(results, null, 2),
      }],
    };
  }
);

server.tool(
  'search_user_doc',
  '检索用户上传的文档（语义 + 关键词混合检索）',
  {
    query: z.string().describe('搜索关键词或问题'),
    limit: z.number().int().min(1).max(50).optional().default(10),
  },
  async ({ query, limit }) => {
    const results = await searchUserDoc(query, limit ?? 10);
    return {
      content: [{
        type: 'text',
        text: results.length === 0
          ? '未找到相关文档'
          : JSON.stringify(results, null, 2),
      }],
    };
  }
);

server.tool(
  'get_law_article',
  '根据 ID 获取法条全文（ID 来自 search_law 结果）',
  { id: z.number().int() },
  async ({ id }) => {
    const article = getLawArticle(id);
    return {
      content: [{
        type: 'text',
        text: article
          ? JSON.stringify(article, null, 2)
          : `未找到 ID 为 ${id} 的法条`,
      }],
    };
  }
);

server.tool(
  'index_document',
  '将本地文件导入用户文档知识库（支持 .txt .md），立即可搜索，向量化在后台完成',
  { file_path: z.string().describe('文件的绝对路径') },
  async ({ file_path }) => {
    const result = indexDocument(file_path);
    return {
      content: [{
        type: 'text',
        text: result.success
          ? `✅ 导入成功，文档 ID: ${result.doc_id}，向量化在后台进行`
          : `❌ 导入失败: ${result.error}`,
      }],
    };
  }
);

server.tool(
  'list_knowledge_bases',
  '查看知识库状态：法律法规、用户文档条数、向量化进度、模型就绪状态',
  {},
  async () => {
    const status = await listKnowledgeBases();
    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
    };
  }
);

// Trigger migration for existing data (non-blocking)
migrateIfNeeded().catch(err => console.error('[migration]', err));

const transport = new StdioServerTransport();
await server.connect(transport);
