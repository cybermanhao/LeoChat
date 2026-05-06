# LeoChat Live2D 反馈系统 Spec

**日期：** 2026-05-02
**范围：** `apps/web`、`packages/ui`、`packages/shared`、`mcp-servers/l2dmcp`
**目标：** 建立三层 Live2D 驱动架构——实时情绪流（ACT token）、非实时控制（MCP tools）、多模式切换（Agent / 观赏 / 摄像头）

---

## 架构总览

```
┌─────────────────────────────────────────────────────────────┐
│                     模式管理层 (Mode Switcher)                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ Agent 模式   │  │ 观赏模式     │  │ 摄像头模式          │  │
│  │ (默认)       │  │             │  │ (预留)              │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                    │             │
│         ▼                ▼                    ▼             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Live2D Store (Zustand Slice)            │   │
│  │  currentMode / currentEmotion / currentMotion / ...  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐    ┌────────────────┐    ┌──────────────┐
│ 实时情绪层     │    │ MCP 控制层      │    │ 摄像头输入层  │
│ <|ACT|> token │    │ l2dmcp Server  │    │ (MediaPipe)  │
│ 流式解析器     │    │ Tool Calls     │    │ (后续迭代)   │
└───────────────┘    └────────────────┘    └──────────────┘
```

**核心原则**：
- 实时情绪与文字流同步，不走网络请求
- 非实时配置走 MCP，利用 LLM 的 tool calling 能力
- 三种模式互斥切换，状态隔离

---

## 1. 三模式系统

### 1.1 Agent 模式（默认）

**行为**：AI 通过 `<|ACT|>` token 自主驱动 Live2D 情绪，同时可通过 MCP tools 执行非实时操作。

**Prompt 注入**：连接 `l2dmcp` 时，自动拉取并注入 Live2D system prompt 后缀（含 `<|ACT|>` 说明）。该注入**可单独关闭**（通过设置 `live2dPromptInjection: false`）。

**驱动源**：
- 实时：`<|ACT|>` token 流式解析 → emotion / motion
- 非实时：MCP tool calls → 换角色 / 换装扮 / 参数调整

### 1.2 观赏模式（纯自动）

**行为**：关闭 AI 情绪驱动，Live2D 角色自动播放 idle 动画，定时随机触发 expression 和 motion。

**特性**：
- 不注入 Live2D prompt（AI 不知道 Live2D 存在）
- 不响应 `<|ACT|>` token（解析器暂停）
- 不处理 MCP emotion tools（l2dmcp 的实时类 tools 屏蔽）
- 保留 MCP 非实时 tools（换角色、换装扮等仍可操作）

**自动行为**：
```ts
// 观赏模式循环
setInterval(() => {
  if (Math.random() < 0.3) triggerRandomExpression();
  if (Math.random() < 0.1) triggerRandomMotion();
}, 5000);
```

### 1.3 摄像头模式（预留）

**行为**：通过摄像头捕捉玩家面部动作，映射到 Live2D 参数。

**特性**：
- 不注入 Live2D prompt
- 暂停 `<|ACT|>` 解析
- 暂停自动 idle（或降低频率）
- 预留 `MediaPipe Face Mesh` 接口

**参数映射（预留）**：
| 摄像头输入 | Live2D 参数 |
|-----------|------------|
| 头部旋转 X | `ParamAngleX` |
| 头部旋转 Y | `ParamAngleY` |
| 嘴部开合 | `ParamMouthOpenY` |
| 左眼开合 | `ParamEyeLOpen` |
| 右眼开合 | `ParamEyeROpen` |

> 摄像头模式为 Phase 3 功能，本次 Spec 只预留接口，不实现具体逻辑。

### 1.4 模式切换与状态隔离

```ts
// packages/shared/src/types/live2d.ts
export type Live2DMode = "agent" | "spectator" | "camera";

export interface Live2DState {
  currentMode: Live2DMode;
  promptInjectionEnabled: boolean; // 仅影响 Agent 模式
  // ...
}
```

**切换规则**：
- 模式切换时，清空当前 motion queue，重置为 Idle
- `spectator` / `camera` 模式下，前端解析器暂停，不emit emotion 事件
- `spectator` / `camera` 模式下，MCP 的 `set_emotion` tool 返回错误：`"实时情绪控制仅在 Agent 模式下可用"`

