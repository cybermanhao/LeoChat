import { TranslationDictionary } from "../lib/i18n";

const fr: TranslationDictionary = {
  // Common
  "common": {
    "save": "Enregistrer",
    "cancel": "Annuler",
    "close": "Fermer",
    "ok": "OK",
    "yes": "Oui",
    "no": "Non",
    "confirm": "Confirmer",
    "delete": "Supprimer",
    "edit": "Modifier",
    "add": "Ajouter",
    "search": "Rechercher",
    "settings": "Paramètres",
    "language": "Langue",
    "appearance": "Apparence",
    "theme": "Thème",
    "enabled": "Activé",
    "disabled": "Désactivé",
    "copy": "Copy",
    "reset": "Reset"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "Une application de chat intelligente alimentée par l'IA",
    "version": "Version"
  },

  // Layout
  "layout": {
    "collapseSidebar": "Collapse Sidebar",
    "expandSidebar": "Expand Sidebar"
  },

  // Navigation
  "nav": {
    "home": "Accueil",
    "chat": "Chat",
    "settings": "Paramètres",
    "profile": "Profil",
    "knowledge": "Knowledge Base"
  },

  // Chat
  "chat": {
    "title": "Chat",
    "send": "Envoyer",
    "inputPlaceholder": "Tapez votre message ici...",
    "newChat": "Nouveau Chat",
    "history": "Historique",
    "clearHistory": "Effacer l'historique",
    "copyMessage": "Copier le message",
    "copied": "Copié !",
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
    "title": "Paramètres",
    "api": {
      "title": "Clés API",
      "description": "Configurer les clés API pour les fournisseurs LLM",
      "keyPlaceholder": "sk-...",
      "descriptionDeepSeek": "Modèles grands nationaux rentables, prenant en charge les modèles d'inférence DeepSeek-Chat et DeepSeek-R1",
      "descriptionOpenRouter": "Accéder à plusieurs modèles d'IA via OpenRouter, notamment GPT-4, Claude, Gemini, etc.",
      "descriptionOpenAI": "API officielle OpenAI, prenant en charge les modèles GPT-4o, GPT-4 et autres",
      "linkTextDeepSeek": "Obtenir depuis DeepSeek",
      "linkTextOpenRouter": "Obtenir depuis OpenRouter",
      "linkTextOpenAI": "Obtenir depuis OpenAI",
      "getConfigured": "Configuré",
      "saveSuccess": "Enregistré avec succès",
      "save": "Enregistrer",
      "configureKeyFirst": "Please configure {{provider}} API Key first"
    },
    "appearance": {
      "title": "Apparence",
      "description": "Personnaliser le thème et la palette de couleurs de l'application",
      "lightThemes": "Thèmes clairs",
      "darkThemes": "Thèmes sombres",
      "currentTheme": "Thème actuel",
      "clickToSwitch": "Cliquez pour basculer"
    },
    "model": {
      "title": "Modèle de langage",
      "description": "Configurer les clés API et les paramètres du modèle",
      "defaultProvider": "Fournisseur par défaut",
      "apiKeys": "Clés API",
      "selectModel": "Model"
    },
    "notifications": {
      "title": "Notifications"
    },
    "privacy": {
      "title": "Vie privée et sécurité"
    },
    "advanced": {
      "title": "Avancé"
    },
    "developmentNotice": "Plus de paramètres sont en développement",
    "developmentNoticeDesc": "Le panneau de configuration complet sera disponible dans les futures versions, restez à l'écoute."
  },

  // Quick Access
  "quickAccess": {
    "email": "Envoyer un email",
    "github": "Dépôt GitHub",
    "language": "Langue / Language"
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
    "title": "Serveurs MCP",
    "servers": "Serveurs",
    "resources": "Ressources",
    "prompts": "Instructions",
    "statsTab": "Statistiques",
    "tools": "Outils",
    "addServer": "Ajouter un serveur",
    "editServer": "Modifier le serveur",
    "deleteServer": "Supprimer le serveur",
    "connect": "Connecter",
    "disconnect": "Déconnecter",
    "connected": "Connecté",
    "disconnected": "Déconnecté",
    "notConnected": "Not Connected",
    "error": "Erreur",
    "autoConnect": "Connexion automatique",
    "enableAutoConnect": "Enable Auto Connect",
    "disableAutoConnect": "Disable Auto Connect",
    "refresh": "Actualiser",
    "searchPlaceholder": "Rechercher...",
    "searchToolsPlaceholder": "Search tools...",
    "clearSearch": "Clear",
    "confirmDeleteClick": "Click again to confirm delete",
    "adding": "Adding...",
    "saving": "Saving...",
    "serverName": "Nom du serveur",
    "serverUrl": "URL du serveur",
    "serverDescription": "Description",
    "serverAuth": "Authentification",
    "serverTimeout": "Délai d'attente (secondes)",
    "serverTools": "Outils",
    "serverEnvs": "Variables d'environnement",
    "serverSave": "Enregistrer",
    "serverCancel": "Annuler",
    "serverTest": "Tester la connexion",
    "serverTestSuccess": "Connexion réussie !",
    "serverTestFailed": "Échec de la connexion !",
    "serverAddSuccess": "Serveur ajouté avec succès !",
    "serverUpdateSuccess": "Serveur mis à jour avec succès !",
    "serverDeleteConfirm": "Êtes-vous sûr de vouloir supprimer ce serveur ?",
    "serverDeleteSuccess": "Serveur supprimé avec succès !",
    "serverConnectionError": "Erreur de connexion",
    "serverConnectionSuccess": "Connecté avec succès !",
    "toolEnabled": "Activé",
    "toolDisabled": "Désactivé",
    "resourceContent": "Contenu des ressources",
    "promptApply": "Appliquer l'instruction",
    "promptApplied": "Instruction appliquée !",
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
      "connections": "Connexions",
      "requests": "Requêtes",
      "errors": "Erreurs",
      "tools": "Outils",
      "providers": "Fournisseurs",
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
      "connected": "Connecté",
      "disconnected": "Déconnecté",
      "error": "Erreur"
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
    "unknown": "Erreur inconnue",
    "network": "Erreur réseau",
    "timeout": "Délai de requête dépassé",
    "invalidUrl": "URL invalide",
    "connectionFailed": "Échec de la connexion",
    "apiKeyRequired": "La clé API est requise",
    "invalidApiKey": "Clé API invalide",
    "rateLimit": "Limite de fréquence dépassée",
    "serverError": "Erreur serveur",
    "notImplemented": "Pas encore implémenté"
  },

  // Success
  "success": {
    "operationCompleted": "Opération terminée",
    "saved": "Enregistré",
    "deleted": "Supprimé",
    "created": "Créé",
    "updated": "Mis à jour"
  }
};

export default fr;
