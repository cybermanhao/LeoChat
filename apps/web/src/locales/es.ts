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
    "disabled": "Deshabilitado"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "Una aplicación de chat inteligente impulsada por IA",
    "version": "Versión"
  },

  // Navigation
  "nav": {
    "home": "Inicio",
    "chat": "Chat",
    "settings": "Configuración",
    "profile": "Perfil"
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
    "copied": "¡Copiado!"
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
      "save": "Guardar"
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
      "apiKeys": "Claves API"
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

  // MCP
  "mcp": {
    "title": "Servidores MCP",
    "servers": "Servidores",
    "resources": "Recursos",
    "prompts": "Indicaciones",
    "stats": "Estadísticas",
    "addServer": "Agregar Servidor",
    "editServer": "Editar Servidor",
    "deleteServer": "Eliminar Servidor",
    "connect": "Conectar",
    "disconnect": "Desconectar",
    "connected": "Conectado",
    "disconnected": "Desconectado",
    "error": "Error",
    "autoConnect": "Conexión Automática",
    "refresh": "Actualizar",
    "searchPlaceholder": "Buscar...",
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
    "stats": {
      "connections": "Conexiones",
      "requests": "Solicitudes",
      "errors": "Errores",
      "tools": "Herramientas",
      "providers": "Proveedores"
    },
    "status": {
      "connected": "Conectado",
      "disconnected": "Desconectado",
      "error": "Error"
    }
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