---

## 2. 实时层：ACT Token 解析

### 2.1 Prompt 注入（可关闭）

**注入内容**（`l2dmcp` MCP server 通过 `getPrompt("live2d-system")` 提供）：

```markdown
当你有情绪时，请在回复中插入情绪标记：
<|ACT:{"emotion":"<emotion_name>"}|>

可选情绪：
- happy — 开心、满足、愉快
- sad — 悲伤、失望、同情
- angry — 生气、不满、严肃
- think — 思考、犹豫、沉思
- surprised — 惊讶、震惊
- awkward — 尴尬、害羞、不知所措
- question — 疑问、好奇
- curious — 好奇、感兴趣
- neutral — 平静、无特殊情绪（默认）

你还可以插入停顿标记：
<|DELAY:N|> 其中 N 为秒数（支持小数，如 0.5）

示例：
<|ACT:{"emotion":"surprised"}|> 哇... 你给我准备了礼物？<|DELAY:1|><|ACT:{"emotion":"happy"}|> 太谢谢你了！
```

**注入时机**：`TaskLoop.start()` 组装 messages 时，如果满足以下条件：
1. `currentMode === "agent"`
2. `promptInjectionEnabled === true`
3. `l2dmcp` 已连接且支持 prompts

**关闭方式**：
- 用户设置面板开关：`Settings → Live2D → Agent Prompt 注入`
- Zustand store：`live2d.setPromptInjection(false)`

### 2.2 流式解析器

```ts
// apps/web/src/lib/stream-act-parser.ts
export interface ParsedSegment {
  type: "literal" | "act" | "delay";
  content: string;
  emotion?: string;
  duration?: number;
}

export function* parseStreamSegments(text: string): Generator<ParsedSegment> {
  const regex = /<(\|ACT:(\{.*?\})\||\|DELAY:([\d.]+)\|)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      yield { type: "literal", content: text.slice(lastIndex, match.index) };
    }
    if (match[2]) {
      try {
        const payload = JSON.parse(match[2]);
        yield { type: "act", content: match[0], emotion: payload.emotion };
      } catch {
        yield { type: "literal", content: match[0] };
      }
    } else if (match[3]) {
      yield { type: "delay", content: match[0], duration: parseFloat(match[3]) };
    }
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < text.length) {
    yield { type: "literal", content: text.slice(lastIndex) };
  }
}
```

**调用时机**：`chat-generation.ts` 中 `TaskLoop` 的 `onUpdate` / `onAdd` 回调。仅当 `currentMode === "agent"` 时启用解析。

### 2.3 情绪 → 动作映射

```ts
// packages/shared/src/types/live2d.ts
export const EMOTION_MOTION_MAP: Record<string, string> = {
  happy: "Happy",
  sad: "Sad",
  angry: "Angry",
  think: "Think",
  surprised: "Surprise",
  awkward: "Awkward",
  question: "Question",
  curious: "Curious",
  neutral: "Idle",
};
```

---

## 3. 控制层：l2dmcp MCP Server

### 3.1 Server 定位

`mcp-servers/l2dmcp` 是一个内置 MCP server（可用 stdio 或 SSE 传输），负责：
1. 提供 Live2D system prompt（通过 MCP `prompts` 能力）
2. 提供非实时 Live2D 控制 tools
3. 运行时不直接操作 Canvas（只修改 Zustand store，由前端组件消费）

### 3.2 Prompts 能力

```ts
// l2dmcp 注册一个 prompt
{
  name: "live2d-system",
  description: "Live2D 情绪标注与操作指南",
  arguments: []
}
```

返回内容即 2.1 节的 prompt 文本。

### 3.3 Tools 列表

