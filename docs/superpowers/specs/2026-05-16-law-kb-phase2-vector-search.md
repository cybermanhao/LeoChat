# leochat-for-law Phase 2：向量检索设计

> 日期：2026-05-16  
> 状态：已批准  
> 前置：Phase 1（FTS5 法规检索 + 知识库管理 UI）已完成

---

## 目标

在现有 FTS5 关键词检索基础上，加入 BGE-m3 语义向量检索，通过 RRF 融合提升法律 agent 的检索质量。优先服务法律 agent 场景，不追求通用文档 RAG。

---

## 1. 数据模型

在现有 `law.db`（SQLite）中新增两张表：

### `law_chunks`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | |
| `law_id` | INTEGER | → `laws.id` |
| `chunk_index` | INTEGER | 同一法规内的顺序编号 |
| `content` | TEXT | 条文正文，50–300 字 |
| `article_number` | TEXT | 如 "第十条" |
| `hierarchy_path` | TEXT | 如 "劳动合同法 > 第二章 劳动合同的订立 > 第十条" |
| `embedding` | BLOB | BGE-m3 float32 向量，1024 维，约 4KB/条 |
| `created_at` | TEXT | |

### `user_doc_chunks`

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | INTEGER PK | |
| `doc_id` | INTEGER | → `user_docs.id` |
| `chunk_index` | INTEGER | |
| `content` | TEXT | 150–250 字 |
| `hierarchy_path` | TEXT | 有结构时提取，无结构时为 "文件名 > chunk_N" |
| `embedding` | BLOB | BGE-m3 float32 向量 |
| `created_at` | TEXT | |

**不使用 LanceDB**：向量直接存 SQLite BLOB，余弦相似度在 JS 层计算。10 万 chunk ≈ 400MB，单机完全可接受，减少一个外部依赖。

---

## 2. 切片策略

### 2.1 法规文本切片器（`chunkLaw`）

输入：`laws` 表中已有的一条记录（`title` + `content`）

```
1. 按 /第[零一二三四五六七八九十百]+条/ 正则切分
   → 每个"第X条"及其正文 = 一个 chunk
2. 单条超 300 字 → 按款项标记再切：
   /[（(][一二三四五六七八九十]+[）)]/ 或 /[一二三四五六七八九十]+、/
3. hierarchy_path = "{law_title} > {chapter_title} > {article_number}"
   chapter_title 从切分前扫描最近一个 /第[X]章/ 提取
4. 无法识别结构时：200 字固定窗口，hierarchy_path = "{law_title} > chunk_{N}"
```

**触发时机**：`insertLaw()` 调用后自动异步生成（或首次向量检索时懒加载）

### 2.2 用户文档切片器（`chunkUserDoc`）

输入：`user_docs` 表中一条记录（`filename` + `content`）

```
1. 先跑法律结构检测：
   若 content 中 /第[X]条/ 出现次数 ≥ 3，走法规文本切片器
2. 否则走段落切片：
   - 按换行符/空行切段落
   - 累积段落到 200 字形成一个 chunk（不跨段落）
   - 超过 250 字的段落在中文句号处截断
3. hierarchy_path = "{filename} > 第{N}段"
```

**不做重叠**：法律条款语义独立，重叠引入噪音。

---

## 3. Embedding 方案

**模型**：BAAI/bge-m3（1024 维，中文法律文本效果优秀）  
**运行位置**：Hono 后端进程（Node.js），通过 `@xenova/transformers` 加载 ONNX  
**模型存储**：`process.env.LAW_KB_DIR ?? ~/.leochat-for-law/models/bge-m3/`  
**下载源**：`hf-mirror.com`（中国大陆可直达）  
**首次调用**：检测模型文件是否存在，缺失则自动下载，下载完成后离线可用  

新增模块：`packages/law-kb-mcp/src/embedder.ts`

```typescript
export async function getEmbedding(text: string): Promise<Float32Array>
export async function isModelReady(): Promise<boolean>
export async function downloadModel(onProgress: (pct: number) => void): Promise<void>
```

---

## 4. 向量检索与 RRF 融合

### 4.1 余弦相似度检索

从 SQLite 读取所有 `embedding` BLOB，在 JS 层计算余弦相似度，取 top-K。

首次性能预估：10 万条 chunk，JS 层批量计算约 200–500ms，可接受。  
后续优化（超过 50 万条时）：考虑 sqlite-vss 或分批次检索。

### 4.2 混合检索 + RRF 融合

```
query
  ├─ FTS5 MATCH → [{id, rank}] × top-10
  ├─ 向量余弦   → [{id, score}] × top-10
  └─ RRF 融合：score = Σ 1/(60 + rank_i)
               → 排序取 top-5 返回
```

RRF 常数 k=60（学术默认值，无需调参）。

### 4.3 返回结构扩展

`SearchResult` 新增字段：

```typescript
interface SearchResult {
  // 现有字段
  id: number;
  title: string;
  article_number: string | null;
  snippet: string;
  rank: number;
  source: 'law' | 'user_doc';
  // 新增
  hierarchy_path: string | null;
  chunk_id: number;
  similarity: number;       // 0–1，向量相似度
}
```

---

## 5. 新增 / 升级的 MCP 工具

| 工具 | 变化 | 说明 |
|------|------|------|
| `search_law` | 升级 | FTS5 → 混合检索；返回加 `hierarchy_path` |
| `search_user_doc` | 新增 | 在 `user_doc_chunks` 上做混合检索 |
| `list_knowledge_bases` | 扩展 | 返回加 `law_chunks_count`、`user_doc_chunks_count`、`model_ready` |
| `index_document` | 扩展 | 导入后自动触发切片 + embedding |

---

## 6. 新增文件

```
packages/law-kb-mcp/src/
├── embedder.ts               ← BGE-m3 加载、下载、推理
├── chunker.ts                ← chunkLaw + chunkUserDoc
├── vector-search.ts          ← 余弦检索 + RRF 融合
└── __tests__/
    ├── chunker.test.ts
    └── vector-search.test.ts
```

修改：
- `src/db.ts` — 加 `law_chunks` / `user_doc_chunks` 表 schema
- `src/search.ts` — `searchLaw` 升级为混合检索
- `src/indexer.ts` — `indexDocument` 导入后触发切片
- `src/index.ts` — 注册 `search_user_doc` 工具，更新 `list_knowledge_bases`

后端：
- `packages/server/src/routes/index.ts` — 新增 `/kb/model-status`、`/kb/download-model` 端点

---

## 7. UI 扩展（KnowledgeBase 页面）

- `LawKnowledgeTab` 加一行：`🤖 BGE-m3 模型 [未下载 / 下载中 X% / ✅ 已就绪]`
- 模型未就绪时，向量检索降级为纯 FTS5（graceful degradation）
- 文档导入后显示「已切片 N 段，向量化中…」进度

---

## 8. 范围外（本 Phase）

- PDF / Word 解析（仍只支持 .txt / .md）
- `search_case` 工具（判例向量库，Phase 3+）
- sqlite-vss 加速（50 万+ chunk 时再评估）
- 多语言文档（英文合同等）
