import { TranslationDictionary } from "../lib/i18n";

const en: TranslationDictionary = {
  // Common
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "close": "Close",
    "ok": "OK",
    "yes": "Yes",
    "no": "No",
    "confirm": "Confirm",
    "delete": "Delete",
    "edit": "Edit",
    "add": "Add",
    "search": "Search",
    "settings": "Settings",
    "language": "Language",
    "appearance": "Appearance",
    "theme": "Theme",
    "enabled": "Enabled",
    "disabled": "Disabled"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "An intelligent chat application powered by AI",
    "version": "Version"
  },

  // Navigation
  "nav": {
    "home": "Home",
    "chat": "Chat",
    "settings": "Settings",
    "profile": "Profile"
  },

  // Chat
  "chat": {
    "title": "Chat",
    "send": "Send",
    "inputPlaceholder": "Type your message here...",
    "newChat": "New Chat",
    "history": "History",
    "clearHistory": "Clear History",
    "copyMessage": "Copy Message",
    "copied": "Copied!"
  },

  // Settings
  "settings": {
    "title": "Settings",
    "api": {
      "title": "API Keys",
      "description": "Configure API keys for LLM providers",
      "keyPlaceholder": "sk-...",
      "descriptionDeepSeek": "Cost-effective domestic large models, supporting DeepSeek-Chat and DeepSeek-R1 inference models",
      "descriptionOpenRouter": "Access multiple AI models through OpenRouter, including GPT-4, Claude, Gemini, etc.",
      "descriptionOpenAI": "Official OpenAI API, supporting GPT-4o, GPT-4 and other models",
      "linkTextDeepSeek": "Get from DeepSeek",
      "linkTextOpenRouter": "Get from OpenRouter",
      "linkTextOpenAI": "Get from OpenAI",
      "getConfigured": "Configured",
      "saveSuccess": "Saved successfully",
      "save": "Save"
    },
    "appearance": {
      "title": "Appearance",
      "description": "Customize the application's theme and color scheme",
      "lightThemes": "Light Themes",
      "darkThemes": "Dark Themes",
      "currentTheme": "Current Theme",
      "clickToSwitch": "Click to switch"
    },
    "model": {
      "title": "Language Model",
      "description": "Configure API keys and model parameters",
      "defaultProvider": "Default Provider",
      "apiKeys": "API Keys"
    },
    "notifications": {
      "title": "Notifications"
    },
    "privacy": {
      "title": "Privacy & Security"
    },
    "advanced": {
      "title": "Advanced"
    },
    "developmentNotice": "More settings are under development",
    "developmentNoticeDesc": "The complete settings panel will be provided in future versions, please stay tuned."
  },

  // Quick Access
  "quickAccess": {
    "email": "Send Email",
    "github": "GitHub Repository",
    "language": "Language / Language"
  },

  // MCP
  "mcp": {
    "title": "MCP Servers",
    "servers": "Servers",
    "resources": "Resources",
    "prompts": "Prompts",
    "stats": "Statistics",
    "addServer": "Add Server",
    "editServer": "Edit Server",
    "deleteServer": "Delete Server",
    "connect": "Connect",
    "disconnect": "Disconnect",
    "connected": "Connected",
    "disconnected": "Disconnected",
    "error": "Error",
    "autoConnect": "Auto Connect",
    "refresh": "Refresh",
    "searchPlaceholder": "Search...",
    "serverName": "Server Name",
    "serverUrl": "Server URL",
    "serverDescription": "Description",
    "serverAuth": "Authentication",
    "serverTimeout": "Timeout (seconds)",
    "serverTools": "Tools",
    "serverEnvs": "Environment Variables",
    "serverSave": "Save",
    "serverCancel": "Cancel",
    "serverTest": "Test Connection",
    "serverTestSuccess": "Connection successful!",
    "serverTestFailed": "Connection failed!",
    "serverAddSuccess": "Server added successfully!",
    "serverUpdateSuccess": "Server updated successfully!",
    "serverDeleteConfirm": "Are you sure you want to delete this server?",
    "serverDeleteSuccess": "Server deleted successfully!",
    "serverConnectionError": "Connection error",
    "serverConnectionSuccess": "Connected successfully!",
    "toolEnabled": "Enabled",
    "toolDisabled": "Disabled",
    "resourceContent": "Resource Content",
    "promptApply": "Apply Prompt",
    "promptApplied": "Prompt applied!",
    "stats": {
      "connections": "Connections",
      "requests": "Requests",
      "errors": "Errors",
      "tools": "Tools",
      "providers": "Providers"
    },
    "status": {
      "connected": "Connected",
      "disconnected": "Disconnected",
      "error": "Error"
    }
  },

  // Errors
  "error": {
    "unknown": "Unknown error",
    "network": "Network error",
    "timeout": "Request timeout",
    "invalidUrl": "Invalid URL",
    "connectionFailed": "Connection failed",
    "apiKeyRequired": "API key is required",
    "invalidApiKey": "Invalid API key",
    "rateLimit": "Rate limit exceeded",
    "serverError": "Server error",
    "notImplemented": "Not implemented yet"
  },

  // Success
  "success": {
    "operationCompleted": "Operation completed",
    "saved": "Saved",
    "deleted": "Deleted",
    "created": "Created",
    "updated": "Updated"
  }
};

export default en;