| Tool | 分类 | 描述 | Agent 模式 | 观赏模式 | 摄像头模式 |
|------|------|------|-----------|---------|-----------|
| `set_emotion` | 实时 | 设置当前情绪（驱动 motion+expression） | ✅ | ❌ | ❌ |
| `play_motion` | 实时 | 播放指定 motion 组 | ✅ | ❌ | ❌ |
| `set_expression` | 实时 | 应用指定 expression | ✅ | ❌ | ❌ |
| `switch_model` | 非实时 | 切换 Live2D 模型 | ✅ | ✅ | ✅ |
| `list_models` | 非实时 | 列出可用模型 | ✅ | ✅ | ✅ |
| `set_costume` | 非实时 | 切换装扮（如存在多贴图） | ✅ | ✅ | ✅ |
| `set_parameter` | 非实时 | 手动调整 Live2D 参数值 | ✅ | ✅ | ✅ |
| `toggle_lip_sync` | 非实时 | 开启/关闭口型同步 | ✅ | ✅ | ✅ |
| `toggle_auto_blink` | 非实时 | 开启/关闭自动眨眼 | ✅ | ✅ | ✅ |
| `get_live2d_status` | 非实时 | 获取当前状态（模式/情绪/动作） | ✅ | ✅ | ✅ |
| `set_mode` | 全局 | 切换 Live2D 模式（agent/spectator/camera） | ✅ | ✅ | ✅ |

**实时 tools 在非 Agent 模式下返回错误**：
```json
{
  "content": [{ "type": "text", "text": "实时情绪控制仅在 Agent 模式下可用。当前模式：spectator" }],
  "isError": true
}
```

### 3.4 与前端通信

l2dmcp 是**无状态**的 MCP server，不直接操作 DOM/Canvas。它的 tool implementations 通过以下方式影响前端：

**方式 A（推荐）：直接修改 Zustand Store**
- l2dmcp 作为 Electron main process 或 web worker 运行时，持有 store 引用
- tool call 直接 dispatch store action
- 前端组件订阅 store 变化，驱动 Live2D

**方式 B：通过 TaskLoop 事件**
- l2dmcp tool result 作为 `toolresult` 事件流入 TaskLoop
- 前端在 `chat-generation.ts` 中监听，更新 Live2D store

> 方式 A 更直接，方式 B 更符合现有架构。建议先实现方式 B，后续优化为 A。

---

## 4. 状态管理

### 4.1 Zustand Live2D Slice

```ts
// apps/web/src/stores/live2d.ts
export interface Live2DState {
  // 模式
  currentMode: Live2DMode;
  promptInjectionEnabled: boolean;

  // 实时状态
  currentEmotion: string;
  currentMotionGroup: string;
  mouthOpenSize: number;
  isSpeaking: boolean;

  // 模型
  modelLoadState: "idle" | "loading" | "ready" | "error";
  modelSrc: string;
  availableModels: string[];

  // 配置
  autoBlinkEnabled: boolean;
  lipSyncEnabled: boolean;
  shadowEnabled: boolean;

  // Actions
  setMode: (mode: Live2DMode) => void;
  setPromptInjection: (enabled: boolean) => void;
  setEmotion: (emotion: string) => void;
  setMotionGroup: (group: string) => void;
  setMouthOpenSize: (size: number) => void;
  setModelSrc: (src: string) => void;
  setModelLoadState: (state: Live2DState["modelLoadState"]) => void;
  toggleLipSync: () => void;
  toggleAutoBlink: () => void;
}
```

### 4.2 模式切换副作用

```ts
setMode(mode) {
  // 1. 清空 motion queue
  this.currentMotionGroup = 'Idle';
  // 2. 暂停/恢复解析器
  // 3. 观赏模式：启动自动循环
  // 4. 摄像头模式：暂停 idle，预留摄像头接口
}
```

---

## 5. 组件设计

### 5.1 Live2DCompanion.tsx

```tsx
// apps/web/src/components/Live2DCompanion.tsx
export function Live2DCompanion() {
  const currentMode = useChatStore((s) => s.live2d.currentMode);
  const currentEmotion = useChatStore((s) => s.live2d.currentEmotion);
  const mouthOpenSize = useChatStore((s) => s.live2d.mouthOpenSize);
  const modelSrc = useChatStore((s) => s.live2d.modelSrc);

  return (
    <div className="fixed bottom-4 right-4 z-50 pointer-events-none">
      <Live2DCanvas width={400} height={500}>
        <Live2DModel
          src={modelSrc}
          emotion={currentEmotion}
          mouthOpenSize={mouthOpenSize}
          mode={currentMode}
        />
      </Live2DCanvas>
    </div>
  );
}
```

