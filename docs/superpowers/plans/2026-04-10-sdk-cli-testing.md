# SDK & CLI 测试覆盖 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `@leochat/sdk` 和 `@leochat/cli` 建立 Vitest 测试覆盖，覆盖工具函数、LeoAgent 集成逻辑及 CLI 输出行为。

**Architecture:** 两个包各自独立配置 Vitest，不共享 preset。SDK 测试文件均放在 `src/__tests__/`，对纯函数直接断言，对有副作用的函数（fs、TaskLoop）使用 `vi.mock`。CLI 先做最小重构（导出 `run(argv)` 函数，用 `import.meta.url` 守卫自动执行），再测输出格式和错误路径。

**Tech Stack:** Vitest ^2.1.0、TypeScript ESM、vi.mock（模块级 mock）、pnpm workspace

---

## 文件清单

| 操作 | 路径 |
|---|---|
| 修改 | `packages/leochat-sdk/package.json` |
| 创建 | `packages/leochat-sdk/vitest.config.ts` |
| 创建 | `packages/leochat-sdk/src/__tests__/context.test.ts` |
| 创建 | `packages/leochat-sdk/src/__tests__/history.test.ts` |
| 创建 | `packages/leochat-sdk/src/__tests__/config.test.ts` |
| 创建 | `packages/leochat-sdk/src/__tests__/skill.test.ts` |
| 创建 | `packages/leochat-sdk/src/__tests__/agent.test.ts` |
| 修改 | `packages/leochat-cli/package.json` |
| 创建 | `packages/leochat-cli/vitest.config.ts` |
| 修改 | `packages/leochat-cli/src/index.ts` |
| 创建 | `packages/leochat-cli/src/__tests__/index.test.ts` |
| 修改 | `package.json`（根目录，新增 test 脚本） |

---

## Task 1: SDK Vitest 配置 + context.test.ts

**Files:**
- Modify: `packages/leochat-sdk/package.json`
- Create: `packages/leochat-sdk/vitest.config.ts`
- Create: `packages/leochat-sdk/src/__tests__/context.test.ts`

- [ ] **Step 1: 添加 vitest 依赖并配置 package.json**

将 `packages/leochat-sdk/package.json` 的 `scripts` 和 `devDependencies` 改为：

```json
"scripts": {
  "build": "tsup",
  "dev": "tsup --watch",
  "typecheck": "tsc --noEmit",
  "clean": "rimraf dist",
  "test": "vitest run",
  "test:watch": "vitest"
},
"devDependencies": {
  "@types/node": "^22.10.0",
  "rimraf": "^6.0.1",
  "tsup": "^8.3.5",
  "typescript": "^5.7.2",
  "vitest": "^2.1.0"
}
```

- [ ] **Step 2: 创建 vitest.config.ts**

```ts
// packages/leochat-sdk/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: 安装依赖**

```bash
pnpm install
```

Expected: vitest 安装到 `packages/leochat-sdk/node_modules`

- [ ] **Step 4: 写 context.test.ts**

```ts
// packages/leochat-sdk/src/__tests__/context.test.ts
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "../context.js";

