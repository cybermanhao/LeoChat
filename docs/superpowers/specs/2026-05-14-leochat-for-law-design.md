# leochat-for-law 设计文档

> 版本：v2  
> 日期：2026-05-14  
> 状态：已批准

---

## 0. 背景与目标

`leochat-for-law` 是从 LeoChat Electron 主干分支出的专用打包版本，面向中国大陆法律工作场景。核心目标：

- 覆盖个人法律咨询、律师/法律从业者辅助、企业合规审查三类场景
- 全本地知识库（RAG），无需外部向量数据库服务
- 中国大陆网络环境直接可用（国内 LLM API + HF 镜像下载模型）
- SOP 驱动的 Law Skills，让 Agent 按标准化流程处理法律任务
- 文书生成 MCP，支持输出 Word/PDF/Excel 格式

---

## 1. 整体架构

```
┌─────────────────────────────────────────────────┐
│              leochat-for-law (Electron)          │
│                                                 │
│  ┌──────────────┐    ┌───────────────────────┐  │
│  │  Law UI 层   │    │   知识库管理 UI        │  │
│  │ (React/Web)  │    │ (文档导入/索引状态)    │  │
│  └──────┬───────┘    └──────────┬────────────┘  │
│         │                       │               │
│  ┌──────▼───────────────────────▼────────────┐  │
│  │           LawAgent (leochat-sdk)           │  │
│  │  + 知识检索 ContextSlot 注入               │  │
│  │  + 法律领域 system prompt                  │  │
│  └──────┬────────────────────────────────────┘  │
│         │ MCP                                   │
│  ┌──────▼────────────────────────────────────┐  │
│  │              MCP Servers 层                │  │
│  │  law-kb-mcp   │  docx-mcp  │  excel-mcp   │  │
│  │  (知识检索)    │  (文书生成) │  (台账/表格) │  │
│  └──────┬────────────────────────────────────┘  │
│         │                                       │
│  ┌──────▼────────────────────────────────────┐  │
│  │           本地存储层                        │  │
│  │  SQLite FTS5 (法规)  │  LanceDB (案例/文档)│  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
         │ API
    国内 LLM（DeepSeek / 智谱 GLM / 通义千问）
```

### 核心设计原则

- **知识库通过 MCP 工具按需检索**，不做全量 context 注入，节省 token
- **MCP 层可插拔**：任意 server 可独立替换，不影响其他层
- **Skills 驱动工作流**：不同法律任务激活不同 Skill，按 SOP 执行

---

## 2. 知识库层（本地 RAG）

### 2.1 存储结构

```
{Electron userData}/law-knowledge/
├── law.db                  ← SQLite，法规文本 + FTS5 全文索引
├── lancedb/                ← LanceDB 嵌入式向量库
│   ├── cases/              ← 判例向量
│   └── user-docs/          ← 用户上传文档向量
└── models/
    └── bge-m3/             ← ONNX embedding 模型（~570MB）
```

### 2.2 Embedding 方案

使用 `@xenova/transformers` 在 Electron 主进程内直接运行 BGE-m3 ONNX 模型：

- **模型**：BAAI/bge-m3（北京智源出品，中文法律文本效果优秀）
- **下载源**：`hf-mirror.com`（中国大陆可直达，HuggingFace 镜像）
- **运行位置**：Electron 主进程，不依赖 Ollama 或外部服务
- **首次启动**：检测模型是否存在，缺失则从镜像自动下载，下载完成后无需网络

### 2.3 三层检索流程

```
用户查询
   │
   ├─ 1. FTS5 精确匹配（法条编号、关键词）→ 命中时优先返回
   │
   ├─ 2. BGE-m3 向量语义检索 → top-K 相关段落
   │
   └─ 3. RRF 融合重排（Reciprocal Rank Fusion，无需额外模型）
           ↓
       最终上下文片段 → 注入 ContextSlot → LLM
```

### 2.4 知识来源（RAG 数据源）

| 类型 | 来源 | 格式 | 更新频率 |
|------|------|------|---------|
| 法律法规 | 国家法律法规数据库（flk.npc.gov.cn）、北大法宝公开部分 | TXT/XML | 低（立法周期） |
| 司法解释 | 最高人民法院官网 | PDF/HTML | 低 |
| 判例/裁判文书 | 中国裁判文书网（wenshu.court.gov.cn）公开数据 | HTML/PDF | 高 |
| 用户私有文档 | 用户上传 | PDF/Word/TXT | 实时 |

