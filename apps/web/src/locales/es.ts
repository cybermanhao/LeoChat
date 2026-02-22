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
    "collapseSidebar": "Contraer barra lateral",
    "expandSidebar": "Expandir barra lateral"
  },

  // Navigation
  "nav": {
    "home": "Inicio",
    "chat": "Chat",
    "settings": "Configuración",
    "profile": "Perfil",
    "knowledge": "Base de Conocimientos"
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
    "welcome": "Bienvenido a LeoChat",
    "welcomeDescription": "Inicia una conversación o interactúa con tu entorno usando herramientas MCP",
    "confirmClear": "¿Estás seguro de que quieres limpiar la conversación actual?",
    "clear": "Limpiar",
    "clearConversation": "Limpiar Conversación",
    "markdown": "Markdown",
    "plainText": "Texto Plano",
    "markdownRendering": "Renderizado Markdown",
    "placeholderDefault": "Escribe un mensaje, o usa @tool para llamar herramientas MCP...",
    "placeholderWithPrompt": "Prompt del sistema activado...",
    "webSearch": "Búsqueda Web",
    "suggestions": {
      "code": "Ayúdame a escribir código",
      "explain": "Explica este concepto",
      "translate": "Traducir al inglés",
      "summarize": "Resume este artículo"
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
      "descriptionMoonshot": "Moonshot Kimi, soporta contexto ultra-largo hasta 128K tokens",
      "linkTextMoonshot": "Obtener desde Moonshot",
      "getConfigured": "Configurado",
      "saveSuccess": "Guardado exitosamente",
      "save": "Guardar",
      "configureKeyFirst": "Por favor configure la clave API de {{provider}} primero"
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
      "selectModel": "Modelo"
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

  // Sidebar
  "sidebar": {
    "mcpConnected": "MCP Conectado",
    "untitledChat": "Chat Sin Título"
  },

  // Models
  "models": {
    "searchPlaceholder": "Buscar modelos...",
    "deepseek": {
      "chat": { "description": "Modelo de chat general, rentable" },
      "reasoner": { "description": "Modelo mejorado de razonamiento con cadena de pensamiento" }
    },
    "openai": {
      "gpt4o": { "description": "Modelo multimodal más potente" },
      "gpt4oMini": { "description": "Rápido y económico" },
      "gpt4Turbo": { "description": "Potente capacidad de razonamiento" }
    },
    "anthropic": {
      "sonnet": { "description": "Excelente programación y razonamiento" },
      "opus": { "description": "Modelo Claude más potente" }
    },
    "google": {
      "geminiPro": { "description": "Ventana de contexto extra larga" }
    },
    "moonshot": {
      "8k": { "description": "Para conversaciones cortas, respuesta rápida" },
      "32k": { "description": "Maneja documentos largos, equilibrado" },
      "128k": { "description": "Contexto ultra-largo, puede procesar un libro entero" }
    },
    "common": {
      "viaOpenRouter": "Acceso vía OpenRouter"
    },
    "context": "Contexto",
    "viewAllModels": "Ver todos los modelos"
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
    "notConnected": "No Conectado",
    "error": "Error",
    "autoConnect": "Conexión Automática",
    "enableAutoConnect": "Habilitar Conexión Automática",
    "disableAutoConnect": "Deshabilitar Conexión Automática",
    "refresh": "Actualizar",
    "searchPlaceholder": "Buscar...",
    "searchToolsPlaceholder": "Buscar herramientas...",
    "clearSearch": "Limpiar",
    "confirmDeleteClick": "Haz clic de nuevo para confirmar eliminación",
    "adding": "Añadiendo...",
    "saving": "Guardando...",
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
      "servers": "Servidores",
      "tools": "Herramientas",
      "resources": "Recursos",
      "prompts": "Prompts",
      "stats": "Estadísticas"
    },
    "transport": {
      "stdio": {
        "desc": "Comunicación de Proceso",
        "description": "Comunicarse con el proceso local vía STDIO"
      },
      "http": {
        "desc": "Conexión HTTP",
        "description": "Conectarse al servicio remoto vía Streamable HTTP"
      }
    },
    "form": {
      "serverNamePlaceholder": "Nombre del Servidor",
      "serverNameExample": "ej., Memory Server",
      "commandPlaceholder": "Comando (ej., npx)",
      "commandExample": "ej., npx o uvx",
      "argsPlaceholder": "Argumentos (separados por espacios)",
      "argPlaceholder": "Valor del argumento...",
      "argExample1": "ej., -y",
      "argExample2": "ej., @modelcontextprotocol/server-memory",
      "urlPlaceholder": "http://localhost:3000/mcp",
      "descriptionPlaceholder": "Describe brevemente la función de este servidor...",
      "authorPlaceholder": "ej., Anthropic, OpenAI",
      "tagsPlaceholder": "tag1, tag2, tag3",
      "logoPlaceholder": "https://example.com/logo.png",
      "envNamePlaceholder": "Nombre de Variable",
      "envValuePlaceholder": "Valor",
      "deleteArg": "Eliminar este argumento",
      "deleteEnv": "Eliminar esta variable de entorno",
      "addArgHint": "Añadir nuevo argumento (o presiona Enter en el input)",
      "addEnvHint": "Añadir variable de entorno (o presiona Enter)",
      "allowedPathsDesc": "Rutas de directorio permitidas (puedes añadir múltiples)",
      "basicInfo": "Información Básica",
      "name": "Nombre",
      "connectionType": "Tipo de Conexión",
      "stdioConfig": "Configuración STDIO",
      "httpConfig": "Configuración HTTP",
      "command": "Comando",
      "commandDesc": "Comando para iniciar el servidor MCP, ej., npx, node, python, etc.",
      "args": "Argumentos",
      "addArg": "Añadir Argumento",
      "serverUrl": "URL del Servidor",
      "serverUrlDesc": "URL completa del servidor MCP remoto",
      "autoConnectLabel": "Conexión automática al iniciar",
      "advancedSettings": "Configuración Avanzada",
      "description": "Descripción",
      "env": "Variables de Entorno",
      "timeout": "Tiempo de espera (milisegundos)",
      "tags": "Etiquetas",
      "tagsSeparator": "Separa múltiples etiquetas con comas",
      "longRunning": "Servidor de Ejecución Larga",
      "stdioDesc": "Comunicación de proceso local",
      "httpDesc": "Conexión HTTP remota",
      "registryConfig": "Configuración de Registry"
    },
    "stats": {
      "connections": "Conexiones",
      "requests": "Solicitudes",
      "errors": "Errores",
      "tools": "Herramientas",
      "providers": "Proveedores",
      "servers": "Servidores",
      "resources": "Recursos",
      "prompts": "Prompts",
      "connectionStatus": "Estado de Conexión",
      "serverDetails": "Detalles del Servidor",
      "tableHeader": {
        "name": "Nombre",
        "protocol": "Protocolo",
        "status": "Estado",
        "tools": "Herramientas",
        "resources": "Recursos"
      }
    },
    "status": {
      "connected": "Conectado",
      "disconnected": "Desconectado",
      "error": "Error"
    },
    "toolsDetail": {
      "empty": "No hay herramientas disponibles",
      "emptyHint": "Por favor conecta un servidor primero",
      "selectToView": "Selecciona una herramienta para ver detalles",
      "description": "Descripción",
      "inputSchema": "Esquema de Entrada",
      "totalCount": "{{count}} herramientas en total"
    },
    "resourcesDetail": {
      "empty": "No hay recursos disponibles",
      "emptyDescription": "Los servidores conectados no proporcionan recursos",
      "loadError": "Error al cargar el contenido del recurso",
      "description": "Descripción",
      "contentPreview": "Vista Previa del Contenido",
      "noContent": "Sin contenido",
      "loading": "Cargando...",
      "selectToView": "Selecciona un recurso para ver detalles",
      "totalCount": "{{count}} recursos en total"
    },
    "promptsDetail": {
      "empty": "No hay prompts disponibles",
      "emptyDescription": "Los servidores conectados no proporcionan plantillas de prompt",
      "totalCount": "{{count}} prompts en total",
      "description": "Descripción",
      "arguments": "Argumentos",
      "required": "Requerido",
      "selectToView": "Selecciona un prompt para ver detalles"
    },
    "serversDetail": {
      "empty": "No hay servidores MCP",
      "emptyHint": "Haz clic en el botón \"Añadir MCP\" a la izquierda para comenzar"
    },
    "serverEdit": {
      "generalSettings": "Configuración General",
      "toolsWithCount": "Herramientas ({{count}})",
      "resourcesWithCount": "Recursos ({{count}})",
      "notFound": "Servidor No Encontrado",
      "notFoundDesc": "Este servidor no existe o ha sido eliminado",
      "backToList": "Volver a la Lista de Servidores",
      "editSubtitle": "Editar configuración del servidor MCP",
      "configSaved": "Configuración guardada",
      "restarting": "Reiniciando servidor para aplicar nueva configuración...",
      "configSavedRestarted": "Configuración guardada, servidor reiniciado",
      "saveFailed": "Error al guardar, por favor intenta de nuevo"
    },
    "serverAdd": {
      "subtitle": "Configurar un nuevo servidor Model Context Protocol",
      "infoTitle": "Añadir Servidor MCP",
      "infoDesc": "Completa la información a continuación para añadir un nuevo servidor MCP. El tipo STDIO es para comunicación de proceso local, el tipo HTTP es para conexiones de servidor remoto."
    },
    "sources": {
      "builtin": "Servicios Integrados",
      "custom": "Servicios Personalizados"
    }
  },

  // Knowledge Base
  "knowledge": {
    "title": "Base de Conocimientos",
    "listTitle": "Lista de Base de Conocimientos"
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