describe("buildSystemPrompt", () => {
  it("无 slots 时返回原始 base prompt", () => {
    expect(buildSystemPrompt("You are helpful.", [])).toBe("You are helpful.");
  });

  it("单个 slot 注入为 <context> 标签", () => {
    const result = buildSystemPrompt("Base.", [
      { key: "skill:test", content: "Do the thing." },
    ]);
    expect(result).toBe(
      'Base.\nAs you answer the user\'s questions, you can use the following context:\n<context name="skill:test">Do the thing.</context>'
    );
  });

  it("多个 slots 按顺序拼接", () => {
    const result = buildSystemPrompt("Base.", [
      { key: "a", content: "First" },
      { key: "b", content: "Second" },
    ]);
    expect(result).toContain('<context name="a">First</context>');
    expect(result).toContain('<context name="b">Second</context>');
    expect(result.indexOf('<context name="a">')).toBeLessThan(
      result.indexOf('<context name="b">')
    );
  });

  it("base 为空字符串时输出包含 slot 内容", () => {
    const result = buildSystemPrompt("", [{ key: "k", content: "content" }]);
    expect(result).toContain('<context name="k">content</context>');
  });
});
```

- [ ] **Step 5: 运行测试，验证通过**

```bash
cd packages/leochat-sdk && pnpm test
```

Expected:
```
✓ src/__tests__/context.test.ts (4)
Test Files  1 passed (1)
Tests       4 passed (4)
```

- [ ] **Step 6: Commit**

```bash
git add packages/leochat-sdk/package.json packages/leochat-sdk/vitest.config.ts packages/leochat-sdk/src/__tests__/context.test.ts
git commit -m "test(sdk): add vitest config + context.test.ts"
```

---

## Task 2: history.test.ts

**Files:**
- Create: `packages/leochat-sdk/src/__tests__/history.test.ts`

- [ ] **Step 1: 写 history.test.ts**

```ts
// packages/leochat-sdk/src/__tests__/history.test.ts
import { describe, it, expect } from "vitest";
import { filterHistory, replayableToInternal } from "../history.js";
import type { ChatMessage } from "@ai-chatbox/shared";

describe("filterHistory", () => {
  it("过滤掉 role=system 的消息", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "system", content: "sys", timestamp: 1000 },
      { id: "2", role: "user", content: "hello", timestamp: 1001 },
    ];
    const result = filterHistory(messages);
    expect(result).toHaveLength(1);
    expect(result[0].role).toBe("user");
  });

  it("保留 user / assistant / tool 消息", () => {
    const messages: ChatMessage[] = [
      { id: "1", role: "user", content: "q", timestamp: 1000 },
      { id: "2", role: "assistant", content: "a", timestamp: 1001 },
      { id: "3", role: "tool", content: "res", tool_call_id: "tc1", timestamp: 1002 },
    ];
    const result = filterHistory(messages);
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.role)).toEqual(["user", "assistant", "tool"]);
  });

  it("空数组输入返回空数组", () => {
    expect(filterHistory([])).toEqual([]);
  });

  it("保留 tool_calls 和 tool_call_id 字段", () => {
    const messages: ChatMessage[] = [
      {
        id: "1",
        role: "assistant",
        content: "",
        timestamp: 1000,
        tool_calls: [{ id: "tc1", name: "search", arguments: { q: "test" } }],
      },
    ];
    const result = filterHistory(messages);
    expect(result[0].tool_calls?.[0].name).toBe("search");
  });
});