### 5.2 设置面板

在 Chat Settings 或独立面板中提供：
- 模式切换：Agent / 观赏 / 摄像头
- Agent Prompt 注入开关（仅 Agent 模式显示）
- 模型选择下拉框
- 自动眨眼、口型同步、阴影开关

---

## 6. 文件结构

```
apps/web/
  src/
    components/
      Live2DCompanion.tsx
      Live2DSettingsPanel.tsx
    stores/
      live2d.ts
    lib/
      stream-act-parser.ts
  index.html
  vite.config.ts

packages/ui/
  src/components/live2d/
    Live2DCanvas.tsx
    Live2DModel.tsx
    index.ts

packages/shared/
  src/types/live2d.ts

mcp-servers/l2dmcp/
  src/
    index.ts          # MCP server 入口
    prompts.ts        # live2d-system prompt
    tools/
      emotion.ts      # set_emotion, play_motion, set_expression
      model.ts        # switch_model, list_models, set_costume
      config.ts       # set_parameter, toggle_lip_sync, toggle_auto_blink
      mode.ts         # set_mode, get_live2d_status
  package.json
```

---

## 7. Prompt 注入流程

```
用户发送消息
  └── TaskLoop.start()
        └── assembleSystemPrompt()
              └── 检查 live2d.currentMode === 'agent'
              └── 检查 live2d.promptInjectionEnabled === true
              └── 检查 l2dmcp 已连接 && capabilities.prompts === true
              └── 满足条件时：
                    const prompt = await mcpClient.getPrompt('live2d-system');
                    systemPrompt += '\n\n' + prompt;
              └── 不满足时：systemPrompt 不变
```

---

## 8. Vite 配置

`apps/web/vite.config.ts`：
```ts
export default defineConfig({
  define: {
    Live2DCubismCore: "window.Live2DCubismCore",
  },
  optimizeDeps: {
    include: ["pixi-live2d-display", "@pixi/core"],
  },
});
```

`apps/web/index.html`：
```html
<script src="/live2dcubismcore.min.js"></script>
```

---

## 9. 依赖清单

```json
{
  "apps/web": {
    "dependencies": {
      "pixi-live2d-display": "^0.4.0",
      "@pixi/app": "^6.5.10",
      "@pixi/core": "^6.5.10",
      "@pixi/display": "^6.5.10",
      "@pixi/interaction": "^6.5.10",
      "@pixi/loaders": "^6.5.10",
      "@pixi/math": "^6.5.10",
      "@pixi/sprite": "^6.5.10",
      "@pixi/ticker": "^6.5.10"
    }
  },
  "mcp-servers/l2dmcp": {
    "dependencies": {
      "@modelcontextprotocol/sdk": "^1.0.0"
    }
  }
}
```

---

## 10. 验收标准

### Agent 模式
- [ ] AI 回复含 `<|ACT:{"emotion":"happy"}|>` 时，Live2D 在 200ms 内切换为 Happy motion
- [ ] `<|DELAY:1|>` 时，TTS 停顿 1 秒
- [ ] 情绪 token 不出现在用户可见的聊天气泡中
- [ ] Prompt 注入开关关闭后，AI 不再输出 `<|ACT|>` token

### 观赏模式
- [ ] 切换为观赏模式后，Live2D 自动播放 idle，每 5-10 秒随机触发 expression
- [ ] 不响应 `<|ACT|>` token
- [ ] `switch_model` MCP tool 仍可正常使用

### 摄像头模式（预留）
- [ ] 切换为摄像头模式后，暂停 AI 情绪和自动 idle
- [ ] 预留 `MediaPipe` 接口位置

### MCP 层
- [ ] `l2dmcp` 连接后，`listPrompts()` 返回 `live2d-system`
- [ ] `set_mode` tool 可切换三种模式
- [ ] 非 Agent 模式下调用 `set_emotion` 返回模式错误

### 通用
- [ ] 切换 conversation 时，Live2D 状态保持（不闪断）
- [ ] 切换模式时，Live2D 平滑过渡（不突兀跳变）
