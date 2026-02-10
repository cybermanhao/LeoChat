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
    "disabled": "Deaktiviert"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "Eine von KI unterstützte intelligente Chat-Anwendung",
    "version": "Version"
  },

  // Navigation
  "nav": {
    "home": "Startseite",
    "chat": "Chat",
    "settings": "Einstellungen",
    "profile": "Profil"
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
    "copied": "Kopiert!"
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
      "save": "Speichern"
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
      "apiKeys": "API-Schlüssel"
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

  // MCP
  "mcp": {
    "title": "MCP-Server",
    "servers": "Server",
    "resources": "Ressourcen",
    "prompts": "Aufforderungen",
    "stats": "Statistiken",
    "addServer": "Server hinzufügen",
    "editServer": "Server bearbeiten",
    "deleteServer": "Server löschen",
    "connect": "Verbinden",
    "disconnect": "Trennen",
    "connected": "Verbunden",
    "disconnected": "Getrennt",
    "error": "Fehler",
    "autoConnect": "Automatische Verbindung",
    "refresh": "Aktualisieren",
    "searchPlaceholder": "Suchen...",
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
    "stats": {
      "connections": "Verbindungen",
      "requests": "Anfragen",
      "errors": "Fehler",
      "tools": "Werkzeuge",
      "providers": "Anbieter"
    },
    "status": {
      "connected": "Verbunden",
      "disconnected": "Getrennt",
      "error": "Fehler"
    }
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