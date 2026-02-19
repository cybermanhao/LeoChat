import { Locale } from "../stores/i18n";

// 定义翻译键的类型
export type TranslationKey =
  // 通用
  | "common.save"
  | "common.cancel"
  | "common.close"
  | "common.ok"
  | "common.yes"
  | "common.no"
  | "common.confirm"
  | "common.delete"
  | "common.edit"
  | "common.add"
  | "common.search"
  | "common.settings"
  | "common.language"
  | "common.appearance"
  | "common.theme"
  | "common.enabled"
  | "common.disabled"
  | "common.copy"
  | "common.reset"

  // 应用相关
  | "app.title"
  | "app.description"
  | "app.version"

  // 布局
  | "layout.collapseSidebar"
  | "layout.expandSidebar"

  // 导航
  | "nav.home"
  | "nav.chat"
  | "nav.settings"
  | "nav.profile"
  | "nav.knowledge"

  // 聊天相关
  | "chat.title"
  | "chat.send"
  | "chat.inputPlaceholder"
  | "chat.newChat"
  | "chat.history"
  | "chat.clearHistory"
  | "chat.copyMessage"
  | "chat.copied"
  | "chat.welcome"
  | "chat.welcomeDescription"
  | "chat.confirmClear"
  | "chat.clear"
  | "chat.clearConversation"
  | "chat.markdown"
  | "chat.plainText"
  | "chat.markdownRendering"
  | "chat.placeholderDefault"
  | "chat.placeholderWithPrompt"
  | "chat.suggestions.code"
  | "chat.suggestions.explain"
  | "chat.suggestions.translate"
  | "chat.suggestions.summarize"

  // 设置相关
  | "settings.title"
  | "settings.api.title"
  | "settings.api.description"
  | "settings.api.keyPlaceholder"
  | "settings.api.descriptionDeepSeek"
  | "settings.api.descriptionOpenRouter"
  | "settings.api.descriptionOpenAI"
  | "settings.api.linkTextDeepSeek"
  | "settings.api.linkTextOpenRouter"
  | "settings.api.linkTextOpenAI"
  | "settings.api.getConfigured"
  | "settings.api.saveSuccess"
  | "settings.api.save"
  | "settings.api.configureKeyFirst"
  | "settings.appearance.title"
  | "settings.appearance.description"
  | "settings.appearance.lightThemes"
  | "settings.appearance.darkThemes"
  | "settings.appearance.currentTheme"
  | "settings.appearance.clickToSwitch"
  | "settings.model.title"
  | "settings.model.description"
  | "settings.model.defaultProvider"
  | "settings.model.apiKeys"
  | "settings.model.selectModel"
  | "settings.notifications.title"
  | "settings.privacy.title"
  | "settings.advanced.title"
  | "settings.developmentNotice"
  | "settings.developmentNoticeDesc"

  // 快速访问
  | "quickAccess.email"
  | "quickAccess.github"
  | "quickAccess.language"

  // 模型相关
  | "models.searchPlaceholder"
  | "models.deepseek.chat.description"
  | "models.deepseek.reasoner.description"
  | "models.openai.gpt4o.description"
  | "models.openai.gpt4oMini.description"
  | "models.openai.gpt4Turbo.description"
  | "models.anthropic.sonnet.description"
  | "models.anthropic.opus.description"
  | "models.google.geminiPro.description"
  | "models.common.viaOpenRouter"
  | "models.context"
  | "models.viewAllModels"

  // MCP相关
  | "mcp.title"
  | "mcp.servers"
  | "mcp.resources"
  | "mcp.prompts"
  | "mcp.statsTab"
  | "mcp.tools"
  | "mcp.addServer"
  | "mcp.editServer"
  | "mcp.deleteServer"
  | "mcp.connect"
  | "mcp.disconnect"
  | "mcp.connected"
  | "mcp.disconnected"
  | "mcp.notConnected"
  | "mcp.error"
  | "mcp.autoConnect"
  | "mcp.enableAutoConnect"
  | "mcp.disableAutoConnect"
  | "mcp.refresh"
  | "mcp.searchPlaceholder"
  | "mcp.searchToolsPlaceholder"
  | "mcp.clearSearch"
  | "mcp.confirmDeleteClick"
  | "mcp.adding"
  | "mcp.saving"
  | "mcp.serverName"
  | "mcp.serverUrl"
  | "mcp.serverDescription"
  | "mcp.serverAuth"
  | "mcp.serverTimeout"
  | "mcp.serverTools"
  | "mcp.serverEnvs"
  | "mcp.serverSave"
  | "mcp.serverCancel"
  | "mcp.serverTest"
  | "mcp.serverTestSuccess"
  | "mcp.serverTestFailed"
  | "mcp.serverAddSuccess"
  | "mcp.serverUpdateSuccess"
  | "mcp.serverDeleteConfirm"
  | "mcp.serverDeleteSuccess"
  | "mcp.serverConnectionError"
  | "mcp.serverConnectionSuccess"
  | "mcp.toolEnabled"
  | "mcp.toolDisabled"
  | "mcp.resourceContent"
  | "mcp.promptApply"
  | "mcp.promptApplied"
  // MCP tabs
  | "mcp.tabs.servers"
  | "mcp.tabs.tools"
  | "mcp.tabs.resources"
  | "mcp.tabs.prompts"
  | "mcp.tabs.stats"
  // MCP transport
  | "mcp.transport.stdio.desc"
  | "mcp.transport.stdio.description"
  | "mcp.transport.http.desc"
  | "mcp.transport.http.description"
  // MCP form
  | "mcp.form.serverNamePlaceholder"
  | "mcp.form.serverNameExample"
  | "mcp.form.commandPlaceholder"
  | "mcp.form.commandExample"
  | "mcp.form.argsPlaceholder"
  | "mcp.form.argPlaceholder"
  | "mcp.form.argExample1"
  | "mcp.form.argExample2"
  | "mcp.form.urlPlaceholder"
  | "mcp.form.descriptionPlaceholder"
  | "mcp.form.authorPlaceholder"
  | "mcp.form.tagsPlaceholder"
  | "mcp.form.logoPlaceholder"
  | "mcp.form.envNamePlaceholder"
  | "mcp.form.envValuePlaceholder"
  | "mcp.form.deleteArg"
  | "mcp.form.deleteEnv"
  | "mcp.form.addArgHint"
  | "mcp.form.addEnvHint"
  | "mcp.form.allowedPathsDesc"
  // MCP stats
  | "mcp.stats.connections"
  | "mcp.stats.requests"
  | "mcp.stats.errors"
  | "mcp.stats.tools"
  | "mcp.stats.providers"
  | "mcp.stats.servers"
  | "mcp.stats.resources"
  | "mcp.stats.prompts"
  // MCP status
  | "mcp.status.connected"
  | "mcp.status.disconnected"
  | "mcp.status.error"
  // MCP resources detail
  | "mcp.resourcesDetail.empty"
  | "mcp.resourcesDetail.emptyDescription"
  | "mcp.resourcesDetail.loadError"
  // MCP prompts detail
  | "mcp.promptsDetail.empty"
  | "mcp.promptsDetail.emptyDescription"
  | "mcp.promptsDetail.totalCount"
  | "mcp.promptsDetail.description"
  | "mcp.promptsDetail.arguments"
  | "mcp.promptsDetail.required"
  | "mcp.promptsDetail.selectToView"
  // MCP servers detail
  | "mcp.serversDetail.empty"
  | "mcp.serversDetail.emptyHint"
  // MCP server edit
  | "mcp.serverEdit.generalSettings"
  | "mcp.serverEdit.toolsWithCount"
  | "mcp.serverEdit.resourcesWithCount"
  // MCP sources
  | "mcp.sources.builtin"
  | "mcp.sources.custom"

  // MCP tools detail
  | "mcp.toolsDetail.empty"
  | "mcp.toolsDetail.emptyHint"
  | "mcp.toolsDetail.selectToView"
  | "mcp.toolsDetail.description"
  | "mcp.toolsDetail.inputSchema"
  | "mcp.toolsDetail.totalCount"
  // MCP resources detail (additional)
  | "mcp.resourcesDetail.description"
  | "mcp.resourcesDetail.contentPreview"
  | "mcp.resourcesDetail.noContent"
  | "mcp.resourcesDetail.loading"
  | "mcp.resourcesDetail.selectToView"
  | "mcp.resourcesDetail.totalCount"
  // MCP server edit (additional)
  | "mcp.serverEdit.notFound"
  | "mcp.serverEdit.notFoundDesc"
  | "mcp.serverEdit.backToList"
  | "mcp.serverEdit.editSubtitle"
  | "mcp.serverEdit.configSaved"
  | "mcp.serverEdit.restarting"
  | "mcp.serverEdit.configSavedRestarted"
  | "mcp.serverEdit.saveFailed"
  // MCP server add
  | "mcp.serverAdd.subtitle"
  | "mcp.serverAdd.infoTitle"
  | "mcp.serverAdd.infoDesc"
  // MCP form (additional)
  | "mcp.form.basicInfo"
  | "mcp.form.name"
  | "mcp.form.connectionType"
  | "mcp.form.stdioConfig"
  | "mcp.form.httpConfig"
  | "mcp.form.command"
  | "mcp.form.commandDesc"
  | "mcp.form.args"
  | "mcp.form.addArg"
  | "mcp.form.serverUrl"
  | "mcp.form.serverUrlDesc"
  | "mcp.form.autoConnectLabel"
  | "mcp.form.advancedSettings"
  | "mcp.form.description"
  | "mcp.form.env"
  | "mcp.form.timeout"
  | "mcp.form.tags"
  | "mcp.form.tagsSeparator"
  | "mcp.form.longRunning"
  | "mcp.form.stdioDesc"
  | "mcp.form.httpDesc"
  | "mcp.form.registryConfig"
  // MCP stats (additional)
  | "mcp.stats.connectionStatus"
  | "mcp.stats.serverDetails"
  | "mcp.stats.tableHeader.name"
  | "mcp.stats.tableHeader.protocol"
  | "mcp.stats.tableHeader.status"
  | "mcp.stats.tableHeader.tools"
  | "mcp.stats.tableHeader.resources"
  // Chat (additional)
  | "chat.webSearch"

  // 知识库
  | "knowledge.title"
  | "knowledge.listTitle"

  // 错误消息
  | "error.unknown"
  | "error.network"
  | "error.timeout"
  | "error.invalidUrl"
  | "error.connectionFailed"
  | "error.apiKeyRequired"
  | "error.invalidApiKey"
  | "error.rateLimit"
  | "error.serverError"
  | "error.notImplemented"

  // 成功消息
  | "success.operationCompleted"
  | "success.saved"
  | "success.deleted"
  | "success.created"
  | "success.updated";

