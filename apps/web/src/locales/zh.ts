import { TranslationDictionary } from "../lib/i18n";

const zh: TranslationDictionary = {
  // Common
  "common": {
    "save": "保存",
    "cancel": "取消",
    "close": "关闭",
    "ok": "确定",
    "yes": "是",
    "no": "否",
    "confirm": "确认",
    "delete": "删除",
    "edit": "编辑",
    "add": "添加",
    "search": "搜索",
    "settings": "设置",
    "language": "语言",
    "appearance": "外观",
    "theme": "主题",
    "enabled": "已启用",
    "disabled": "已禁用",
    "copy": "复制",
    "reset": "重置"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "由AI驱动的智能聊天应用程序",
    "version": "版本"
  },

  // Layout
  "layout": {
    "collapseSidebar": "收起侧边栏",
    "expandSidebar": "展开侧边栏"
  },

  // Navigation
  "nav": {
    "home": "首页",
    "chat": "聊天",
    "settings": "设置",
    "profile": "个人资料",
    "knowledge": "知识库"
  },

  // Chat
  "chat": {
    "title": "聊天",
    "send": "发送",
    "inputPlaceholder": "在此输入您的消息...",
    "newChat": "新聊天",
    "history": "历史记录",
    "clearHistory": "清除历史记录",
    "copyMessage": "复制消息",
    "copied": "已复制！",
    "welcome": "欢迎使用 LeoChat",
    "welcomeDescription": "开始对话，或使用 MCP 工具与您的环境交互",
    "confirmClear": "确定要清空当前对话吗？",
    "clear": "清空",
    "clearConversation": "清空对话",
    "markdown": "Markdown",
    "plainText": "纯文本",
    "markdownRendering": "Markdown 渲染",
    "placeholderDefault": "输入消息，或使用 @tool 调用 MCP 工具...",
    "placeholderWithPrompt": "已启用系统提示...",
    "webSearch": "联网搜索",
    "suggestions": {
      "code": "帮我写一段代码",
      "explain": "解释这个概念",
      "translate": "翻译成英文",
      "summarize": "总结这篇文章"
    }
  },

  // Settings
  "settings": {
    "title": "设置",
    "api": {
      "title": "API密钥",
      "description": "配置LLM服务提供商的API密钥",
      "keyPlaceholder": "sk-...",
      "descriptionDeepSeek": "高性价比的国产大模型，支持 DeepSeek-Chat 和 DeepSeek-R1 推理模型",
      "descriptionOpenRouter": "通过 OpenRouter 访问多种 AI 模型，包括 GPT-4、Claude、Gemini 等",
      "descriptionOpenAI": "OpenAI 官方 API，支持 GPT-4o、GPT-4 等模型",
      "linkTextDeepSeek": "前往 DeepSeek 获取",
      "linkTextOpenRouter": "前往 OpenRouter 获取",
      "linkTextOpenAI": "前往 OpenAI 获取",
      "getConfigured": "已配置",
      "saveSuccess": "保存成功",
      "save": "保存",
      "configureKeyFirst": "请先配置 {{provider}} 的 API Key"
    },
    "appearance": {
      "title": "外观",
      "description": "自定义应用的主题和颜色方案",
      "lightThemes": "浅色主题",
      "darkThemes": "深色主题",
      "currentTheme": "当前主题",
      "clickToSwitch": "点击切换"
    },
    "model": {
      "title": "语言模型",
      "description": "配置 API 密钥和模型参数",
      "defaultProvider": "默认提供商",
      "apiKeys": "API密钥",
      "selectModel": "模型"
    },
    "notifications": {
      "title": "通知"
    },
    "privacy": {
      "title": "隐私与安全"
    },
    "advanced": {
      "title": "高级"
    },
    "developmentNotice": "更多设置正在开发中",
    "developmentNoticeDesc": "完整的设置面板将在后续版本中提供，敬请期待。"
  },

  // Quick Access
  "quickAccess": {
    "email": "发送邮件",
    "github": "GitHub 仓库",
    "language": "语言 / Language"
  },

  // Sidebar
  "sidebar": {
    "mcpConnected": "MCP 已连接",
    "untitledChat": "未命名对话"
  },

  // Models
  "models": {
    "searchPlaceholder": "搜索模型...",
    "deepseek": {
      "chat": { "description": "通用对话模型，高性价比" },
      "reasoner": { "description": "推理增强模型，支持思维链" }
    },
    "openai": {
      "gpt4o": { "description": "最强大的多模态模型" },
      "gpt4oMini": { "description": "快速且经济实惠" },
      "gpt4Turbo": { "description": "强大的推理能力" }
    },
    "anthropic": {
      "sonnet": { "description": "出色的编程和推理能力" },
      "opus": { "description": "最强大的 Claude 模型" }
    },
    "google": {
      "geminiPro": { "description": "超长上下文窗口" }
    },
    "common": {
      "viaOpenRouter": "通过 OpenRouter 访问"
    },
    "context": "上下文",
    "viewAllModels": "查看所有模型"
  },

  // MCP
  "mcp": {
    "title": "MCP 服务器",
    "servers": "服务器",
    "resources": "资源",
    "prompts": "提示词",
    "statsTab": "统计",
    "tools": "工具",
    "addServer": "添加服务器",
    "editServer": "编辑服务器",
    "deleteServer": "删除服务器",
    "connect": "连接",
    "disconnect": "断开连接",
    "connected": "已连接",
    "disconnected": "已断开",
    "notConnected": "未连接",
    "error": "错误",
    "autoConnect": "自动连接",
    "enableAutoConnect": "启用自动连接",
    "disableAutoConnect": "取消自动连接",
    "refresh": "刷新",
    "searchPlaceholder": "搜索...",
    "searchToolsPlaceholder": "搜索工具...",
    "clearSearch": "清空",
    "confirmDeleteClick": "再次点击确认删除",
    "adding": "添加中...",
    "saving": "保存中...",
    "serverName": "服务器名称",
    "serverUrl": "服务器地址",
    "serverDescription": "描述",
    "serverAuth": "认证",
    "serverTimeout": "超时时间（秒）",
    "serverTools": "工具",
    "serverEnvs": "环境变量",
    "serverSave": "保存",
    "serverCancel": "取消",
    "serverTest": "测试连接",
    "serverTestSuccess": "连接成功！",
    "serverTestFailed": "连接失败！",
    "serverAddSuccess": "服务器添加成功！",
    "serverUpdateSuccess": "服务器更新成功！",
    "serverDeleteConfirm": "您确定要删除此服务器吗？",
    "serverDeleteSuccess": "服务器删除成功！",
    "serverConnectionError": "连接错误",
    "serverConnectionSuccess": "连接成功！",
    "toolEnabled": "已启用",
    "toolDisabled": "已禁用",
    "resourceContent": "资源内容",
    "promptApply": "应用提示词",
    "promptApplied": "提示词已应用！",
    "tabs": {
      "servers": "服务器",
      "tools": "工具",
      "resources": "资源",
      "prompts": "Prompt",
      "stats": "统计",
      "env": "环境"
    },
    "transport": {
      "stdio": {
        "desc": "进程通信",
        "description": "通过 STDIO 直接与本地进程通信"
      },
      "http": {
        "desc": "HTTP 连接",
        "description": "通过 Streamable HTTP 连接远程服务"
      }
    },
    "form": {
      "serverNamePlaceholder": "服务器名称",
      "serverNameExample": "例如: Memory Server",
      "commandPlaceholder": "命令 (如 npx)",
      "commandExample": "例如: npx 或 uvx",
      "argsPlaceholder": "参数 (空格分隔)",
      "argPlaceholder": "参数值...",
      "argExample1": "例如: -y",
      "argExample2": "例如: @modelcontextprotocol/server-memory",
      "urlPlaceholder": "http://localhost:3000/mcp",
      "descriptionPlaceholder": "简要描述此服务器的功能...",
      "authorPlaceholder": "例如: Anthropic, OpenAI",
      "tagsPlaceholder": "tag1, tag2, tag3",
      "logoPlaceholder": "https://example.com/logo.png",
      "envNamePlaceholder": "变量名",
      "envValuePlaceholder": "值",
      "deleteArg": "删除此参数",
      "deleteEnv": "删除此环境变量",
      "addArgHint": "添加新参数行（也可在输入框中按 Enter）",
      "addEnvHint": "添加环境变量（也可按 Enter）",
      "allowedPathsDesc": "允许访问的目录路径（可添加多个）",
      "basicInfo": "基础信息",
      "name": "名称",
      "connectionType": "连接类型",
      "stdioConfig": "STDIO 配置",
      "httpConfig": "HTTP 配置",
      "command": "命令",
      "commandDesc": "用于启动 MCP 服务器的命令，如 npx、node、python 等",
      "args": "参数",
      "addArg": "添加参数",
      "cwd": "工作目录 (cwd)",
      "cwdDesc": "进程启动时的工作目录，留空则使用默认目录",
      "cwdPlaceholder": "例如: C:\\Users\\me\\my-mcp-server",
      "serverUrl": "服务器 URL",
      "serverUrlDesc": "远程 MCP 服务器的完整 URL",
      "autoConnectLabel": "启动时自动连接",
      "advancedSettings": "高级设置",
      "description": "描述",
      "env": "环境变量",
      "timeout": "超时时间 (毫秒)",
      "tags": "标签",
      "tagsSeparator": "用逗号分隔多个标签",
      "longRunning": "长期运行服务器",
      "stdioDesc": "本地进程通信",
      "httpDesc": "远程 HTTP 连接",
      "registryConfig": "Registry 配置"
    },
    "stats": {
      "connections": "连接数",
      "requests": "请求",
      "errors": "错误",
      "tools": "工具",
      "providers": "提供商",
      "servers": "服务器",
      "resources": "资源",
      "prompts": "Prompt",
      "connectionStatus": "连接状态",
      "serverDetails": "服务器明细",
      "tableHeader": {
        "name": "名称",
        "protocol": "协议",
        "status": "状态",
        "tools": "工具",
        "resources": "资源"
      }
    },
    "status": {
      "connected": "已连接",
      "disconnected": "已断开",
      "error": "错误"
    },
    "resourcesDetail": {
      "empty": "暂无可用资源",
      "emptyDescription": "已连接的服务器未提供资源",
      "loadError": "加载资源内容失败",
      "description": "描述",
      "contentPreview": "内容预览",
      "noContent": "暂无内容",
      "loading": "加载中...",
      "selectToView": "选择资源查看详情",
      "totalCount": "共 {{count}} 个资源"
    },
    "promptsDetail": {
      "empty": "暂无可用 Prompt",
      "emptyDescription": "已连接的服务器未提供 Prompt 模板",
      "totalCount": "共 {{count}} 个 Prompt",
      "description": "描述",
      "arguments": "参数",
      "required": "必填",
      "selectToView": "选择 Prompt 查看详情"
    },
    "serversDetail": {
      "empty": "暂无 MCP 服务器",
      "emptyHint": "点击左侧 \"添加 MCP\" 按钮开始"
    },
    "toolsDetail": {
      "empty": "暂无可用工具",
      "emptyHint": "请先连接服务器",
      "selectToView": "选择工具查看详情",
      "description": "描述",
      "inputSchema": "参数 Schema",
      "totalCount": "共 {{count}} 个工具"
    },
    "serverEdit": {
      "generalSettings": "常规设置",
      "toolsWithCount": "工具 ({{count}})",
      "resourcesWithCount": "资源 ({{count}})",
      "notFound": "服务器未找到",
      "notFoundDesc": "该服务器不存在或已被删除",
      "backToList": "返回服务器列表",
      "editSubtitle": "编辑 MCP 服务器配置",
      "configSaved": "配置已保存",
      "restarting": "正在重启服务器以应用新配置...",
      "configSavedRestarted": "配置已保存，服务器已重启",
      "saveFailed": "保存失败，请重试"
    },
    "serverAdd": {
      "subtitle": "配置新的模型上下文协议服务器",
      "infoTitle": "添加 MCP 服务器",
      "infoDesc": "填写以下信息以添加新的 MCP 服务器。STDIO 类型适用于本地进程通信，HTTP 类型适用于远程服务器连接。"
    },
    "sources": {
      "builtin": "内置服务",
      "custom": "自定义服务"
    }
  },

  // Knowledge Base
  "knowledge": {
    "title": "知识库",
    "listTitle": "知识库列表"
  },

  // Errors
  "error": {
    "unknown": "未知错误",
    "network": "网络错误",
    "timeout": "请求超时",
    "invalidUrl": "无效URL",
    "connectionFailed": "连接失败",
    "apiKeyRequired": "API密钥是必需的",
    "invalidApiKey": "无效的API密钥",
    "rateLimit": "超出速率限制",
    "serverError": "服务器错误",
    "notImplemented": "尚未实现"
  },

  // Success
  "success": {
    "operationCompleted": "操作完成",
    "saved": "已保存",
    "deleted": "已删除",
    "created": "已创建",
    "updated": "已更新"
  }
};

export default zh;
