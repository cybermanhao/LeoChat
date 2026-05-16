import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchLaw, getLawArticle } from './search.js';
import { indexDocument, listKnowledgeBases } from './indexer.js';

const server = new McpServer({ name: 'law-kb-mcp', version: '1.0.0' });

server.tool(
  'search_law',
  '检索法律法规条文，返回相关法条列表及摘要片段',
  {
    query: z.string().describe('搜索关键词，如"劳动合同解除"或"违约责任"'),
    limit: z.number().int().min(1).max(50).optional().default(10),
  },
  async ({ query, limit }) => {
    const results = searchLaw(query, limit ?? 10);
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
  '将本地文件导入用户文档知识库（支持 .txt .md）',
  { file_path: z.string().describe('文件的绝对路径') },
  async ({ file_path }) => {
    const result = indexDocument(file_path);
    return {
      content: [{
        type: 'text',
        text: result.success
          ? `✅ 导入成功，文档 ID: ${result.doc_id}`
          : `❌ 导入失败: ${result.error}`,
      }],
    };
  }
);

server.tool(
  'list_knowledge_bases',
  '查看知识库状态：法律法规条数、用户文档条数',
  {},
  async () => {
    const status = listKnowledgeBases();
    return {
      content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
