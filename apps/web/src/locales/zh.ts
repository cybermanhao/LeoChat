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
    "disabled": "已禁用"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "由AI驱动的智能聊天应用程序",
    "version": "版本"
  },

  // Navigation
  "nav": {
    "home": "首页",
    "chat": "聊天",
    "settings": "设置",
    "profile": "个人资料"
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
    "copied": "已复制！"
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
      "save": "保存"
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
      "apiKeys": "API密钥"
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

  // MCP
  "mcp": {
    "title": "MCP 服务器",
    "servers": "服务器",
    "resources": "资源",
    "prompts": "提示词",
    "stats": "统计",
    "addServer": "添加服务器",
    "editServer": "编辑服务器",
    "deleteServer": "删除服务器",
    "connect": "连接",
    "disconnect": "断开连接",
    "connected": "已连接",
    "disconnected": "已断开",
    "error": "错误",
    "autoConnect": "自动连接",
    "refresh": "刷新",
    "searchPlaceholder": "搜索...",
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
    "stats": {
      "connections": "连接数",
      "requests": "请求",
      "errors": "错误",
      "tools": "工具",
      "providers": "提供商"
    },
    "status": {
      "connected": "已连接",
      "disconnected": "已断开",
      "error": "错误"
    }
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