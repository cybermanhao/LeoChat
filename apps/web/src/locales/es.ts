import { TranslationDictionary } from "../lib/i18n";

const es: TranslationDictionary = {
  // Common
  "common": {
    "save": "Guardar",
    "cancel": "Cancelar",
    "close": "Cerrar",
    "ok": "Aceptar",
    "yes": "Sí",
    "no": "No",
    "confirm": "Confirmar",
    "delete": "Eliminar",
    "edit": "Editar",
    "add": "Agregar",
    "search": "Buscar",
    "settings": "Configuración",
    "language": "Idioma",
    "appearance": "Apariencia",
    "theme": "Tema",
    "enabled": "Habilitado",
    "disabled": "Deshabilitado",
    "copy": "Copy",
    "reset": "Reset"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "Una aplicación de chat inteligente impulsada por IA",
    "version": "Versión"
  },

  // Layout
  "layout": {
    "collapseSidebar": "Collapse Sidebar",
    "expandSidebar": "Expand Sidebar"
  },

  // Navigation
  "nav": {
    "home": "Inicio",
    "chat": "Chat",
    "settings": "Configuración",
    "profile": "Perfil",
    "knowledge": "Knowledge Base"
  },

  // Chat
  "chat": {
    "title": "Chat",
    "send": "Enviar",
    "inputPlaceholder": "Escribe tu mensaje aquí...",
    "newChat": "Nueva Conversación",
    "history": "Historial",
    "clearHistory": "Limpiar Historial",
    "copyMessage": "Copiar Mensaje",
    "copied": "¡Copiado!",
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
    "title": "Configuración",
    "api": {
      "title": "Claves API",
      "description": "Configurar claves API para proveedores LLM",
      "keyPlaceholder": "sk-...",
      "descriptionDeepSeek": "Modelos grandes nacionales rentables, compatibles con modelos de inferencia DeepSeek-Chat y DeepSeek-R1",
      "descriptionOpenRouter": "Acceder a múltiples modelos de IA a través de OpenRouter, incluyendo GPT-4, Claude, Gemini, etc.",
      "descriptionOpenAI": "API oficial de OpenAI, compatible con modelos GPT-4o, GPT-4 y otros",
      "linkTextDeepSeek": "Obtener desde DeepSeek",
      "linkTextOpenRouter": "Obtener desde OpenRouter",
      "linkTextOpenAI": "Obtener desde OpenAI",
      "getConfigured": "Configurado",
      "saveSuccess": "Guardado exitosamente",
      "save": "Guardar",
      "configureKeyFirst": "Please configure {{provider}} API Key first"
    },
    "appearance": {
      "title": "Apariencia",
      "description": "Personalizar el tema y la combinación de colores de la aplicación",
      "lightThemes": "Temas Claros",
      "darkThemes": "Temas Oscuros",
      "currentTheme": "Tema Actual",
      "clickToSwitch": "Haga clic para cambiar"
    },
    "model": {
      "title": "Modelo de Lenguaje",
      "description": "Configurar claves API y parámetros del modelo",
      "defaultProvider": "Proveedor Predeterminado",
      "apiKeys": "Claves API",
      "selectModel": "Model"
    },
    "notifications": {
      "title": "Notificaciones"
    },
    "privacy": {
      "title": "Privacidad y Seguridad"
    },
    "advanced": {
      "title": "Avanzado"
    },
    "developmentNotice": "Más configuraciones están en desarrollo",
    "developmentNoticeDesc": "El panel de configuración completo se proporcionará en versiones futuras, manténganse al tanto."
  },

  // Quick Access
  "quickAccess": {
    "email": "Enviar Correo Electrónico",
    "github": "Repositorio GitHub",
    "language": "Idioma / Language"
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
    "title": "Servidores MCP",
    "servers": "Servidores",
    "resources": "Recursos",
    "prompts": "Indicaciones",
    "statsTab": "Estadísticas",
    "tools": "Herramientas",
    "addServer": "Agregar Servidor",
    "editServer": "Editar Servidor",
    "deleteServer": "Eliminar Servidor",
    "connect": "Conectar",
    "disconnect": "Desconectar",
    "connected": "Conectado",
    "disconnected": "Desconectado",
    "notConnected": "Not Connected",
    "error": "Error",
    "autoConnect": "Conexión Automática",
    "enableAutoConnect": "Enable Auto Connect",
    "disableAutoConnect": "Disable Auto Connect",
    "refresh": "Actualizar",
    "searchPlaceholder": "Buscar...",
    "searchToolsPlaceholder": "Search tools...",
    "clearSearch": "Clear",
    "confirmDeleteClick": "Click again to confirm delete",
    "adding": "Adding...",
    "saving": "Saving...",
    "serverName": "Nombre del Servidor",
    "serverUrl": "URL del Servidor",
    "serverDescription": "Descripción",
    "serverAuth": "Autenticación",
    "serverTimeout": "Tiempo de espera (segundos)",
    "serverTools": "Herramientas",
    "serverEnvs": "Variables de Entorno",
    "serverSave": "Guardar",
    "serverCancel": "Cancelar",
    "serverTest": "Probar Conexión",
    "serverTestSuccess": "¡Conexión exitosa!",
    "serverTestFailed": "¡Conexión fallida!",
    "serverAddSuccess": "¡Servidor agregado exitosamente!",
    "serverUpdateSuccess": "¡Servidor actualizado exitosamente!",
    "serverDeleteConfirm": "¿Está seguro de que desea eliminar este servidor?",
    "serverDeleteSuccess": "¡Servidor eliminado exitosamente!",
    "serverConnectionError": "Error de conexión",
    "serverConnectionSuccess": "¡Conectado exitosamente!",
    "toolEnabled": "Habilitado",
    "toolDisabled": "Deshabilitado",
    "resourceContent": "Contenido del Recurso",
    "promptApply": "Aplicar Indicación",
    "promptApplied": "¡Indicación aplicada!",
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
      "connections": "Conexiones",
      "requests": "Solicitudes",
      "errors": "Errores",
      "tools": "Herramientas",
      "providers": "Proveedores",
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
      "connected": "Conectado",
      "disconnected": "Desconectado",
      "error": "Error"
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
    "unknown": "Error desconocido",
    "network": "Error de red",
    "timeout": "Tiempo de espera agotado",
    "invalidUrl": "URL inválida",
    "connectionFailed": "Conexión fallida",
    "apiKeyRequired": "Se requiere clave API",
    "invalidApiKey": "Clave API inválida",
    "rateLimit": "Límite de frecuencia excedido",
    "serverError": "Error del servidor",
    "notImplemented": "Aún no implementado"
  },

  // Success
  "success": {
    "operationCompleted": "Operación completada",
    "saved": "Guardado",
    "deleted": "Eliminado",
    "created": "Creado",
    "updated": "Actualizado"
  }
};

export default es;
