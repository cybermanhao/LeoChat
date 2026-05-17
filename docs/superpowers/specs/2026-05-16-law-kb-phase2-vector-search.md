# leochat-for-law Phase 2：向量检索设计

> 日期：2026-05-16  
> 版本：v2（审阅后修订）  
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

约束：`UNIQUE(law_id, chunk_index)` — 防止重试时产生重复 embedding。

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

约束：`UNIQUE(doc_id, chunk_index)`

**不使用 LanceDB**：向量直接存 SQLite BLOB，余弦相似度在 JS 层计算。10 万 chunk ≈ 400MB，在缓存策略下单机可接受（见第 4 节性能预算）。

### 级联删除

`db.ts` 需补充：
- `deleteLaw(id)` → 先 `DELETE FROM law_chunks WHERE law_id = ?`
- `deleteUserDoc(id)` → 先 `DELETE FROM user_doc_chunks WHERE doc_id = ?`
- 或在 schema 中加 `ON DELETE CASCADE`（推荐，自动处理）

---

## 2. 切片策略

### 2.1 法规文本切片器（`chunkLaw`）

输入：`laws` 表中一条记录（`title` + `content`）

```
1. 按 /第[零一二两三四五六七八九十百千]+条/ 切分
   → 每个"第X条"及其正文 = 一个 chunk
2. 单条超 300 字 → 按款项标记再切：
   /[（(][一二三四五六七八九十]+[）)]/ 或 /[一二三四五六七八九十]+、/
3. hierarchy_path = "{law_title} > {chapter_title} > {article_number}"
   chapter_title 从切分前扫描最近一个 /第[X]章/ 提取
4. 无法识别结构时：200 字固定窗口，hierarchy_path = "{law_title} > chunk_{N}"
```

正则说明：`两` 字已纳入字符集，覆盖"第两百条"等写法。

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

**模型**：BAAI/bge-m3 **int8 量化版**（约 150MB，原始版 570MB，中文法律文本精度损失可忽略）  
**运行位置**：Hono 后端进程（Node.js），通过 `@xenova/transformers` 加载 ONNX  
**模型存储**：`process.env.LAW_KB_DIR ?? ~/.leochat-for-law/models/bge-m3/`  
**下载源**：`hf-mirror.com`（中国大陆可直达）  
**首次调用**：检测模型文件是否存在，缺失则自动下载，下载完成后离线可用  

新增模块：`packages/law-kb-mcp/src/embedder.ts`

```typescript
// BGE-m3 dense retrieval 模式下 query/document 使用相同编码
// （BGE-m3 设计上已去掉 instruction prefix 要求，与 BGE-v1.5 不同）
// mode 参数保留作为 API 文档意图和未来扩展用，当前实现不做区分
export async function getEmbedding(
  text: string,
  mode: 'query' | 'document' = 'document'
): Promise<Float32Array>

export async function isModelReady(): Promise<boolean>
export async function downloadModel(onProgress: (pct: number) => void): Promise<void>
```

**并发控制**：embedding 生成通过内部队列串行执行（每次一个 ONNX 推理任务），防止批量导入时 OOM。队列实现在 `embedder.ts` 内部，调用方无感知。

---

## 4. 向量检索与 RRF 融合

### 4.1 Embedding 内存缓存策略

全量加载的 I/O 成本不可忽视：10 万条 × 4KB = 400MB，SQLite 顺序读预计 3–10 秒。

**缓存策略**：
- 进程启动后**懒加载**：首次检索时一次性读入所有 embedding 到内存 `Float32Array[]`
- 之后检索直接读内存，不再访问磁盘
- 新增 chunk 时追加到内存缓存，不触发全量重读
- 进程重启时重新加载（后端服务通常长期运行，重启代价可接受）

**性能预算**：

| 阶段 | 预计耗时 | 可接受上限 |
|------|---------|----------|
| 首次冷启动（读盘 + 缓存） | 3–10 秒 | 15 秒 |
| 缓存就绪后单次检索（计算） | 50–200ms | 500ms |
| Embedding 生成（每个 chunk） | 200–500ms | 1 秒 |

超过 50 万条 chunk 时重新评估（考虑 sqlite-vss 或分批次检索）。

### 4.2 FTS5 检索范围变更

**重要行为变更**：现有 `searchLaw` 搜索的是 `laws.content`（整条法规全文），升级后改为搜 `law_chunks.content`（单条条文）。

影响：rank 语义从"文档级相关度"变为"条文级相关度"，结果更精准，但需要在 `search.ts` 中同步更新 FTS5 查询 target。

### 4.3 混合检索 + RRF 融合

```
query
  ├─ FTS5 MATCH law_chunks → [{chunk_id, rank}] × top-10
  ├─ 向量余弦（内存缓存）  → [{chunk_id, score}] × top-10
  └─ RRF 融合：score = Σ 1/(60 + rank_i)
               → 排序取 top-5，join law_chunks + laws 获取完整 metadata
```