**自动采集策略**（见第 5 节）：预置爬取脚本，用户在知识库管理 UI 触发同步，结果存入本地 SQLite + LanceDB。

### 2.5 `law-kb-mcp` 工具清单

| 工具 | 说明 |
|------|------|
| `search_law` | 检索法律法规条文（FTS5 + 向量融合） |
| `search_case` | 检索相似判例 |
| `search_user_doc` | 检索用户上传文档 |
| `index_document` | 导入新文档并建索引（PDF/Word/TXT） |
| `list_knowledge_bases` | 列出已有知识库及索引状态 |
| `get_law_article` | 按编号精确获取法条全文 |

---

## 3. SOP 驱动的 Law Skills

每个 Skill 对应一个标准化法律工作流程，保存在 `skills/law/` 目录下。

### Skill 1：`legal-consultation`（法律咨询）

```
用户描述情况
  → [search_law] 检索适用法条
  → [search_case] 查找类似案例
  → 分析法律关系 + 风险
  → 给出建议，注明法律依据和案例出处
```

### Skill 2：`contract-review`（合同审查）

```
用户上传合同
  → [index_document] 临时建索引
  → 逐条款识别风险点（无效条款、不平等条款、遗漏事项）
  → [search_law] 对每个风险点检索对应法规
  → 出具审查意见
  → 可选：[docx_create] 生成格式化审查报告
```

### Skill 3：`case-analysis`（案件分析）

```
录入案情要素（当事人、法律关系、核心事实、诉求）
  → [search_case] 检索类似判例
  → [search_law] 检索适用法规
  → 分析胜诉概率 + 法律策略建议
  → 可选：[docx_create] 生成案情分析报告
```

### Skill 4：`document-drafting`（文书起草）

```
确定文书类型（起诉状/律师函/合同/法律意见书等）
  → [search_law] 检索相关法规确保合规
  → 按模板结构起草
  → [docx_create] 生成 Word 文件
  → 如涉及财产清单：[excel_create] 同步生成表格
```

---

## 4. 文书生成 MCP

### 4.1 `docx-mcp-server`（新增）

复用现有 `excel-mcp-server` 的架构模式。

**工具：**

| 工具 | 说明 |
|------|------|
| `docx_create` | 按模板类型生成 Word 文档 |
| `docx_fill_template` | 填充预置法律文书模板 |
| `docx_export_pdf` | 转换为 PDF（LibreOffice headless 或 docx2pdf） |

**内置模板：**
- 起诉状 / 答辩状
- 律师函
- 法律意见书
- 劳动合同
- 房屋买卖合同
- 合同审查报告

### 4.2 `excel-mcp-server`（现有，直接复用）

用于财产清单、案件台账、费用明细等表格场景。

---

## 5. 知识数据自动采集

在 `mcp-servers/law-crawler/` 新增采集脚本（Node.js），用户在 UI 触发，数据落本地。

### 采集目标

| 来源 | 方式 | 内容 |
|------|------|------|
| `flk.npc.gov.cn` | HTTP 抓取 + HTML 解析 | 现行有效法律全文 |
| 最高人民法院官网 | HTTP 抓取 | 司法解释 PDF |
| 裁判文书网 | 公开 API 或 HTML 解析 | 公开裁判文书 |

### 更新策略

- 法规库：手动触发同步（低频，立法变化慢）
- 案例库：支持按关键词/案由增量抓取
- 用户文档：实时导入（拖拽或文件选择器）

---

## 6. LLM 配置（中国大陆可用）

预置以下国内 provider，用户填入 API Key 即可使用：

| Provider | 模型推荐 | 备注 |
|---------|---------|------|
| DeepSeek | deepseek-chat / deepseek-reasoner | 性价比最高，推理能力强 |
| 智谱 GLM | glm-4-plus | 中文法律理解好 |
| 通义千问 | qwen-max | 长上下文 128K |
| 豆包 | doubao-pro | 字节出品 |

所有 API endpoint 均为国内直连地址，无需代理。

---

## 7. 打包与分发

### Branch 策略

```
master (LeoChat 主干)
  └─ leochat-for-law (长期维护分支)
       ├─ 定期从 master 合并通用更新
       └─ 法律专用功能只在此分支维护
```

### Electron 打包差异

相较于 LeoChat 标准版，`leochat-for-law` 打包额外包含：

