import { TranslationDictionary } from "../lib/i18n";

const ja: TranslationDictionary = {
  // Common
  "common": {
    "save": "保存",
    "cancel": "キャンセル",
    "close": "閉じる",
    "ok": "OK",
    "yes": "はい",
    "no": "いいえ",
    "confirm": "確認",
    "delete": "削除",
    "edit": "編集",
    "add": "追加",
    "search": "検索",
    "settings": "設定",
    "language": "言語",
    "appearance": "外観",
    "theme": "テーマ",
    "enabled": "有効",
    "disabled": "無効",
    "copy": "Copy",
    "reset": "Reset"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "AI搭載のインテリジェントチャットアプリケーション",
    "version": "バージョン"
  },

  // Layout
  "layout": {
    "collapseSidebar": "Collapse Sidebar",
    "expandSidebar": "Expand Sidebar"
  },

  // Navigation
  "nav": {
    "home": "ホーム",
    "chat": "チャット",
    "settings": "設定",
    "profile": "プロフィール",
    "knowledge": "Knowledge Base"
  },

  // Chat
  "chat": {
    "title": "チャット",
    "send": "送信",
    "inputPlaceholder": "ここにメッセージを入力してください...",
    "newChat": "新しいチャット",
    "history": "履歴",
    "clearHistory": "履歴をクリア",
    "copyMessage": "メッセージをコピー",
    "copied": "コピーしました！",
    "welcome": "Welcome to LeoChat",
    "welcomeDescription": "Start a conversation or interact with your environment using MCP tools",
    "confirmClear": "Are you sure you want to clear the current conversation?",
    "clear": "Clear",
    "clearConversation": "Clear Conversation",
    "markdown": "Markdown",
    "plainText": "Plain Text",
    "markdownRendering": "Markdown Rendering",
    "placeholderDefault": "Type a message, or use @tool to call MCP tools...",
    "placeholderWithPrompt": "System prompt enabled...",
    "webSearch": "Web Search",
    "suggestions": {
      "code": "Help me write some code",
      "explain": "Explain this concept",
      "translate": "Translate to English",
      "summarize": "Summarize this article"
    }
  },

  // Settings
  "settings": {
    "title": "設定",
    "api": {
      "title": "APIキー",
      "description": "LLMプロバイダーのAPIキーを設定",
      "keyPlaceholder": "sk-...",
      "descriptionDeepSeek": "コストパフォーマンスに優れた国産大規模モデルで、DeepSeek-ChatおよびDeepSeek-R1推論モデルをサポート",
      "descriptionOpenRouter": "OpenRouter経由でGPT-4、Claude、Geminiなどの複数のAIモデルにアクセス",
      "descriptionOpenAI": "OpenAI公式APIで、GPT-4o、GPT-4などのモデルをサポート",
      "linkTextDeepSeek": "DeepSeekから取得",
      "linkTextOpenRouter": "OpenRouterから取得",
      "linkTextOpenAI": "OpenAIから取得",
      "getConfigured": "設定済み",
      "saveSuccess": "保存に成功しました",
      "save": "保存",
      "configureKeyFirst": "Please configure {{provider}} API Key first"
    },
    "appearance": {
      "title": "外観",
      "description": "アプリケーションのテーマと配色をカスタマイズ",
      "lightThemes": "ライトテーマ",
      "darkThemes": "ダークテーマ",
      "currentTheme": "現在のテーマ",
      "clickToSwitch": "クリックして切り替え"
    },
    "model": {
      "title": "言語モデル",
      "description": "APIキーとモデルパラメータを設定",
      "defaultProvider": "デフォルトプロバイダー",
      "apiKeys": "APIキー",
      "selectModel": "Model"
    },
    "notifications": {
      "title": "通知"
    },
    "privacy": {
      "title": "プライバシーとセキュリティ"
    },
    "advanced": {
      "title": "高度な設定"
    },
    "developmentNotice": "詳細設定は開発中です",
    "developmentNoticeDesc": "完全な設定パネルは今後のバージョンで提供予定です。お楽しみに。"
  },

  // Quick Access
  "quickAccess": {
    "email": "メール送信",
    "github": "GitHubリポジトリ",
    "language": "言語 / Language"
  },

  // Models
  "models": {
    "searchPlaceholder": "Search models...",
    "deepseek": {
      "chat": { "description": "General chat model, cost-effective" },
      "reasoner": { "description": "Reasoning-enhanced model with chain-of-thought" }
    },
    "openai": {
      "gpt4o": { "description": "Most powerful multimodal model" },
      "gpt4oMini": { "description": "Fast and affordable" },
      "gpt4Turbo": { "description": "Powerful reasoning capability" }
    },
    "anthropic": {
      "sonnet": { "description": "Excellent programming and reasoning" },
      "opus": { "description": "Most powerful Claude model" }
    },
    "google": {
      "geminiPro": { "description": "Extra-long context window" }
    },
    "common": {
      "viaOpenRouter": "Access via OpenRouter"
    },
    "context": "Context",
    "viewAllModels": "View all models"
  },

  // MCP
  "mcp": {
    "title": "MCPサーバー",
    "servers": "サーバー",
    "resources": "リソース",
    "prompts": "プロンプト",
    "statsTab": "統計",
    "tools": "ツール",
    "addServer": "サーバー追加",
    "editServer": "サーバー編集",
    "deleteServer": "サーバー削除",
    "connect": "接続",
    "disconnect": "切断",
    "connected": "接続済み",
    "disconnected": "切断済み",
    "notConnected": "Not Connected",
    "error": "エラー",
    "autoConnect": "自動接続",
    "enableAutoConnect": "Enable Auto Connect",
    "disableAutoConnect": "Disable Auto Connect",
    "refresh": "更新",
    "searchPlaceholder": "検索...",
    "searchToolsPlaceholder": "Search tools...",
    "clearSearch": "Clear",
    "confirmDeleteClick": "Click again to confirm delete",
    "adding": "Adding...",
    "saving": "Saving...",
    "serverName": "サーバー名",
    "serverUrl": "サーバーURL",
    "serverDescription": "説明",
    "serverAuth": "認証",
    "serverTimeout": "タイムアウト（秒）",
    "serverTools": "ツール",
    "serverEnvs": "環境変数",
    "serverSave": "保存",
    "serverCancel": "キャンセル",
    "serverTest": "接続テスト",
    "serverTestSuccess": "接続成功！",
    "serverTestFailed": "接続失敗！",
    "serverAddSuccess": "サーバー追加成功！",
    "serverUpdateSuccess": "サーバー更新成功！",
    "serverDeleteConfirm": "このサーバーを削除してもよろしいですか？",
    "serverDeleteSuccess": "サーバー削除成功！",
    "serverConnectionError": "接続エラー",
    "serverConnectionSuccess": "接続成功！",
    "toolEnabled": "有効",
    "toolDisabled": "無効",
    "resourceContent": "リソース内容",
    "promptApply": "プロンプト適用",
    "promptApplied": "プロンプトが適用されました！",
    "tabs": {
      "servers": "Servers",
      "tools": "Tools",
      "resources": "Resources",
      "prompts": "Prompts",
      "stats": "Statistics"
    },
    "transport": {
      "stdio": {
        "desc": "Process Communication",
        "description": "Communicate with local process via STDIO"
      },
      "http": {
        "desc": "HTTP Connection",
        "description": "Connect to remote service via Streamable HTTP"
      }
    },
    "form": {
      "serverNamePlaceholder": "Server Name",
      "serverNameExample": "e.g., Memory Server",
      "commandPlaceholder": "Command (e.g., npx)",
      "commandExample": "e.g., npx or uvx",
      "argsPlaceholder": "Arguments (space-separated)",
      "argPlaceholder": "Argument value...",
      "argExample1": "e.g., -y",
      "argExample2": "e.g., @modelcontextprotocol/server-memory",
      "urlPlaceholder": "http://localhost:3000/mcp",
      "descriptionPlaceholder": "Briefly describe this server's function...",
      "authorPlaceholder": "e.g., Anthropic, OpenAI",
      "tagsPlaceholder": "tag1, tag2, tag3",
      "logoPlaceholder": "https://example.com/logo.png",
      "envNamePlaceholder": "Variable Name",
      "envValuePlaceholder": "Value",
      "deleteArg": "Delete this argument",
      "deleteEnv": "Delete this environment variable",
      "addArgHint": "Add new argument (or press Enter in input)",
      "addEnvHint": "Add environment variable (or press Enter)",
      "allowedPathsDesc": "Allowed directory paths (can add multiple)",
      "basicInfo": "Basic Information",
      "name": "Name",
      "connectionType": "Connection Type",
      "stdioConfig": "STDIO Configuration",
      "httpConfig": "HTTP Configuration",
      "command": "Command",
      "commandDesc": "Command to start the MCP server, e.g., npx, node, python, etc.",
      "args": "Arguments",
      "addArg": "Add Argument",
      "serverUrl": "Server URL",
      "serverUrlDesc": "Full URL of the remote MCP server",
      "autoConnectLabel": "Auto connect on startup",
      "advancedSettings": "Advanced Settings",
      "description": "Description",
      "env": "Environment Variables",
      "timeout": "Timeout (milliseconds)",
      "tags": "Tags",
      "tagsSeparator": "Separate multiple tags with commas",
      "longRunning": "Long-running Server",
      "stdioDesc": "Local process communication",
      "httpDesc": "Remote HTTP connection",
      "registryConfig": "Registry Configuration"
    },
    "stats": {
      "connections": "接続数",
      "requests": "リクエスト",
      "errors": "エラー",
      "tools": "ツール",
      "providers": "プロバイダー",
      "servers": "Servers",
      "resources": "Resources",
      "prompts": "Prompts",
      "connectionStatus": "Connection Status",
      "serverDetails": "Server Details",
      "tableHeader": {
        "name": "Name",
        "protocol": "Protocol",
        "status": "Status",
        "tools": "Tools",
        "resources": "Resources"
      }
    },
    "status": {
      "connected": "接続済み",
      "disconnected": "切断済み",
      "error": "エラー"
    },
    "toolsDetail": {
      "empty": "No tools available",
      "emptyHint": "Please connect a server first",
      "selectToView": "Select a tool to view details",
      "description": "Description",
      "inputSchema": "Input Schema",
      "totalCount": "{{count}} tools in total"
    },
    "resourcesDetail": {
      "empty": "No resources available",
      "emptyDescription": "Connected servers do not provide resources",
      "loadError": "Failed to load resource content",
      "description": "Description",
      "contentPreview": "Content Preview",
      "noContent": "No content",
      "loading": "Loading...",
      "selectToView": "Select a resource to view details",
      "totalCount": "{{count}} resources in total"
    },
    "promptsDetail": {
      "empty": "No prompts available",
      "emptyDescription": "Connected servers do not provide prompt templates",
      "totalCount": "{{count}} prompts in total",
      "description": "Description",
      "arguments": "Arguments",
      "required": "Required",
      "selectToView": "Select a prompt to view details"
    },
    "serversDetail": {
      "empty": "No MCP servers",
      "emptyHint": "Click \"Add MCP\" button on the left to start"
    },
    "serverEdit": {
      "generalSettings": "General Settings",
      "toolsWithCount": "Tools ({{count}})",
      "resourcesWithCount": "Resources ({{count}})",
      "notFound": "Server Not Found",
      "notFoundDesc": "This server does not exist or has been deleted",
      "backToList": "Back to Server List",
      "editSubtitle": "Edit MCP server configuration",
      "configSaved": "Configuration saved",
      "restarting": "Restarting server to apply new configuration...",
      "configSavedRestarted": "Configuration saved, server restarted",
      "saveFailed": "Save failed, please try again"
    },
    "serverAdd": {
      "subtitle": "Configure a new Model Context Protocol server",
      "infoTitle": "Add MCP Server",
      "infoDesc": "Fill in the information below to add a new MCP server. STDIO type is for local process communication, HTTP type is for remote server connections."
    },
    "sources": {
      "builtin": "Built-in Services",
      "custom": "Custom Services"
    }
  },

  // Knowledge Base
  "knowledge": {
    "title": "Knowledge Base",
    "listTitle": "Knowledge Base List"
  },

  // Errors
  "error": {
    "unknown": "不明なエラー",
    "network": "ネットワークエラー",
    "timeout": "リクエストタイムアウト",
    "invalidUrl": "無効なURL",
    "connectionFailed": "接続失敗",
    "apiKeyRequired": "APIキーが必要です",
    "invalidApiKey": "無効なAPIキー",
    "rateLimit": "レート制限超過",
    "serverError": "サーバーエラー",
    "notImplemented": "まだ実装されていません"
  },

  // Success
  "success": {
    "operationCompleted": "操作完了",
    "saved": "保存しました",
    "deleted": "削除しました",
    "created": "作成しました",
    "updated": "更新しました"
  }
};

export default ja;