describe("replayableToInternal", () => {
  it("正确映射 role / content / timestamp 字段", () => {
    const result = replayableToInternal([
      { id: "abc", role: "user", content: "hello", timestamp: 9999 },
    ]);
    expect(result[0]).toMatchObject({
      id: "abc",
      role: "user",
      content: "hello",
      timestamp: 9999,
    });
  });

  it("id 缺失时自动生成", () => {
    const result = replayableToInternal([
      { role: "user", content: "hi" },
    ]);
    expect(typeof result[0].id).toBe("string");
    expect(result[0].id.length).toBeGreaterThan(0);
  });

  it("空数组输入返回空数组", () => {
    expect(replayableToInternal([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试，验证通过**

```bash
cd packages/leochat-sdk && pnpm test
```

Expected:
```
✓ src/__tests__/context.test.ts (4)
✓ src/__tests__/history.test.ts (6)
Test Files  2 passed (2)
Tests  10 passed (10)
```

- [ ] **Step 3: Commit**

```bash
git add packages/leochat-sdk/src/__tests__/history.test.ts
git commit -m "test(sdk): add history.test.ts"
```

---

## Task 3: config.test.ts

**Files:**
- Create: `packages/leochat-sdk/src/__tests__/config.test.ts`

- [ ] **Step 1: 写 config.test.ts**

```ts
// packages/leochat-sdk/src/__tests__/config.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("fs", () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from "fs";
import { loadConfig } from "../config.js";

const mockRead = vi.mocked(readFileSync);

describe("loadConfig", () => {
  afterEach(() => {
    vi.clearAllMocks();
    delete process.env.TEST_SDK_KEY;
  });

  it("合法 JSON 正确解析为 SdkConfig", () => {
    mockRead.mockReturnValue('{"mcpServers": {}, "systemPrompt": "hi"}');
    const result = loadConfig("./mcp.json");
    expect(result.systemPrompt).toBe("hi");
    expect(result.mcpServers).toEqual({});
  });

  it("展开 ${ENV_VAR} 占位符", () => {
    process.env.TEST_SDK_KEY = "sk-abc";
    mockRead.mockReturnValue(
      '{"defaultLLM": {"apiKey": "${TEST_SDK_KEY}", "provider": "openai", "model": "gpt-4o"}}'
    );
    const result = loadConfig("./mcp.json");
    expect((result.defaultLLM as any).apiKey).toBe("sk-abc");
  });

  it("文件不存在时抛出包含路径的错误", () => {
    mockRead.mockImplementation(() => {
      throw new Error("ENOENT: no such file");
    });
    expect(() => loadConfig("./missing.json")).toThrow("Cannot read config file");
  });

  it("非法 JSON 时抛出解析错误", () => {
    mockRead.mockReturnValue("{ not valid json");
    expect(() => loadConfig("./bad.json")).toThrow("Invalid JSON");
  });
});
```

- [ ] **Step 2: 运行测试，验证通过**

```bash
cd packages/leochat-sdk && pnpm test
```

Expected:
```
✓ src/__tests__/context.test.ts (4)
✓ src/__tests__/history.test.ts (6)
✓ src/__tests__/config.test.ts (4)
Test Files  3 passed (3)
Tests  14 passed (14)
```

- [ ] **Step 3: Commit**

```bash
git add packages/leochat-sdk/src/__tests__/config.test.ts
git commit -m "test(sdk): add config.test.ts"
```

---

## Task 4: skill.test.ts

**Files:**
- Create: `packages/leochat-sdk/src/__tests__/skill.test.ts`

- [ ] **Step 1: 写 skill.test.ts**

```ts
// packages/leochat-sdk/src/__tests__/skill.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("fs", () => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  statSync: vi.fn(),
}));

import { readdirSync, readFileSync, existsSync, statSync } from "fs";
import { listSkills, loadSkillContent } from "../skill.js";

const mockReaddir = vi.mocked(readdirSync);
const mockRead = vi.mocked(readFileSync);
const mockExists = vi.mocked(existsSync);
const mockStat = vi.mocked(statSync);

const SKILL_MD = `---
name: my-skill
description: Does something cool
---
# Body content here
Some instructions.`;

describe("listSkills", () => {
  afterEach(() => vi.clearAllMocks());

  it("目录不存在时返回空数组", () => {
    mockExists.mockReturnValue(false);
    expect(listSkills("/fake/skills")).toEqual([]);
  });

  it("返回合法 skill 目录的元数据", () => {
    // existsSync: true for dir and SKILL.md, false for references
    mockExists.mockImplementation((p) => !String(p).includes("references"));
    mockReaddir.mockReturnValue(["my-skill"] as any);
    mockStat.mockReturnValue({ isDirectory: () => true } as any);
    mockRead.mockReturnValue(SKILL_MD);

    const result = listSkills("/skills");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my-skill");
    expect(result[0].description).toBe("Does something cool");
  });

  it("跳过不含 SKILL.md 的子目录", () => {
    mockExists.mockImplementation((p) => {
      const s = String(p);
      // skills dir exists, but SKILL.md doesn't
      return s === "/skills" || s.endsWith("my-skill");
    });
    mockReaddir.mockReturnValue(["my-skill"] as any);
    mockStat.mockReturnValue({ isDirectory: () => true } as any);

    expect(listSkills("/skills")).toEqual([]);
  });
});

describe("loadSkillContent", () => {
  afterEach(() => vi.clearAllMocks());

  it("返回正确的 meta 和 body", () => {
    mockExists.mockReturnValue(false); // no references dir
    mockRead.mockReturnValue(SKILL_MD);

    const result = loadSkillContent("/skills/my-skill");
    expect(result.meta.name).toBe("my-skill");
    expect(result.body).toContain("Body content here");
    expect(result.references).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试，验证通过**

```bash
cd packages/leochat-sdk && pnpm test
```

Expected:
```
✓ src/__tests__/context.test.ts (4)
✓ src/__tests__/history.test.ts (6)
✓ src/__tests__/config.test.ts (4)
✓ src/__tests__/skill.test.ts (4)
Test Files  4 passed (4)
Tests  18 passed (18)
```

- [ ] **Step 3: Commit**

```bash
git add packages/leochat-sdk/src/__tests__/skill.test.ts
git commit -m "test(sdk): add skill.test.ts"
```

---

## Task 5: agent.test.ts

**Files:**
- Create: `packages/leochat-sdk/src/__tests__/agent.test.ts`

- [ ] **Step 1: 写 agent.test.ts**

```ts
// packages/leochat-sdk/src/__tests__/agent.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@ai-chatbox/mcp-core", () => ({
  TaskLoop: vi.fn(),
  MCPClient: vi.fn(),
}));

import { TaskLoop, MCPClient } from "@ai-chatbox/mcp-core";
import { LeoAgent } from "../agent.js";
import type { LLMConfig } from "../types.js";

const mockLLMConfig: LLMConfig = {
  provider: "openai",
  model: "gpt-4o",
  apiKey: "test-key",
};

/** 构造一个按顺序 emit 事件的 TaskLoop mock */
function makeTaskLoopMock(events: unknown[]) {
  vi.mocked(TaskLoop).mockImplementation(() => {
    let listener: ((e: unknown) => void) | null = null;
    return {
      subscribe: vi.fn((cb) => {
        listener = cb;
        return () => {};
      }),
      start: vi.fn(async () => {
        for (const event of events) listener?.(event);
      }),
      registerOnToolCall: vi.fn(),
      registerOnToolCalled: vi.fn(),
    } as any;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(MCPClient).mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    availableTools: [],
    serverName: "test-server",
  }) as any);
});

describe("LeoAgent.ainvoke()", () => {
  it("未配置 LLM 时抛出明确错误", async () => {
    const agent = new LeoAgent();
    await expect(agent.ainvoke("hello")).rejects.toThrow("LLM not configured");
  });

  it("聚合 content_delta 到 result.text", async () => {
    makeTaskLoopMock([
      { type: "update", delta: { content_delta: "Hello " } },
      { type: "update", delta: { content_delta: "world" } },
      { type: "done", internalMessages: [], totalTokens: { input: 10, output: 5 } },
    ]);
    const agent = new LeoAgent().setLLM(mockLLMConfig);
    const result = await agent.ainvoke("test");
    expect(result.text).toBe("Hello world");
  });

  it("toolcall + toolresult 事件填充 result.toolCalls", async () => {
    makeTaskLoopMock([
      { type: "toolcall", toolCall: { id: "tc1", name: "search", arguments: { q: "x" } } },
      { type: "toolresult", toolCallId: "tc1", result: "found it", duration: 42 },
      { type: "done", internalMessages: [], totalTokens: { input: 5, output: 3 } },
    ]);
    const agent = new LeoAgent().setLLM(mockLLMConfig);
    const result = await agent.ainvoke("test");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]).toMatchObject({
      id: "tc1",
      name: "search",
      result: "found it",
      duration: 42,
    });
  });

  it("done 事件的 totalTokens 映射到 result.usage", async () => {
    makeTaskLoopMock([
      { type: "done", internalMessages: [], totalTokens: { input: 100, output: 50 } },
    ]);
    const agent = new LeoAgent().setLLM(mockLLMConfig);
    const result = await agent.ainvoke("test");
    expect(result.usage).toEqual({ input: 100, output: 50 });
  });

  it("error 事件导致 ainvoke() reject", async () => {
    makeTaskLoopMock([
      { type: "error", error: new Error("API failed") },
    ]);
    const agent = new LeoAgent().setLLM(mockLLMConfig);
    await expect(agent.ainvoke("test")).rejects.toThrow("API failed");
  });

  it("setModel 在无现有配置时不抛出，getLLMConfig 返回正确 model", () => {
    const agent = new LeoAgent();
    expect(() => agent.setModel("gpt-4o")).not.toThrow();
    expect(agent.getLLMConfig()?.model).toBe("gpt-4o");
  });
});
```

- [ ] **Step 2: 运行测试，验证通过**

```bash
cd packages/leochat-sdk && pnpm test
```

Expected:
```
✓ src/__tests__/context.test.ts (4)
✓ src/__tests__/history.test.ts (6)
✓ src/__tests__/config.test.ts (4)
✓ src/__tests__/skill.test.ts (4)
✓ src/__tests__/agent.test.ts (6)
Test Files  5 passed (5)
Tests  24 passed (24)
```

- [ ] **Step 3: Commit**

```bash
git add packages/leochat-sdk/src/__tests__/agent.test.ts
git commit -m "test(sdk): add agent.test.ts with TaskLoop mock"
```

---

## Task 6: CLI Vitest 配置 + index.ts 重构

**Files:**
- Modify: `packages/leochat-cli/package.json`
- Create: `packages/leochat-cli/vitest.config.ts`
- Modify: `packages/leochat-cli/src/index.ts`

- [ ] **Step 1: 添加 vitest 依赖，修改 package.json**

将 `packages/leochat-cli/package.json` 的 `scripts` 和 `devDependencies` 改为：

```json
"scripts": {
  "build": "tsup",
  "dev": "tsup --watch",
  "typecheck": "tsc --noEmit",
  "clean": "rimraf dist",
  "test": "vitest run",
  "test:watch": "vitest"
},
"devDependencies": {
  "@types/node": "^22.10.0",
  "rimraf": "^6.0.1",
  "tsup": "^8.3.5",
  "typescript": "^5.7.2",
  "vitest": "^2.1.0"
}
```

- [ ] **Step 2: 创建 vitest.config.ts**

```ts
// packages/leochat-cli/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