// 翻译字典类型
export interface TranslationDictionary {
  [key: string]: string | { [key: string]: string | any };
}

// 加载翻译文件
const loadTranslations = async (locale: Locale): Promise<TranslationDictionary> => {
  try {
    const translations = await import(`../locales/${locale}.ts`);
    return translations.default || {};
  } catch (error) {
    console.warn(`Translation file for locale '${locale}' not found, falling back to English`);
    try {
      const translations = await import(`../locales/en.ts`);
      return translations.default || {};
    } catch (fallbackError) {
      console.error('Fallback to English failed:', fallbackError);
      return {};
    }
  }
};

// 翻译函数
let currentTranslations: TranslationDictionary = {};

export const setLocaleTranslations = async (locale: Locale) => {
  currentTranslations = await loadTranslations(locale);
};

export const t = (key: TranslationKey, params?: Record<string, any>): string => {
  let translation = getNestedTranslation(currentTranslations, key) || key;

  // 如果提供了参数，则进行插值
  if (params) {
    Object.entries(params).forEach(([paramKey, paramValue]) => {
      translation = translation.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(paramValue));
    });
  }

  return translation;
};

// 辅助函数：获取嵌套翻译
const getNestedTranslation = (obj: TranslationDictionary, path: string): string | undefined => {
  return path.split('.').reduce((current: any, key: string) => {
    return current?.[key];
  }, obj) as string;
};

// 获取当前语言的所有翻译
export const getCurrentTranslations = (): TranslationDictionary => {
  return currentTranslations;
};