RRF 常数 k=60（学术默认值）。

### 4.4 返回结构扩展

```typescript
interface SearchResult {
  id: number;           // law.id 或 user_doc.id
  title: string;
  article_number: string | null;
  snippet: string;
  rank: number;
  source: 'law' | 'user_doc';
  // 新增
  hierarchy_path: string | null;
  chunk_id: number;
  similarity: number;   // 0–1，向量余弦相似度
}
```

---

## 5. 存量数据迁移

Phase 2 上线时，`laws` 和 `user_docs` 表中已有数据，但 `*_chunks` 表为空。

**策略：懒加载迁移**
- 首次调用 `searchLaw` 或 `searchUserDoc` 时检测 `law_chunks` 是否为空
- 为空则触发后台批量切片 + embedding（串行队列，不阻塞检索响应）
- 检索在迁移完成前降级为纯 FTS5，迁移完成后自动切换混合检索
- `list_knowledge_bases` 返回 `{ chunks_indexed: N, chunks_total: M, migration_progress: 0.0–1.0 }`

UI 在迁移期间显示「向量索引构建中 X%，当前使用关键词检索」。

---

## 6. `index_document` 工具的同步/异步语义

**选择：立即返回 + 后台 embedding**

工具调用流程：
```
1. 写入 user_docs 表（同步，快）→ 立即返回 { success: true, doc_id: N }
2. 切片写入 user_doc_chunks（同步，快）→ embedding = NULL
3. 后台队列生成 embedding（异步，慢）→ 逐条更新 embedding 字段
```

前端 `LawKnowledgeTab` 在导入后显示「已切片 N 段，向量化中…」，轮询 `/kb/status` 的 `chunks_indexed` 字段确认完成。

在 embedding 完成前，该文档可通过 FTS5 检索到（降级），embedding 就绪后自动参与向量检索。

---

## 7. 新增 / 升级的 MCP 工具

| 工具 | 变化 | 说明 |
|------|------|------|
| `search_law` | 升级 | 搜索目标改为 `law_chunks`；FTS5 → 混合检索；返回加 `hierarchy_path` |
| `search_user_doc` | 新增 | 在 `user_doc_chunks` 上做混合检索 |
| `list_knowledge_bases` | 扩展 | 返回加 `law_chunks_count`、`user_doc_chunks_count`、`model_ready`、`migration_progress` |
| `index_document` | 扩展 | 导入后立即切片，后台异步 embedding |

---

## 8. 新增文件

```
packages/law-kb-mcp/src/
├── embedder.ts               ← BGE-m3 加载、下载、推理、内部队列
├── chunker.ts                ← chunkLaw + chunkUserDoc
├── vector-search.ts          ← 内存缓存、余弦检索、RRF 融合
└── __tests__/
    ├── chunker.test.ts
    └── vector-search.test.ts
```

修改：
- `src/db.ts` — 加 `law_chunks` / `user_doc_chunks` 表 schema（含 UNIQUE 约束、ON DELETE CASCADE）
- `src/search.ts` — `searchLaw` 升级为混合检索，FTS5 target 改为 `law_chunks`
- `src/indexer.ts` — `indexDocument` 导入后立即切片，触发异步 embedding 队列
- `src/index.ts` — 注册 `search_user_doc`，更新 `list_knowledge_bases`

后端（`packages/server/src/routes/index.ts`）：
- 新增 `GET /kb/model-status` — 返回模型是否就绪、下载进度
- 新增 `POST /kb/download-model` — 触发模型下载

---

## 9. UI 扩展（KnowledgeBase 页面）

`LawKnowledgeTab` 新增状态行：
- `🤖 BGE-m3 模型` — 未下载（含下载按钮）/ 下载中 X% / ✅ 已就绪
- 迁移期间：「向量索引构建中 X%，当前使用关键词检索」
- 文档导入后：「已切片 N 段，向量化中…」

模型未就绪时，`search_law` / `search_user_doc` 降级为纯 FTS5（graceful degradation）。

---

## 10. 模型分发策略（Phase 5 执行）

**选定方案：运行时下载（轻量安装包）**

- 安装包不内置模型，保持安装包体积在 ~100MB 级别
- 首次进入知识库页面时检测模型是否存在，缺失则提示下载
- 下载源：`hf-mirror.com`（中国大陆直连），int8 量化版约 150MB
- 下载期间知识库功能降级为纯 FTS5，下载完成后自动启用向量检索
- Phase 5 在 `electron-builder.yml` 的 `extraResources` 中**不**包含模型文件

---

## 11. 范围外（本 Phase）

- PDF / Word 解析（仍只支持 .txt / .md）
- `search_case` 工具（判例向量库，Phase 3+）
- sqlite-vss 加速（50 万+ chunk 时再评估）
- 多语言文档（英文合同等）
- BGE-m3 稀疏检索 / ColBERT 多向量模式（dense 已足够）
