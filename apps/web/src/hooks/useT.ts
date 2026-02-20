import { useI18nStore } from "../stores/i18n";

export const useT = () => {
  const t = useI18nStore((s) => s.t);
  return { t };
};
