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
    "collapseSidebar": "Seitenleiste einklappen",
    "expandSidebar": "Seitenleiste ausklappen"
  },

  // Navigation
  "nav": {
    "home": "Startseite",
    "chat": "Chat",
    "settings": "Einstellungen",
    "profile": "Profil",
    "knowledge": "Wissensdatenbank"
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
    "welcome": "Willkommen bei LeoChat",
    "welcomeDescription": "Starten Sie eine Konversation oder interagieren Sie mit Ihrer Umgebung mithilfe von MCP-Tools",
    "confirmClear": "Möchten Sie die aktuelle Konversation wirklich löschen?",
    "clear": "Löschen",
    "clearConversation": "Konversation löschen",
    "markdown": "Markdown",
    "plainText": "Nur Text",
    "markdownRendering": "Markdown-Rendering",
    "placeholderDefault": "Geben Sie eine Nachricht ein oder verwenden Sie @tool, um MCP-Tools aufzurufen...",
    "placeholderWithPrompt": "System-Prompt aktiviert...",
    "webSearch": "Websuche",
    "suggestions": {
      "code": "Hilf mir beim Coden",
      "explain": "Erkläre dieses Konzept",
      "translate": "Ins Englische übersetzen",
      "summarize": "Fasse diesen Artikel zusammen"
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
      "configureKeyFirst": "Bitte konfigurieren Sie zuerst den {{provider}} API-Schlüssel"
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
      "selectModel": "Modell"
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

  // Sidebar
  "sidebar": {
    "mcpConnected": "MCP Verbunden",
    "untitledChat": "Unbenannter Chat"
  },

  // Models
  "models": {
    "searchPlaceholder": "Modelle suchen...",
    "deepseek": {
      "chat": { "description": "Allgemeines Chat-Modell, kostengünstig" },
      "reasoner": { "description": "Reasoning-verstärktes Modell mit Gedankenkette" }
    },
    "openai": {
      "gpt4o": { "description": "Leistungsstärkstes multimodales Modell" },
      "gpt4oMini": { "description": "Schnell und erschwinglich" },
      "gpt4Turbo": { "description": "Leistungsstarke Reasoning-Fähigkeit" }
    },
    "anthropic": {
      "sonnet": { "description": "Ausgezeichnete Programmierung und Reasoning" },
      "opus": { "description": "Leistungsstärkstes Claude-Modell" }
    },
    "google": {
      "geminiPro": { "description": "Extra-langes Kontextfenster" }
    },
    "common": {
      "viaOpenRouter": "Zugriff über OpenRouter"
    },
    "context": "Kontext",
    "viewAllModels": "Alle Modelle anzeigen"
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
    "notConnected": "Nicht Verbunden",
    "error": "Fehler",
    "autoConnect": "Automatische Verbindung",
    "enableAutoConnect": "Automatische Verbindung aktivieren",
    "disableAutoConnect": "Automatische Verbindung deaktivieren",
    "refresh": "Aktualisieren",
    "searchPlaceholder": "Suchen...",
    "searchToolsPlaceholder": "Tools suchen...",
    "clearSearch": "Löschen",
    "confirmDeleteClick": "Erneut klicken zum Bestätigen der Löschung",
    "adding": "Hinzufügen...",
    "saving": "Speichern...",
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
      "servers": "Server",
      "tools": "Tools",
      "resources": "Ressourcen",
      "prompts": "Prompts",
      "stats": "Statistiken"
    },
    "transport": {
      "stdio": {
        "desc": "Prozesskommunikation",
        "description": "Mit lokalem Prozess über STDIO kommunizieren"
      },
      "http": {
        "desc": "HTTP-Verbindung",
        "description": "Mit Remote-Service über Streamable HTTP verbinden"
      }
    },
    "form": {
      "serverNamePlaceholder": "Servername",
      "serverNameExample": "z.B. Memory Server",
      "commandPlaceholder": "Befehl (z.B. npx)",
      "commandExample": "z.B. npx oder uvx",
      "argsPlaceholder": "Argumente (durch Leerzeichen getrennt)",
      "argPlaceholder": "Argumentwert...",
      "argExample1": "z.B. -y",
      "argExample2": "z.B. @modelcontextprotocol/server-memory",
      "urlPlaceholder": "http://localhost:3000/mcp",
      "descriptionPlaceholder": "Beschreiben Sie kurz die Funktion dieses Servers...",
      "authorPlaceholder": "z.B. Anthropic, OpenAI",
      "tagsPlaceholder": "tag1, tag2, tag3",
      "logoPlaceholder": "https://example.com/logo.png",
      "envNamePlaceholder": "Variablenname",
      "envValuePlaceholder": "Wert",
      "deleteArg": "Dieses Argument löschen",
      "deleteEnv": "Diese Umgebungsvariable löschen",
      "addArgHint": "Neues Argument hinzufügen (oder Enter im Eingabefeld drücken)",
      "addEnvHint": "Umgebungsvariable hinzufügen (oder Enter drücken)",
      "allowedPathsDesc": "Erlaubte Verzeichnispfade (können mehrere hinzufügen)",
      "basicInfo": "Grundlegende Informationen",
      "name": "Name",
      "connectionType": "Verbindungstyp",
      "stdioConfig": "STDIO-Konfiguration",
      "httpConfig": "HTTP-Konfiguration",
      "command": "Befehl",
      "commandDesc": "Befehl zum Starten des MCP-Servers, z.B. npx, node, python, etc.",
      "args": "Argumente",
      "addArg": "Argument hinzufügen",
      "serverUrl": "Server-URL",
      "serverUrlDesc": "Vollständige URL des Remote-MCP-Servers",
      "autoConnectLabel": "Beim Start automatisch verbinden",
      "advancedSettings": "Erweiterte Einstellungen",
      "description": "Beschreibung",
      "env": "Umgebungsvariablen",
      "timeout": "Zeitüberschreitung (Millisekunden)",
      "tags": "Tags",
      "tagsSeparator": "Mehrere Tags durch Kommas trennen",
      "longRunning": "Langlaufender Server",
      "stdioDesc": "Lokale Prozesskommunikation",
      "httpDesc": "Remote-HTTP-Verbindung",
      "registryConfig": "Registry-Konfiguration"
    },
    "stats": {
      "connections": "Verbindungen",
      "requests": "Anfragen",
      "errors": "Fehler",
      "tools": "Tools",
      "providers": "Anbieter",
      "servers": "Server",
      "resources": "Ressourcen",
      "prompts": "Prompts",
      "connectionStatus": "Verbindungsstatus",
      "serverDetails": "Serverdetails",
      "tableHeader": {
        "name": "Name",
        "protocol": "Protokoll",
        "status": "Status",
        "tools": "Tools",
        "resources": "Ressourcen"
      }
    },
    "status": {
      "connected": "Verbunden",
      "disconnected": "Getrennt",
      "error": "Fehler"
    },
    "toolsDetail": {
      "empty": "Keine Tools verfügbar",
      "emptyHint": "Bitte verbinden Sie zuerst einen Server",
      "selectToView": "Wählen Sie ein Tool, um Details anzuzeigen",
      "description": "Beschreibung",
      "inputSchema": "Eingabeschema",
      "totalCount": "{{count}} Tools insgesamt"
    },
    "resourcesDetail": {
      "empty": "Keine Ressourcen verfügbar",
      "emptyDescription": "Verbundene Server stellen keine Ressourcen bereit",
      "loadError": "Fehler beim Laden des Ressourceninhalts",
      "description": "Beschreibung",
      "contentPreview": "Inhaltsvorschau",
      "noContent": "Kein Inhalt",
      "loading": "Laden...",
      "selectToView": "Wählen Sie eine Ressource, um Details anzuzeigen",
      "totalCount": "{{count}} Ressourcen insgesamt"
    },
    "promptsDetail": {
      "empty": "Keine Prompts verfügbar",
      "emptyDescription": "Verbundene Server stellen keine Prompt-Vorlagen bereit",
      "totalCount": "{{count}} Prompts insgesamt",
      "description": "Beschreibung",
      "arguments": "Argumente",
      "required": "Erforderlich",
      "selectToView": "Wählen Sie einen Prompt, um Details anzuzeigen"
    },
    "serversDetail": {
      "empty": "Keine MCP-Server",
      "emptyHint": "Klicken Sie links auf die Schaltfläche \"MCP hinzufügen\", um zu beginnen"
    },
    "serverEdit": {
      "generalSettings": "Allgemeine Einstellungen",
      "toolsWithCount": "Tools ({{count}})",
      "resourcesWithCount": "Ressourcen ({{count}})",
      "notFound": "Server Nicht Gefunden",
      "notFoundDesc": "Dieser Server existiert nicht oder wurde gelöscht",
      "backToList": "Zurück zur Serverliste",
      "editSubtitle": "MCP-Server-Konfiguration bearbeiten",
      "configSaved": "Konfiguration gespeichert",
      "restarting": "Server wird neu gestartet, um neue Konfiguration anzuwenden...",
      "configSavedRestarted": "Konfiguration gespeichert, Server neu gestartet",
      "saveFailed": "Speichern fehlgeschlagen, bitte erneut versuchen"
    },
    "serverAdd": {
      "subtitle": "Konfigurieren Sie einen neuen Model Context Protocol-Server",
      "infoTitle": "MCP-Server hinzufügen",
      "infoDesc": "Füllen Sie die folgenden Informationen aus, um einen neuen MCP-Server hinzuzufügen. Der Typ STDIO ist für lokale Prozesskommunikation, der Typ HTTP ist für Remote-Server-Verbindungen."
    },
    "sources": {
      "builtin": "Integrierte Dienste",
      "custom": "Benutzerdefinierte Dienste"
    }
  },

  // Knowledge Base
  "knowledge": {
    "title": "Wissensdatenbank",
    "listTitle": "Liste der Wissensdatenbank"
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