- [ ] **Step 3: 安装依赖**

```bash
pnpm install
```

- [ ] **Step 4: 重构 index.ts 末尾为可测试形式**

将 `packages/leochat-cli/src/index.ts` 末尾的 `program.parseAsync(process.argv);` 替换为：

```ts
export async function run(argv: string[] = process.argv): Promise<void> {
  await program.parseAsync(argv);
}

// 只在直接执行时自动运行（ESM 主模块检测）
import { fileURLToPath } from "url";
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}
```

- [ ] **Step 5: 确认 CLI 构建正常**

```bash
cd packages/leochat-cli && pnpm build
```

Expected: `dist/index.js` 生成，无 TypeScript 错误

- [ ] **Step 6: Commit**

```bash
git add packages/leochat-cli/package.json packages/leochat-cli/vitest.config.ts packages/leochat-cli/src/index.ts
git commit -m "test(cli): add vitest config + refactor index.ts for testability"
```

---

## Task 7: index.test.ts（CLI）

**Files:**
- Create: `packages/leochat-cli/src/__tests__/index.test.ts`

- [ ] **Step 1: 写 index.test.ts**

```ts
// packages/leochat-cli/src/__tests__/index.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@leochat/sdk", () => ({
  LeoAgent: vi.fn(),
}));

import { LeoAgent } from "@leochat/sdk";
import { run } from "../index.js";

function makeMockAgent(overrides: Partial<ReturnType<typeof buildMockAgent>> = {}) {
  return buildMockAgent(overrides);
}

function buildMockAgent(overrides: Record<string, unknown> = {}) {
  return {
    loadConfig: vi.fn().mockReturnThis(),
    setModel: vi.fn().mockReturnThis(),
    setSystemPrompt: vi.fn().mockReturnThis(),
    loadSkills: vi.fn().mockReturnThis(),
    onToolCall: vi.fn().mockReturnThis(),
    onToolCalled: vi.fn().mockReturnThis(),
    disconnect: vi.fn().mockResolvedValue(undefined),
    ainvoke: vi.fn().mockResolvedValue({
      text: "Mock response",
      toolCalls: [],
      usage: { input: 10, output: 5 },
      history: [],
    }),
    ...overrides,
  };
}

describe("CLI", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  let mockAgent: ReturnType<typeof buildMockAgent>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    mockAgent = makeMockAgent();
    vi.mocked(LeoAgent).mockImplementation(() => mockAgent as any);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.clearAllMocks();
  });

  it("-o json 输出合法 JSON，包含 text / toolCalls / usage", async () => {
    await run(["node", "leochat", "--output", "json", "hello"]);

    const output = (stdoutSpy.mock.calls as string[][])
      .map(([arg]) => arg)
      .join("");
    const parsed = JSON.parse(output);
    expect(parsed).toMatchObject({
      text: "Mock response",
      toolCalls: [],
      usage: { input: 10, output: 5 },
    });
  });

  it("默认模式输出 result.text 到 stdout", async () => {
    await run(["node", "leochat", "hello"]);

    const output = (stdoutSpy.mock.calls as string[][])
      .map(([arg]) => arg)
      .join("");
    expect(output).toContain("Mock response");
  });

  it("ainvoke 抛出时写 stderr 并以 code 1 退出", async () => {
    mockAgent.ainvoke = vi.fn().mockRejectedValue(new Error("API failed"));
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await run(["node", "leochat", "hello"]);

    const errOutput = (stderrSpy.mock.calls as string[][])
      .map(([arg]) => arg)
      .join("");
    expect(errOutput).toContain("API failed");
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("无 query 且非 -i 时不调用 ainvoke", async () => {
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => undefined as never);

    await run(["node", "leochat"]);

    expect(mockAgent.ainvoke).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});
```

