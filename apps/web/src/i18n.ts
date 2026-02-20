import { useI18nStore, type Locale } from "./stores/i18n";

// 初始化 i18n 系统
export const initializeI18n = async () => {
  const { currentLocale, setLocale } = useI18nStore.getState();
  await setLocale(currentLocale as Locale); // 复用 setLocale：加载译文 + 更新 t
};

// 导出翻译函数
export { t } from "./lib/i18n";
export type { TranslationKey } from "./lib/i18n";
export { useT } from "./hooks/useT";
