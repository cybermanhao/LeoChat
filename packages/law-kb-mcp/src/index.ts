// packages/law-kb-mcp/src/index.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchLaw, getLawArticle, searchUserDoc } from './search.js';
import { indexDocument, listKnowledgeBases, listLaws, migrateIfNeeded } from './indexer.js';
import { syncAllLaws } from './crawler/flk.js';

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

server.tool(
  'list_laws',
  '列出知识库中已收录的所有法律标题，可按分类筛选',
  {
    category: z.string().optional().describe('按分类筛选，如"法律"、"行政法规"、"司法解释"。为空则列出全部'),
  },
  async ({ category }) => {
    const laws = listLaws(category);
    if (laws.length === 0) {
      return { content: [{ type: 'text', text: '知识库为空，请先使用 sync_laws 同步法律数据' }] };
    }
    const grouped: Record<string, string[]> = {};
    for (const law of laws) {
      const cat = law.category ?? '其他';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(`  • ${law.title}${law.effective_date ? ` (${law.effective_date.slice(0, 10)})` : ''}`);
    }
    const lines = [`知识库共收录 ${laws.length} 部法律法规：\n`];
    for (const [cat, titles] of Object.entries(grouped)) {
      lines.push(`【${cat}】（${titles.length} 部）`);
      lines.push(...titles);
      lines.push('');
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  }
);

server.tool(
  'sync_laws',
  '从全国人大官网（flk.npc.gov.cn）同步法律法规到本地知识库',
  {
    keyword: z.string().optional().describe('按标题关键词筛选，如"民法典"、"劳动"。为空则同步全部（耗时较长）'),
  },
  async ({ keyword }) => {
    let synced = 0;
    let total = 0;
    try {
      synced = await syncAllLaws((fetched, t) => {
        total = t;
        if (fetched % 50 === 0) console.error(`[sync_laws] ${fetched}/${t}`);
      }, keyword);
    } catch (err) {
      return { content: [{ type: 'text', text: `❌ 同步失败: ${String(err)}` }] };
    }
    return {
      content: [{
        type: 'text',
        text: `✅ 同步完成，共导入 ${synced}${total ? `/${total}` : ''} 部法律法规。向量化在后台进行，可用 list_knowledge_bases 查看进度。`,
      }],
    };
  }
);

// Trigger migration for existing data (non-blocking)
migrateIfNeeded().catch(err => console.error('[migration]', err));

const transport = new StdioServerTransport();
await server.connect(transport);
