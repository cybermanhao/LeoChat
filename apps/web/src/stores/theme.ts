import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyTheme, getThemeById } from "@ai-chatbox/shared";

interface ThemeState {
  currentTheme: string;
  setTheme: (themeId: string) => void;
  applyTheme: (themeId: string) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      currentTheme: "light",

      setTheme: (themeId) => {
        set({ currentTheme: themeId });
        get().applyTheme(themeId);
      },

      applyTheme: (themeId) => {
        const preset = getThemeById(themeId);
        if (!preset) return;

        // Apply CSS variables
        applyTheme(preset.config);

        // Toggle dark class on document
        if (preset.isDark) {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      },
    }),
    {
      name: "ai-chatbox-theme",
      partialize: (state) => ({ currentTheme: state.currentTheme }),
    }
  )
);
