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
    "disabled": "Disabled",
    "copy": "Copy",
    "reset": "Reset"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "An intelligent chat application powered by AI",
    "version": "Version"
  },

  // Layout
  "layout": {
    "collapseSidebar": "Collapse Sidebar",
    "expandSidebar": "Expand Sidebar"
  },

  // Navigation
  "nav": {
    "home": "Home",
    "chat": "Chat",
    "settings": "Settings",
    "profile": "Profile",
    "knowledge": "Knowledge Base"
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
    "copied": "Copied!",
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
    "title": "Settings",
    "api": {
      "title": "API Keys",
      "description": "Configure API keys for LLM providers",
      "keyPlaceholder": "sk-...",
      "descriptionDeepSeek": "Cost-effective large models, supporting DeepSeek-Chat and DeepSeek-R1 reasoning models",
      "descriptionOpenRouter": "Access multiple AI models through OpenRouter, including GPT-4, Claude, Gemini, etc.",
      "descriptionOpenAI": "Official OpenAI API, supporting GPT-4o, GPT-4 and other models",
      "linkTextDeepSeek": "Get from DeepSeek",
      "linkTextOpenRouter": "Get from OpenRouter",
      "linkTextOpenAI": "Get from OpenAI",
      "getConfigured": "Configured",
      "saveSuccess": "Saved successfully",
      "save": "Save",
      "configureKeyFirst": "Please configure {{provider}} API Key first"
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
      "apiKeys": "API Keys",
      "selectModel": "Model"
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
    "language": "Language / 语言"
  },

  // Sidebar
  "sidebar": {
    "mcpConnected": "MCP Connected",
    "untitledChat": "Untitled Chat"
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
    "title": "MCP Servers",
    "servers": "Servers",
    "resources": "Resources",
    "prompts": "Prompts",
    "statsTab": "Statistics",
    "tools": "Tools",
    "addServer": "Add Server",
    "editServer": "Edit Server",
    "deleteServer": "Delete Server",
    "connect": "Connect",
    "disconnect": "Disconnect",
    "connected": "Connected",
    "disconnected": "Disconnected",
    "notConnected": "Not Connected",
    "error": "Error",
    "autoConnect": "Auto Connect",
    "enableAutoConnect": "Enable Auto Connect",
    "disableAutoConnect": "Disable Auto Connect",
    "refresh": "Refresh",
    "searchPlaceholder": "Search...",
    "searchToolsPlaceholder": "Search tools...",
    "clearSearch": "Clear",
    "confirmDeleteClick": "Click again to confirm delete",
    "adding": "Adding...",
    "saving": "Saving...",
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
    "tabs": {
      "servers": "Servers",
      "tools": "Tools",
      "resources": "Resources",
      "prompts": "Prompts",
      "stats": "Statistics",
      "env": "Env"
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
      "cwd": "Working Directory (cwd)",
      "cwdDesc": "Working directory for the process. Leave empty to use the default.",
      "cwdPlaceholder": "e.g. C:\\Users\\me\\my-mcp-server",
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
      "connections": "Connections",
      "requests": "Requests",
      "errors": "Errors",
      "tools": "Tools",
      "providers": "Providers",
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
      "connected": "Connected",
      "disconnected": "Disconnected",
      "error": "Error"
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
    "toolsDetail": {
      "empty": "No tools available",
      "emptyHint": "Please connect a server first",
      "selectToView": "Select a tool to view details",
      "description": "Description",
      "inputSchema": "Input Schema",
      "totalCount": "{{count}} tools in total"
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
