# SDK & CLI 测试覆盖设计

**日期：** 2026-04-10  
**范围：** `packages/leochat-sdk`、`packages/leochat-cli`  
**目标：** 为 SDK 工具函数、LeoAgent 集成逻辑、CLI 参数/输出逻辑建立完整测试覆盖

---

## 测试框架

**Vitest**，理由：
- 项目为 ESM + TypeScript，Vitest 原生支持，无需额外 transform
- 与已有 Vite 生态对齐
- `vi.mock()` 满足模块级 mock 需求

两个包各自独立配置，不共享 preset，避免耦合。

---

## 文件结构

```
packages/leochat-sdk/
  src/__tests__/
    context.test.ts      # buildSystemPrompt
    history.test.ts      # filterHistory, replayableToInternal
    config.test.ts       # loadConfig（mock node:fs）
    skill.test.ts        # listSkills, loadSkillContent（mock node:fs）
    agent.test.ts        # LeoAgent 集成（mock TaskLoop）
  vitest.config.ts
  package.json           # 新增 test 脚本和 vitest devDependency

packages/leochat-cli/
  src/__tests__/
    index.test.ts        # 参数解析、输出格式（mock LeoAgent）
  vitest.config.ts
  package.json           # 新增 test 脚本和 vitest devDependency
```

---

## Mock 策略

| 测试文件 | Mock 目标 | 方式 |
|---|---|---|
| `config.test.ts` | 文件读取 | `vi.mock("node:fs")` |
| `skill.test.ts` | 文件系统 | `vi.mock("node:fs")` |
| `agent.test.ts` | TaskLoop | `vi.mock("@ai-chatbox/mcp-core")`，手动触发事件 |
| `index.test.ts` | LeoAgent | `vi.mock("@leochat/sdk")`，返回预设 AgentResult |

`agent.test.ts` 中的 TaskLoop mock 需要模拟 `subscribe()` 事件分发：构造一个假的 EventEmitter，在 `start()` 调用后按顺序 emit `update`、`toolcall`、`toolresult`、`done` 等事件。

---

## 测试用例清单

### `context.test.ts` — `buildSystemPrompt`

- 无 slots，返回原始 base prompt
- 单个 slot，注入 `<context name="key">content</context>`
- 多个 slots，按顺序拼接，互不干扰
- base 为空字符串，只输出 slot 内容

### `history.test.ts` — `filterHistory` / `replayableToInternal`

- `filterHistory`：过滤掉 role=system 的消息
- `filterHistory`：保留 user / assistant / tool 消息
- `filterHistory`：空数组输入返回空数组
- `replayableToInternal`：正确映射 role / content / tool_calls / tool_call_id
- `replayableToInternal`：空数组输入返回空数组

### `config.test.ts` — `loadConfig`

- 合法 JSON 文件正确解析为 `SdkConfig`
- `${ENV_VAR}` 占位符展开（读取 `process.env`）
- 文件不存在时抛出包含路径信息的错误
- 非法 JSON 时抛出解析错误

### `skill.test.ts` — `listSkills` / `loadSkillContent`

- 目录下有合法 skill，返回正确的 `SkillMeta[]`
- skill 目录不存在时返回空数组（不抛出）
- `loadSkillContent` 返回 skill 文件的文本内容

### `agent.test.ts` — `LeoAgent.ainvoke()`

- 聚合多个 `update` 事件的 `content_delta` → `result.text`
- `toolcall` + `toolresult` 事件正确填充 `result.toolCalls`（含 result/duration）
- `done` 事件的 `totalTokens` 映射到 `result.usage`
- `error` 事件导致 `ainvoke()` reject，抛出原始 Error
- 未调用 `setLLM()` 或 `loadConfig()` 时，`ainvoke()` 抛出配置缺失错误
- `setModel()` 在无现有 LLM 配置时创建最小配置，不崩溃

### `index.test.ts` — CLI

- `-o json` 输出合法 JSON，包含 `text`、`toolCalls`、`usage` 字段
- 默认模式（非 json）调用 `printChunk` + `printToolSummary`
- 无 query 且非 `-i` 时调用 `program.help()`，不调用 `ainvoke()`
- `ainvoke()` 抛出时，写 stderr 并以 code 1 退出

---

## 配置细节

每个包的 `vitest.config.ts`：

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
  },
});
```

`package.json` 新增：

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
},
"devDependencies": {
  "vitest": "^2.0.0"
}
```

---

## 不在本次范围内

- `interactive.ts` 的 REPL 测试（readline 交互难以自动化，ROI 低）
- MCP 真实连接测试（需要外部进程，属于 e2e 范畴）
- Web 端 store 测试（另立项目）
