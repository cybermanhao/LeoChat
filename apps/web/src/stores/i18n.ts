import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Locale = "en" | "zh" | "ja" | "es" | "fr" | "de";

export interface LocaleOption {
  code: Locale;
  name: string;
  nativeName: string;
  flag: string;
}

export const LOCALES: LocaleOption[] = [
  { code: "en", name: "English", nativeName: "English", flag: "🇺🇸" },
  { code: "zh", name: "Chinese", nativeName: "中文", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", nativeName: "日本語", flag: "🇯🇵" },
  { code: "es", name: "Spanish", nativeName: "Español", flag: "🇪🇸" },
  { code: "fr", name: "French", nativeName: "Français", flag: "🇫🇷" },
  { code: "de", name: "German", nativeName: "Deutsch", flag: "🇩🇪" },
];

interface I18nState {
  currentLocale: Locale;
  setLocale: (locale: Locale) => void;
  getCurrentLocaleOption: () => LocaleOption;
}

export const useI18nStore = create<I18nState>()(
  persist(
    (set, get) => ({
      currentLocale: "zh", // 默认中文

      setLocale: (locale) => {
        set({ currentLocale: locale });
      },

      getCurrentLocaleOption: () => {
        const { currentLocale } = get();
        return LOCALES.find((l) => l.code === currentLocale) || LOCALES[1];
      },
    }),
    {
      name: "leochat-i18n",
      partialize: (state) => ({ currentLocale: state.currentLocale }),
    }
  )
);
