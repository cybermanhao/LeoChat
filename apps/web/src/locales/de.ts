import { TranslationDictionary } from "../lib/i18n";

const de: TranslationDictionary = {
  // Common
  "common": {
    "save": "Speichern",
    "cancel": "Abbrechen",
    "close": "Schließen",
    "ok": "OK",
    "yes": "Ja",
    "no": "Nein",
    "confirm": "Bestätigen",
    "delete": "Löschen",
    "edit": "Bearbeiten",
    "add": "Hinzufügen",
    "search": "Suchen",
    "settings": "Einstellungen",
    "language": "Sprache",
    "appearance": "Erscheinungsbild",
    "theme": "Design",
    "enabled": "Aktiviert",
    "disabled": "Deaktiviert",
    "copy": "Copy",
    "reset": "Reset"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "Eine von KI unterstützte intelligente Chat-Anwendung",
    "version": "Version"
  },

  // Layout
  "layout": {
    "collapseSidebar": "Collapse Sidebar",
    "expandSidebar": "Expand Sidebar"
  },

  // Navigation
  "nav": {
    "home": "Startseite",
    "chat": "Chat",
    "settings": "Einstellungen",
    "profile": "Profil",
    "knowledge": "Knowledge Base"
  },

  // Chat
  "chat": {
    "title": "Chat",
    "send": "Senden",
    "inputPlaceholder": "Geben Sie Ihre Nachricht hier ein...",
    "newChat": "Neuer Chat",
    "history": "Verlauf",
    "clearHistory": "Verlauf löschen",
    "copyMessage": "Nachricht kopieren",
    "copied": "Kopiert!",
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
    "title": "Einstellungen",
    "api": {
      "title": "API-Schlüssel",
      "description": "API-Schlüssel für LLM-Anbieter konfigurieren",
      "keyPlaceholder": "sk-...",
      "descriptionDeepSeek": "Kostengünstige nationale Großmodelle, unterstützt DeepSeek-Chat- und DeepSeek-R1-Inferenzmodelle",
      "descriptionOpenRouter": "Zugriff auf mehrere KI-Modelle über OpenRouter, einschließlich GPT-4, Claude, Gemini usw.",
      "descriptionOpenAI": "Offizielles OpenAI-API, unterstützt GPT-4o, GPT-4 und andere Modelle",
      "linkTextDeepSeek": "Von DeepSeek erhalten",
      "linkTextOpenRouter": "Von OpenRouter erhalten",
      "linkTextOpenAI": "Von OpenAI erhalten",
      "getConfigured": "Konfiguriert",
      "saveSuccess": "Erfolgreich gespeichert",
      "save": "Speichern",
      "configureKeyFirst": "Please configure {{provider}} API Key first"
    },
    "appearance": {
      "title": "Erscheinungsbild",
      "description": "Design und Farbschema der Anwendung anpassen",
      "lightThemes": "Helle Designs",
      "darkThemes": "Dunkle Designs",
      "currentTheme": "Aktuelles Design",
      "clickToSwitch": "Zum Wechseln klicken"
    },
    "model": {
      "title": "Sprachmodell",
      "description": "API-Schlüssel und Modellparameter konfigurieren",
      "defaultProvider": "Standardanbieter",
      "apiKeys": "API-Schlüssel",
      "selectModel": "Model"
    },
    "notifications": {
      "title": "Benachrichtigungen"
    },
    "privacy": {
      "title": "Datenschutz & Sicherheit"
    },
    "advanced": {
      "title": "Erweitert"
    },
    "developmentNotice": "Weitere Einstellungen sind in Entwicklung",
    "developmentNoticeDesc": "Das vollständige Einstellungsfeld wird in zukünftigen Versionen bereitgestellt, bleiben Sie dran."
  },

  // Quick Access
  "quickAccess": {
    "email": "E-Mail senden",
    "github": "GitHub-Repository",
    "language": "Sprache / Language"
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
    "title": "MCP-Server",
    "servers": "Server",
    "resources": "Ressourcen",
    "prompts": "Aufforderungen",
    "statsTab": "Statistiken",
    "tools": "Werkzeuge",
    "addServer": "Server hinzufügen",
    "editServer": "Server bearbeiten",
    "deleteServer": "Server löschen",
    "connect": "Verbinden",
    "disconnect": "Trennen",
    "connected": "Verbunden",
    "disconnected": "Getrennt",
    "notConnected": "Not Connected",
    "error": "Fehler",
    "autoConnect": "Automatische Verbindung",
    "enableAutoConnect": "Enable Auto Connect",
    "disableAutoConnect": "Disable Auto Connect",
    "refresh": "Aktualisieren",
    "searchPlaceholder": "Suchen...",
    "searchToolsPlaceholder": "Search tools...",
    "clearSearch": "Clear",
    "confirmDeleteClick": "Click again to confirm delete",
    "adding": "Adding...",
    "saving": "Saving...",
    "serverName": "Servername",
    "serverUrl": "Server-URL",
    "serverDescription": "Beschreibung",
    "serverAuth": "Authentifizierung",
    "serverTimeout": "Zeitüberschreitung (Sekunden)",
    "serverTools": "Werkzeuge",
    "serverEnvs": "Umgebungsvariablen",
    "serverSave": "Speichern",
    "serverCancel": "Abbrechen",
    "serverTest": "Verbindung testen",
    "serverTestSuccess": "Verbindung erfolgreich!",
    "serverTestFailed": "Verbindung fehlgeschlagen!",
    "serverAddSuccess": "Server erfolgreich hinzugefügt!",
    "serverUpdateSuccess": "Server erfolgreich aktualisiert!",
    "serverDeleteConfirm": "Sind Sie sicher, dass Sie diesen Server löschen möchten?",
    "serverDeleteSuccess": "Server erfolgreich gelöscht!",
    "serverConnectionError": "Verbindungsfehler",
    "serverConnectionSuccess": "Erfolgreich verbunden!",
    "toolEnabled": "Aktiviert",
    "toolDisabled": "Deaktiviert",
    "resourceContent": "Ressourceninhalt",
    "promptApply": "Aufforderung anwenden",
    "promptApplied": "Aufforderung angewendet!",
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
      "connections": "Verbindungen",
      "requests": "Anfragen",
      "errors": "Fehler",
      "tools": "Werkzeuge",
      "providers": "Anbieter",
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
      "connected": "Verbunden",
      "disconnected": "Getrennt",
      "error": "Fehler"
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
    "unknown": "Unbekannter Fehler",
    "network": "Netzwerkfehler",
    "timeout": "Zeitüberschreitung der Anfrage",
    "invalidUrl": "Ungültige URL",
    "connectionFailed": "Verbindung fehlgeschlagen",
    "apiKeyRequired": "API-Schlüssel ist erforderlich",
    "invalidApiKey": "Ungültiger API-Schlüssel",
    "rateLimit": "Ratenlimit überschritten",
    "serverError": "Serverfehler",
    "notImplemented": "Noch nicht implementiert"
  },

  // Success
  "success": {
    "operationCompleted": "Vorgang abgeschlossen",
    "saved": "Gespeichert",
    "deleted": "Gelöscht",
    "created": "Erstellt",
    "updated": "Aktualisiert"
  }
};

export default de;