- [ ] **Step 2: 运行测试，验证通过**

```bash
cd packages/leochat-cli && pnpm test
```

Expected:
```
✓ src/__tests__/index.test.ts (4)
Test Files  1 passed (1)
Tests  4 passed (4)
```

- [ ] **Step 3: Commit**

```bash
git add packages/leochat-cli/src/__tests__/index.test.ts
git commit -m "test(cli): add index.test.ts"
```

---

## Task 8: 根目录 test 脚本

**Files:**
- Modify: `package.json`（根目录）

- [ ] **Step 1: 在根 package.json 添加 test 脚本**

在根目录 `package.json` 的 `scripts` 中加入：

```json
"test": "pnpm --filter @leochat/sdk --filter @leochat/cli test"
```

完整 scripts 块：

```json
"scripts": {
  "dev": "pnpm run build:packages && pnpm -r --parallel run dev",
  "build:packages": "pnpm --filter @ai-chatbox/shared --filter @ai-chatbox/ui --filter @ai-chatbox/mcp-core run build",
  "dev:web": "pnpm --filter @ai-chatbox/web dev",
  "dev:electron": "pnpm --filter @ai-chatbox/electron dev",
  "dev:server": "pnpm --filter @ai-chatbox/server dev",
  "build": "pnpm -r run build",
  "build:web": "pnpm --filter @ai-chatbox/web build",
  "build:electron": "pnpm --filter @ai-chatbox/electron build",
  "lint": "pnpm -r run lint",
  "typecheck": "pnpm -r run typecheck",
  "test": "pnpm --filter @leochat/sdk --filter @leochat/cli test",
  "clean": "pnpm -r run clean && rimraf node_modules"
}
```

- [ ] **Step 2: 运行全量测试，验证两个包全部通过**

```bash
pnpm test
```

Expected:
```
@leochat/sdk: ✓ context.test.ts (4) ✓ history.test.ts (6) ✓ config.test.ts (4) ✓ skill.test.ts (4) ✓ agent.test.ts (6)
@leochat/cli: ✓ index.test.ts (4)
Test Files  6 passed (6)
Tests  28 passed (28)
```

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add root-level pnpm test script for SDK & CLI"
```
