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
    "copy": "コピー",
    "reset": "リセット"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "AI 搭載のインテリジェントチャットアプリケーション",
    "version": "バージョン"
  },

  // Layout
  "layout": {
    "collapseSidebar": "サイドバーを折りたたむ",
    "expandSidebar": "サイドバーを展開"
  },

  // Navigation
  "nav": {
    "home": "ホーム",
    "chat": "チャット",
    "settings": "設定",
    "profile": "プロフィール",
    "knowledge": "ナレッジベース"
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
    "welcome": "LeoChat へようこそ",
    "welcomeDescription": "会話開始または MCP ツールで環境と対話",
    "confirmClear": "現在の会話をクリアしてもよろしいですか？",
    "clear": "クリア",
    "clearConversation": "会話をクリア",
    "markdown": "Markdown",
    "plainText": "プレーンテキスト",
    "markdownRendering": "Markdown レンダリング",
    "placeholderDefault": "メッセージを入力、または @tool で MCP ツールを呼び出し...",
    "placeholderWithPrompt": "システムプロンプト有効...",
    "webSearch": "ウェブ検索",
    "suggestions": {
      "code": "コードを書いてください",
      "explain": "この概念を説明してください",
      "translate": "英語に翻訳してください",
      "summarize": "この記事を要約してください"
    }
  },

  // Settings
  "settings": {
    "title": "設定",
    "api": {
      "title": "API キー",
      "description": "LLM プロバイダーの API キーを設定",
      "keyPlaceholder": "sk-...",
      "descriptionDeepSeek": "コストパフォーマンスに優れた国産大規模モデルで、DeepSeek-Chat および DeepSeek-R1 推論モデルをサポート",
      "descriptionOpenRouter": "OpenRouter 経由で GPT-4、Claude、Gemini などの複数の AI モデルにアクセス",
      "descriptionOpenAI": "OpenAI 公式 API で、GPT-4o、GPT-4 などのモデルをサポート",
      "linkTextDeepSeek": "DeepSeek から取得",
      "linkTextOpenRouter": "OpenRouter から取得",
      "linkTextOpenAI": "OpenAI から取得",
      "descriptionMoonshot": "Moonshot Kimi、最大128Kトークンの超長コンテキストをサポート",
      "linkTextMoonshot": "Moonshot から取得",
      "getConfigured": "設定済み",
      "saveSuccess": "保存に成功しました",
      "save": "保存",
      "configureKeyFirst": "{{provider}} の API キーを先に設定してください"
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
      "description": "API キーとモデルパラメータを設定",
      "defaultProvider": "デフォルトプロバイダー",
      "apiKeys": "API キー",
      "selectModel": "モデル"
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
    "github": "GitHub リポジトリ",
    "language": "言語 / Language"
  },

  // Sidebar
  "sidebar": {
    "mcpConnected": "MCP 接続済み",
    "untitledChat": "無題のチャット"
  },

  // Models
  "models": {
    "searchPlaceholder": "モデルを検索...",
    "deepseek": {
      "chat": { "description": "汎用チャットモデル、コストパフォーマンスに優れる" },
      "reasoner": { "description": "推論強化モデル、思考チェーンをサポート" }
    },
    "openai": {
      "gpt4o": { "description": "最強のマルチモーダルモデル" },
      "gpt4oMini": { "description": "高速で経済的" },
      "gpt4Turbo": { "description": "強力な推論能力" }
    },
    "anthropic": {
      "sonnet": { "description": "優れたプログラミングと推論能力" },
      "opus": { "description": "最強の Claude モデル" }
    },
    "google": {
      "geminiPro": { "description": "超長文コンテキストウィンドウ" }
    },
    "moonshot": {
      "8k": { "description": "短い会話向け、高速応答" },
      "32k": { "description": "長文書処理、バランス型" },
      "128k": { "description": "超長コンテキスト、本一冊を処理可能" }
    },
    "common": {
      "viaOpenRouter": "OpenRouter 経由でアクセス"
    },
    "context": "コンテキスト",
    "viewAllModels": "すべてのモデルを表示"
  },

  // MCP
  "mcp": {
    "title": "MCP サーバー",
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
    "notConnected": "未接続",
    "error": "エラー",
    "autoConnect": "自動接続",
    "enableAutoConnect": "自動接続を有効",
    "disableAutoConnect": "自動接続を無効",
    "refresh": "更新",
    "searchPlaceholder": "検索...",
    "searchToolsPlaceholder": "ツールを検索...",
    "clearSearch": "クリア",
    "confirmDeleteClick": "再度クリックして削除を確定",
    "adding": "追加中...",
    "saving": "保存中...",
    "serverName": "サーバー名",
    "serverUrl": "サーバー URL",
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
      "servers": "サーバー",
      "tools": "ツール",
      "resources": "リソース",
      "prompts": "プロンプト",
      "stats": "統計"
    },
    "transport": {
      "stdio": {
        "desc": "プロセス通信",
        "description": "STDIO でローカルプロセスと通信"
      },
      "http": {
        "desc": "HTTP 接続",
        "description": "Streamable HTTP でリモートサービスに接続"
      }
    },
    "form": {
      "serverNamePlaceholder": "サーバー名",
      "serverNameExample": "例：Memory Server",
      "commandPlaceholder": "コマンド (例：npx)",
      "commandExample": "例：npx または uvx",
      "argsPlaceholder": "引数 (スペース区切り)",
      "argPlaceholder": "引数の値...",
      "argExample1": "例：-y",
      "argExample2": "例：@modelcontextprotocol/server-memory",
      "urlPlaceholder": "http://localhost:3000/mcp",
      "descriptionPlaceholder": "このサーバーの機能を簡単に説明...",
      "authorPlaceholder": "例：Anthropic, OpenAI",
      "tagsPlaceholder": "tag1, tag2, tag3",
      "logoPlaceholder": "https://example.com/logo.png",
      "envNamePlaceholder": "変数名",
      "envValuePlaceholder": "値",
      "deleteArg": "この引数を削除",
      "deleteEnv": "この環境変数を削除",
      "addArgHint": "新しい引数を追加（入力ボックスで Enter も可）",
      "addEnvHint": "環境変数を追加（Enter も可）",
      "allowedPathsDesc": "アクセス許可ディレクトリパス（複数追加可）",
      "basicInfo": "基本情報",
      "name": "名前",
      "connectionType": "接続タイプ",
      "stdioConfig": "STDIO 設定",
      "httpConfig": "HTTP 設定",
      "command": "コマンド",
      "commandDesc": "MCP サーバーを起動するコマンド（npx、node、python など）",
      "args": "引数",
      "addArg": "引数を追加",
      "serverUrl": "サーバー URL",
      "serverUrlDesc": "リモート MCP サーバーの完全な URL",
      "autoConnectLabel": "起動時に自動接続",
      "advancedSettings": "高度な設定",
      "description": "説明",
      "env": "環境変数",
      "timeout": "タイムアウト (ミリ秒)",
      "tags": "タグ",
      "tagsSeparator": "複数のタグはカンマで区切ってください",
      "longRunning": "長期実行サーバー",
      "stdioDesc": "ローカルプロセス通信",
      "httpDesc": "リモート HTTP 接続",
      "registryConfig": "レジストリ設定"
    },
    "stats": {
      "connections": "接続数",
      "requests": "リクエスト",
      "errors": "エラー",
      "tools": "ツール",
      "providers": "プロバイダー",
      "servers": "サーバー",
      "resources": "リソース",
      "prompts": "プロンプト",
      "connectionStatus": "接続状態",
      "serverDetails": "サーバー詳細",
      "tableHeader": {
        "name": "名前",
        "protocol": "プロトコル",
        "status": "状態",
        "tools": "ツール",
        "resources": "リソース"
      }
    },
    "status": {
      "connected": "接続済み",
      "disconnected": "切断済み",
      "error": "エラー"
    },
    "toolsDetail": {
      "empty": "利用可能なツールはありません",
      "emptyHint": "まずサーバーを接続してください",
      "selectToView": "ツールを選択して詳細を表示",
      "description": "説明",
      "inputSchema": "入力スキーマ",
      "totalCount": "合計{{count}}個のツール"
    },
    "resourcesDetail": {
      "empty": "利用可能なリソースはありません",
      "emptyDescription": "接続されたサーバーはリソースを提供していません",
      "loadError": "リソース内容の読み込みに失敗",
      "description": "説明",
      "contentPreview": "内容プレビュー",
      "noContent": "内容なし",
      "loading": "読み込み中...",
      "selectToView": "リソースを選択して詳細を表示",
      "totalCount": "合計{{count}}個のリソース"
    },
    "promptsDetail": {
      "empty": "利用可能なプロンプトはありません",
      "emptyDescription": "接続されたサーバーはプロンプトテンプレートを提供していません",
      "totalCount": "合計{{count}}個のプロンプト",
      "description": "説明",
      "arguments": "引数",
      "required": "必須",
      "selectToView": "プロンプトを選択して詳細を表示"
    },
    "serversDetail": {
      "empty": "MCP サーバーはありません",
      "emptyHint": "左側の「MCP 追加」ボタンをクリックして開始"
    },
    "serverEdit": {
      "generalSettings": "一般設定",
      "toolsWithCount": "ツール ({{count}})",
      "resourcesWithCount": "リソース ({{count}})",
      "notFound": "サーバーが見つかりません",
      "notFoundDesc": "このサーバーは存在しないか削除されました",
      "backToList": "サーバーリストに戻る",
      "editSubtitle": "MCP サーバー設定を編集",
      "configSaved": "設定を保存しました",
      "restarting": "新しい設定を適用するためにサーバーを再起動中...",
      "configSavedRestarted": "設定を保存しました、サーバーを再起動しました",
      "saveFailed": "保存に失敗しました、もう一度お試しください"
    },
    "serverAdd": {
      "subtitle": "新しい Model Context Protocol サーバーを設定",
      "infoTitle": "MCP サーバーを追加",
      "infoDesc": "以下に情報を入力して新しい MCP サーバーを追加してください。STDIO タイプはローカルプロセス通信用、HTTP タイプはリモートサーバー接続用です。"
    },
    "sources": {
      "builtin": "内蔵サービス",
      "custom": "カスタムサービス"
    }
  },

  // Knowledge Base
  "knowledge": {
    "title": "ナレッジベース",
    "listTitle": "ナレッジベースリスト"
  },

  // Errors
  "error": {
    "unknown": "不明なエラー",
    "network": "ネットワークエラー",
    "timeout": "リクエストタイムアウト",
    "invalidUrl": "無効な URL",
    "connectionFailed": "接続失敗",
    "apiKeyRequired": "API キーが必要です",
    "invalidApiKey": "無効な API キー",
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
