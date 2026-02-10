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
  
  // 应用相关
  | "app.title"
  | "app.description"
  | "app.version"
  
  // 导航
  | "nav.home"
  | "nav.chat"
  | "nav.settings"
  | "nav.profile"
  
  // 聊天相关
  | "chat.title"
  | "chat.send"
  | "chat.inputPlaceholder"
  | "chat.newChat"
  | "chat.history"
  | "chat.clearHistory"
  | "chat.copyMessage"
  | "chat.copied"
  
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
  | "settings.notifications.title"
  | "settings.privacy.title"
  | "settings.advanced.title"
  | "settings.developmentNotice"
  | "settings.developmentNoticeDesc"
  
  // 快速访问
  | "quickAccess.email"
  | "quickAccess.github"
  | "quickAccess.language"
  
  // MCP相关
  | "mcp.title"
  | "mcp.servers"
  | "mcp.resources"
  | "mcp.prompts"
  | "mcp.stats"
  | "mcp.addServer"
  | "mcp.editServer"
  | "mcp.deleteServer"
  | "mcp.connect"
  | "mcp.disconnect"
  | "mcp.connected"
  | "mcp.disconnected"
  | "mcp.error"
  | "mcp.autoConnect"
  | "mcp.refresh"
  | "mcp.searchPlaceholder"
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
  | "mcp.stats.connections"
  | "mcp.stats.requests"
  | "mcp.stats.errors"
  | "mcp.stats.tools"
  | "mcp.stats.providers"
  | "mcp.status.connected"
  | "mcp.status.disconnected"
  | "mcp.status.error"
  
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