- `mcp-servers/law-kb-mcp/` — 知识库 MCP
- `mcp-servers/docx-mcp/` — 文书生成 MCP
- `mcp-servers/law-crawler/` — 数据采集脚本
- `skills/law/` — 四个 Law Skills
- BGE-m3 ONNX 模型（首次运行时从 hf-mirror.com 下载）

### 安装体验（CN 网络）

1. 下载 `.exe` 安装包（GitHub Releases 或国内镜像）
2. 首次启动向导：填写 LLM API Key → 选择知识库初始化（可跳过）
3. 后台自动从 `hf-mirror.com` 下载 BGE-m3 模型
4. 完成，无需其他依赖

---

## 8. 分阶段交付

| Phase | 内容 | 产出 |
|-------|------|------|
| **Phase 1** | `law-kb-mcp` (FTS5 法规检索) + `legal-consultation` Skill + DeepSeek 接入 | 可用的法律咨询 MVP |
| **Phase 2** | BGE-m3 向量检索 + LanceDB + `search_case` 工具 | 案例检索能力 |
| **Phase 3** | `docx-mcp-server` + `document-drafting` Skill | 文书生成能力 |
| **Phase 4** | 法规自动采集脚本 + `contract-review` / `case-analysis` Skills | 完整四技能 |
| **Phase 5** | Electron 打包优化 + CN 网络安装向导 | 正式 Release |

---

## 9. 运行时打包策略

面向非开发者用户，所有运行时均内置，不依赖系统环境变量或 PATH。

### 打包方式（按语言）

| 运行时 | 打包策略 | 体积 |
|--------|---------|------|
| Node.js MCP servers | Node SEA（Single Executable App，Node 20+ 官方特性）编译为独立 `.exe` | ~10MB/server |
| Go MCP servers | 静态编译为 `.exe`，无需运行时 | ~10MB/server |
| Python MCP servers | 内置 `uv` 二进制（~10MB），首次运行时 `uv` 自动创建隔离 venv | venv ~50MB |

### resources/ 目录结构

```
resources/
├── runtime/
│   └── uv.exe              ← 仅 Python 系 MCP 需要
├── mcp-servers/
│   ├── law-kb-mcp.exe      ← Node SEA 编译
│   ├── docx-mcp.exe        ← Node SEA 编译
│   └── law-crawler/        ← Python，uv 管理
│       ├── main.py
│       └── pyproject.toml
└── models/                 ← 空占位，BGE-m3 首次运行时下载
```

### 路径解析

所有子进程启动均使用 `process.resourcesPath` 解析绝对路径，不读取系统环境变量：

```js
const uvPath = path.join(process.resourcesPath, 'runtime', 'uv.exe')
const serverExe = path.join(process.resourcesPath, 'mcp-servers', 'law-kb-mcp.exe')
```

---

## 10. 知识库管理 UI

原 MCP「运行环境」tab 在 leochat-for-law 中改造为「知识库」tab，成为知识库管理的核心入口。

### 布局

```
┌─────────────────────────────────────┐
│  知识库状态              [刷新]      │
├─────────────────────────────────────┤
│  📚 法律法规    12,847 条  [同步]    │
│  ⚖️  裁判文书    3,201 条  [更新]    │
│  📄 我的文档       23 条  [管理]    │
├─────────────────────────────────────┤
│  🤖 BGE-m3 模型   ✅ 已就绪          │
│  🔍 向量索引      ✅ 同步            │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │  拖拽文件到此处添加          │    │
│  │  PDF / Word / TXT           │    │
│  │  或 [点击选择文件]           │    │
│  └─────────────────────────────┘    │
└─────────────────────────────────────┘
```

### 核心交互

1. **拖拽 / 选择文件** → 调用 `law-kb-mcp` 的 `index_document` 工具，自动建索引，进度实时显示
2. **「同步」按钮** → 触发 `flk.npc.gov.cn` 采集脚本，流式显示抓取进度和入库条数
3. **「更新」按钮** → 增量抓取裁判文书（需用户已配置账号）
4. **BGE-m3 状态行** → 模型未下载时显示下载按钮 + 进度条；下载完成后显示「✅ 已就绪」

### 与原 MCPEnvTab 的关系

原 `MCPEnvTab` 组件在 leochat-for-law 分支中替换为 `LawKnowledgeTab`，原组件保留在主干不动。

---

## 11. 范围外（Out of Scope）

- 多用户/团队共享知识库（当前为单机本地）
- 法律 AI 生成内容的合规性免责机制（UI 层需加免责声明，不在此设计范围）
- 实时法规变更推送
- 移动端
