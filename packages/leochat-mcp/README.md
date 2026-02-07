# LeoChat MCP Server

## 概述

LeoChat MCP Server 是 LeoChat 的内置 MCP 服务器，提供可扩展的 UI 命令系统，允许 LLM 通过 MCP 工具调用来控制前端界面。

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         LLM (Claude)                            │
│                              │                                  │
│                    调用 MCP 工具                                │
│                              ▼                                  │
├─────────────────────────────────────────────────────────────────┤
│                    LeoChat MCP Server                           │
│                              │                                  │
│              返回 UI Command DSL (JSON)                         │
│                              ▼                                  │
├─────────────────────────────────────────────────────────────────┤
│                         前端                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  ui-commands.ts                                          │   │
│  │  ┌─────────────────────────────────────────────────────┐│   │
│  │  │  Command Registry (命令注册表)                      ││   │
│  │  │  - update_theme                                     ││   │
│  │  │  - show_notification                                ││   │
│  │  │  - open_panel                                       ││   │
│  │  │  - copy_to_clipboard                                ││   │
│  │  │  - ...                                              ││   │
│  │  └─────────────────────────────────────────────────────┘│   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                    执行 UI 操作                                 │
│                              ▼                                  │
│                    用户界面更新                                 │
└─────────────────────────────────────────────────────────────────┘
```

## DSL 格式

### 基础结构

```json
{
  "__ui_command__": true,
  "command": "命令名称",
  "payload": {
    // 命令参数
  }
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `__ui_command__` | `true` | 是 | 命令标识符，必须为 `true` |
| `command` | `string` | 是 | 命令名称 |
| `payload` | `object` | 是 | 命令参数 |

## 支持的命令

### 1. update_theme - 更新主题

更改应用的主题样式。

```json
{
  "__ui_command__": true,
  "command": "update_theme",
  "payload": {
    "themeId": "dark-purple"
  }
}
```

**Payload 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `themeId` | `string` | 否 | 具体主题 ID: `light`, `dark`, `light-purple`, `dark-purple`, `light-green`, `dark-green` |
| `mode` | `"light"` \| `"dark"` | 否 | 切换模式，智能保持当前色系 |

**执行效果：**
- 调用 theme store 切换主题
- 右上角主题按钮显示高亮动画
- 自动保存到 localStorage

---

### 2. show_notification - 显示通知

在界面右上角显示临时通知。

```json
{
  "__ui_command__": true,
  "command": "show_notification",
  "payload": {
    "message": "操作成功！",
    "type": "success",
    "duration": 3000
  }
}
```

**Payload 参数：**

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `message` | `string` | 是 | - | 通知内容 |
| `type` | `"info"` \| `"success"` \| `"warning"` \| `"error"` | 否 | `"info"` | 通知类型 |
| `duration` | `number` | 否 | `3000` | 显示时长（毫秒） |

---

### 3. show_confirm - 显示确认对话框

弹出确认对话框，可链式执行后续命令。

```json
{
  "__ui_command__": true,
  "command": "show_confirm",
  "payload": {
    "title": "确认删除",
    "message": "确定要删除这条记录吗？",
    "confirmText": "删除",
    "cancelText": "取消",
    "onConfirmCommand": {
      "__ui_command__": true,
      "command": "show_notification",
      "payload": { "message": "已删除", "type": "success" }
    }
  }
}
```

**Payload 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | `string` | 是 | 对话框标题 |
| `message` | `string` | 是 | 确认消息 |
| `confirmText` | `string` | 否 | 确认按钮文字（默认"确认"） |
| `cancelText` | `string` | 否 | 取消按钮文字（默认"取消"） |
| `onConfirmCommand` | `UICommand` | 否 | 确认后执行的命令 |

---

### 4. open_panel - 打开面板

打开指定的 UI 面板。

```json
{
  "__ui_command__": true,
  "command": "open_panel",
  "payload": {
    "panel": "mcp",
    "tab": "tools"
  }
}
```

**Payload 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `panel` | `"mcp"` \| `"settings"` \| `"history"` | 是 | 面板类型 |
| `tab` | `string` | 否 | 要激活的标签页 |

---

### 5. close_panel - 关闭面板

关闭指定的 UI 面板。

```json
{
  "__ui_command__": true,
  "command": "close_panel",
  "payload": {
    "panel": "all"
  }
}
```

**Payload 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `panel` | `"mcp"` \| `"settings"` \| `"history"` \| `"all"` | 是 | 面板类型 |

---

### 6. copy_to_clipboard - 复制到剪贴板

将文本复制到系统剪贴板。

```json
{
  "__ui_command__": true,
  "command": "copy_to_clipboard",
  "payload": {
    "text": "要复制的内容",
    "showNotification": true
  }
}
```

**Payload 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 是 | 要复制的文本 |
| `showNotification` | `boolean` | 否 | 是否显示成功通知（默认 true） |

---

### 7. open_url - 打开链接

在浏览器中打开 URL。

```json
{
  "__ui_command__": true,
  "command": "open_url",
  "payload": {
    "url": "https://example.com",
    "newTab": true
  }
}
```

**Payload 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | `string` | 是 | 要打开的 URL |
| `newTab` | `boolean` | 否 | 是否在新标签页打开（默认 true） |

---

### 8. scroll_to_message - 滚动到消息

滚动聊天区域到指定位置。

```json
{
  "__ui_command__": true,
  "command": "scroll_to_message",
  "payload": {
    "position": "bottom"
  }
}
```

**Payload 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messageId` | `string` | 否 | 消息 ID，滚动到该消息 |
| `position` | `"top"` \| `"bottom"` | 否 | 滚动到顶部或底部 |

---

### 9. set_input - 设置输入框内容

设置或追加聊天输入框的内容。

```json
{
  "__ui_command__": true,
  "command": "set_input",
  "payload": {
    "text": "预填充的文本",
    "append": false
  }
}
```

**Payload 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `text` | `string` | 是 | 要设置的文本 |
| `append` | `boolean` | 否 | 是否追加而非替换（默认 false） |

---

## 扩展新命令

### 步骤 1: 定义 Payload 类型

在 `apps/web/src/lib/ui-commands.ts` 的 `CommandPayloadMap` 中添加：

```typescript
export interface CommandPayloadMap {
  // ... 现有命令 ...

  // 新命令
  my_new_command: {
    param1: string;
    param2?: number;
  };
}
```

### 步骤 2: 注册命令处理器

```typescript
registerCommandHandler("my_new_command", (payload) => {
  const { param1, param2 = 0 } = payload;

  // 执行操作
  console.log("Executing:", param1, param2);

  // 如果需要与 UI 组件通信，使用事件
  window.dispatchEvent(new CustomEvent("ui-command:my-new-command", {
    detail: payload,
  }));

  return {
    executed: true,
    message: `Command executed: ${param1}`,
  };
});
```

### 步骤 3: 在 MCP Server 中添加工具

在 `packages/leochat-mcp/src/index.ts` 中：

```typescript
// ListToolsRequestSchema handler
{
  name: "my_new_command",
  description: "Description of what this command does",
  inputSchema: {
    type: "object",
    properties: {
      param1: { type: "string", description: "First parameter" },
      param2: { type: "number", description: "Optional second parameter" },
    },
    required: ["param1"],
  },
}

// CallToolRequestSchema handler
case "my_new_command": {
  const { param1, param2 } = args as { param1: string; param2?: number };
  return {
    content: [{
      type: "text",
      text: JSON.stringify(createUICommand("my_new_command", { param1, param2 })),
    }],
  };
}
```

### 步骤 4: 监听事件（可选）

如果命令需要与 React 组件交互：

```tsx
// 在组件中
useEffect(() => {
  const handler = (e: CustomEvent) => {
    const { param1, param2 } = e.detail;
    // 处理命令
  };

  window.addEventListener("ui-command:my-new-command", handler as EventListener);
  return () => window.removeEventListener("ui-command:my-new-command", handler as EventListener);
}, []);
```

---

## 前端便捷函数

`ui-commands.ts` 提供了便捷函数供前端直接调用：

```typescript
import {
  showNotification,
  copyToClipboard,
  openPanel,
  closePanel,
} from "../lib/ui-commands";

// 显示通知
showNotification("操作成功", "success", 3000);

// 复制到剪贴板
await copyToClipboard("要复制的文本");

// 打开面板
openPanel("mcp", "tools");

// 关闭面板
closePanel("all");
```

---

## 安全考虑

1. **命令白名单**：只执行已注册的命令，未知命令返回错误
2. **参数验证**：TypeScript 类型检查 + 运行时验证
3. **无敏感操作**：UI 命令仅用于界面展示，不涉及数据修改或敏感网络请求
4. **沙箱环境**：命令在浏览器 JavaScript 环境中执行，受安全策略限制
5. **URL 验证**：`open_url` 命令应验证 URL 协议（建议只允许 http/https）

---

## Prompts 集成

LeoChat MCP 提供 `leochat_assistant` prompt，指导 LLM 正确使用 UI 工具：

```typescript
// LLM 会收到这样的系统提示
const prompt = await mcpClient.getPrompt("leochat_assistant");
// prompt 内容告诉 LLM 如何使用各种 UI 命令
```

用户可在聊天界面选择此 prompt，让 LLM 更好地理解 UI 控制能力。

---

## 调试

```typescript
import { getRegisteredCommands } from "../lib/ui-commands";

// 查看所有已注册的命令
console.log(getRegisteredCommands());
// ["update_theme", "show_notification", "show_confirm", ...]
```
