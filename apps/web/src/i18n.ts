import { useI18nStore, type Locale } from "./stores/i18n";
import { setLocaleTranslations } from "./lib/i18n";

// 初始化i18n系统
export const initializeI18n = async () => {
  const currentLocale = useI18nStore.getState().currentLocale;
  await setLocaleTranslations(currentLocale as Locale);
};

// 导出翻译函数
export { t } from "./lib/i18n";
export type { TranslationKey } from "./lib/i18n";