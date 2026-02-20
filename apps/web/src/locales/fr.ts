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
    "collapseSidebar": "Réduire la barre latérale",
    "expandSidebar": "Développer la barre latérale"
  },

  // Navigation
  "nav": {
    "home": "Accueil",
    "chat": "Chat",
    "settings": "Paramètres",
    "profile": "Profil",
    "knowledge": "Base de Connaissances"
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
    "welcome": "Bienvenue sur LeoChat",
    "welcomeDescription": "Démarrez une conversation ou interagissez avec votre environnement en utilisant les outils MCP",
    "confirmClear": "Êtes-vous sûr de vouloir effacer la conversation actuelle ?",
    "clear": "Effacer",
    "clearConversation": "Effacer la Conversation",
    "markdown": "Markdown",
    "plainText": "Texte Brut",
    "markdownRendering": "Rendu Markdown",
    "placeholderDefault": "Tapez un message, ou utilisez @tool pour appeler des outils MCP...",
    "placeholderWithPrompt": "Prompt système activé...",
    "webSearch": "Recherche Web",
    "suggestions": {
      "code": "Aidez-moi à écrire du code",
      "explain": "Expliquez ce concept",
      "translate": "Traduire en anglais",
      "summarize": "Résumez cet article"
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
      "configureKeyFirst": "Veuillez configurer la clé API {{provider}} en premier"
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
      "selectModel": "Modèle"
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

  // Sidebar
  "sidebar": {
    "mcpConnected": "MCP Connecté",
    "untitledChat": "Chat Sans Titre"
  },

  // Models
  "models": {
    "searchPlaceholder": "Rechercher des modèles...",
    "deepseek": {
      "chat": { "description": "Modèle de chat général, rentable" },
      "reasoner": { "description": "Modèle de raisonnement amélioré avec chaîne de pensée" }
    },
    "openai": {
      "gpt4o": { "description": "Modèle multimodal le plus puissant" },
      "gpt4oMini": { "description": "Rapide et abordable" },
      "gpt4Turbo": { "description": "Puissante capacité de raisonnement" }
    },
    "anthropic": {
      "sonnet": { "description": "Excellente programmation et raisonnement" },
      "opus": { "description": "Modèle Claude le plus puissant" }
    },
    "google": {
      "geminiPro": { "description": "Fenêtre de contexte extra longue" }
    },
    "common": {
      "viaOpenRouter": "Accès via OpenRouter"
    },
    "context": "Contexte",
    "viewAllModels": "Voir tous les modèles"
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
    "notConnected": "Non Connecté",
    "error": "Erreur",
    "autoConnect": "Connexion automatique",
    "enableAutoConnect": "Activer la Connexion Automatique",
    "disableAutoConnect": "Désactiver la Connexion Automatique",
    "refresh": "Actualiser",
    "searchPlaceholder": "Rechercher...",
    "searchToolsPlaceholder": "Rechercher des outils...",
    "clearSearch": "Effacer",
    "confirmDeleteClick": "Cliquez à nouveau pour confirmer la suppression",
    "adding": "Ajout en cours...",
    "saving": "Enregistrement en cours...",
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
      "servers": "Serveurs",
      "tools": "Outils",
      "resources": "Ressources",
      "prompts": "Prompts",
      "stats": "Statistiques"
    },
    "transport": {
      "stdio": {
        "desc": "Communication de Processus",
        "description": "Communiquer avec le processus local via STDIO"
      },
      "http": {
        "desc": "Connexion HTTP",
        "description": "Se connecter au service distant via Streamable HTTP"
      }
    },
    "form": {
      "serverNamePlaceholder": "Nom du Serveur",
      "serverNameExample": "par ex., Memory Server",
      "commandPlaceholder": "Commande (par ex., npx)",
      "commandExample": "par ex., npx ou uvx",
      "argsPlaceholder": "Arguments (séparés par des espaces)",
      "argPlaceholder": "Valeur de l'argument...",
      "argExample1": "par ex., -y",
      "argExample2": "par ex., @modelcontextprotocol/server-memory",
      "urlPlaceholder": "http://localhost:3000/mcp",
      "descriptionPlaceholder": "Décrivez brièvement la fonction de ce serveur...",
      "authorPlaceholder": "par ex., Anthropic, OpenAI",
      "tagsPlaceholder": "tag1, tag2, tag3",
      "logoPlaceholder": "https://example.com/logo.png",
      "envNamePlaceholder": "Nom de la Variable",
      "envValuePlaceholder": "Valeur",
      "deleteArg": "Supprimer cet argument",
      "deleteEnv": "Supprimer cette variable d'environnement",
      "addArgHint": "Ajouter un nouvel argument (ou appuyez sur Entrée dans l'input)",
      "addEnvHint": "Ajouter une variable d'environnement (ou appuyez sur Entrée)",
      "allowedPathsDesc": "Chemins de répertoire autorisés (peut en ajouter plusieurs)",
      "basicInfo": "Informations de Base",
      "name": "Nom",
      "connectionType": "Type de Connexion",
      "stdioConfig": "Configuration STDIO",
      "httpConfig": "Configuration HTTP",
      "command": "Commande",
      "commandDesc": "Commande pour démarrer le serveur MCP, par ex., npx, node, python, etc.",
      "args": "Arguments",
      "addArg": "Ajouter un Argument",
      "serverUrl": "URL du Serveur",
      "serverUrlDesc": "URL complète du serveur MCP distant",
      "autoConnectLabel": "Connexion automatique au démarrage",
      "advancedSettings": "Paramètres Avancés",
      "description": "Description",
      "env": "Variables d'Environnement",
      "timeout": "Délai d'attente (millisecondes)",
      "tags": "Étiquettes",
      "tagsSeparator": "Séparez plusieurs étiquettes avec des virgules",
      "longRunning": "Serveur à Exécution Longue",
      "stdioDesc": "Communication de processus local",
      "httpDesc": "Connexion HTTP distante",
      "registryConfig": "Configuration Registry"
    },
    "stats": {
      "connections": "Connexions",
      "requests": "Requêtes",
      "errors": "Erreurs",
      "tools": "Outils",
      "providers": "Fournisseurs",
      "servers": "Serveurs",
      "resources": "Ressources",
      "prompts": "Prompts",
      "connectionStatus": "État de Connexion",
      "serverDetails": "Détails du Serveur",
      "tableHeader": {
        "name": "Nom",
        "protocol": "Protocole",
        "status": "État",
        "tools": "Outils",
        "resources": "Ressources"
      }
    },
    "status": {
      "connected": "Connecté",
      "disconnected": "Déconnecté",
      "error": "Erreur"
    },
    "toolsDetail": {
      "empty": "Aucun outil disponible",
      "emptyHint": "Veuillez d'abord connecter un serveur",
      "selectToView": "Sélectionnez un outil pour voir les détails",
      "description": "Description",
      "inputSchema": "Schéma d'Entrée",
      "totalCount": "{{count}} outils au total"
    },
    "resourcesDetail": {
      "empty": "Aucune ressource disponible",
      "emptyDescription": "Les serveurs connectés ne fournissent pas de ressources",
      "loadError": "Échec du chargement du contenu de la ressource",
      "description": "Description",
      "contentPreview": "Aperçu du Contenu",
      "noContent": "Aucun contenu",
      "loading": "Chargement...",
      "selectToView": "Sélectionnez une ressource pour voir les détails",
      "totalCount": "{{count}} ressources au total"
    },
    "promptsDetail": {
      "empty": "Aucun prompt disponible",
      "emptyDescription": "Les serveurs connectés ne fournissent pas de modèles de prompt",
      "totalCount": "{{count}} prompts au total",
      "description": "Description",
      "arguments": "Arguments",
      "required": "Requis",
      "selectToView": "Sélectionnez un prompt pour voir les détails"
    },
    "serversDetail": {
      "empty": "Aucun serveur MCP",
      "emptyHint": "Cliquez sur le bouton \"Ajouter MCP\" à gauche pour commencer"
    },
    "serverEdit": {
      "generalSettings": "Paramètres Généraux",
      "toolsWithCount": "Outils ({{count}})",
      "resourcesWithCount": "Ressources ({{count}})",
      "notFound": "Serveur Non Trouvé",
      "notFoundDesc": "Ce serveur n'existe pas ou a été supprimé",
      "backToList": "Retour à la Liste des Serveurs",
      "editSubtitle": "Modifier la configuration du serveur MCP",
      "configSaved": "Configuration enregistrée",
      "restarting": "Redémarrage du serveur pour appliquer la nouvelle configuration...",
      "configSavedRestarted": "Configuration enregistrée, serveur redémarré",
      "saveFailed": "Échec de l'enregistrement, veuillez réessayer"
    },
    "serverAdd": {
      "subtitle": "Configurer un nouveau serveur Model Context Protocol",
      "infoTitle": "Ajouter un Serveur MCP",
      "infoDesc": "Remplissez les informations ci-dessous pour ajouter un nouveau serveur MCP. Le type STDIO est pour la communication de processus local, le type HTTP est pour les connexions de serveur distant."
    },
    "sources": {
      "builtin": "Services Intégrés",
      "custom": "Services Personnalisés"
    }
  },

  // Knowledge Base
  "knowledge": {
    "title": "Base de Connaissances",
    "listTitle": "Liste de la Base de Connaissances"
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
