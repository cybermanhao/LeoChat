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
    "disabled": "無効"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "AI搭載のインテリジェントチャットアプリケーション",
    "version": "バージョン"
  },

  // Navigation
  "nav": {
    "home": "ホーム",
    "chat": "チャット",
    "settings": "設定",
    "profile": "プロフィール"
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
    "copied": "コピーしました！"
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
      "save": "保存"
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
      "apiKeys": "APIキー"
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

  // MCP
  "mcp": {
    "title": "MCPサーバー",
    "servers": "サーバー",
    "resources": "リソース",
    "prompts": "プロンプト",
    "stats": "統計",
    "addServer": "サーバー追加",
    "editServer": "サーバー編集",
    "deleteServer": "サーバー削除",
    "connect": "接続",
    "disconnect": "切断",
    "connected": "接続済み",
    "disconnected": "切断済み",
    "error": "エラー",
    "autoConnect": "自動接続",
    "refresh": "更新",
    "searchPlaceholder": "検索...",
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
    "stats": {
      "connections": "接続数",
      "requests": "リクエスト",
      "errors": "エラー",
      "tools": "ツール",
      "providers": "プロバイダー"
    },
    "status": {
      "connected": "接続済み",
      "disconnected": "切断済み",
      "error": "エラー"
    }
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