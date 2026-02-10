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
    "disabled": "Désactivé"
  },

  // App
  "app": {
    "title": "LeoChat",
    "description": "Une application de chat intelligente alimentée par l'IA",
    "version": "Version"
  },

  // Navigation
  "nav": {
    "home": "Accueil",
    "chat": "Chat",
    "settings": "Paramètres",
    "profile": "Profil"
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
    "copied": "Copié !"
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
      "save": "Enregistrer"
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
      "apiKeys": "Clés API"
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

  // MCP
  "mcp": {
    "title": "Serveurs MCP",
    "servers": "Serveurs",
    "resources": "Ressources",
    "prompts": "Instructions",
    "stats": "Statistiques",
    "addServer": "Ajouter un serveur",
    "editServer": "Modifier le serveur",
    "deleteServer": "Supprimer le serveur",
    "connect": "Connecter",
    "disconnect": "Déconnecter",
    "connected": "Connecté",
    "disconnected": "Déconnecté",
    "error": "Erreur",
    "autoConnect": "Connexion automatique",
    "refresh": "Actualiser",
    "searchPlaceholder": "Rechercher...",
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
    "stats": {
      "connections": "Connexions",
      "requests": "Requêtes",
      "errors": "Erreurs",
      "tools": "Outils",
      "providers": "Fournisseurs"
    },
    "status": {
      "connected": "Connecté",
      "disconnected": "Déconnecté",
      "error": "Erreur"
    }
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