import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyTheme, getThemeById, themePresets } from "@ai-chatbox/shared";

interface ThemeState {
  currentTheme: string;
  // 主题切换动画标记
  themeJustChanged: boolean;
  setTheme: (themeId: string) => void;
  setThemeByMode: (mode: "light" | "dark") => void;
  applyTheme: (themeId: string) => void;
  clearThemeChangedFlag: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      currentTheme: "light",
      themeJustChanged: false,

      setTheme: (themeId) => {
        set({ currentTheme: themeId, themeJustChanged: true });
        get().applyTheme(themeId);

        // 自动清除标记
        setTimeout(() => {
          set({ themeJustChanged: false });
        }, 1000);
      },

      // 根据 mode 切换到对应的主题（供 MCP 调用）
      setThemeByMode: (mode) => {
        const current = get().currentTheme;
        const currentPreset = getThemeById(current);

        // 如果当前主题已经是目标模式，不做切换
        if (currentPreset?.isDark === (mode === "dark")) {
          return;
        }

        // 找到同系列的主题或默认主题
        let targetThemeId: string;

        if (mode === "dark") {
          // 切换到深色：尝试找同系列深色，否则用默认深色
          if (current === "light") {
            targetThemeId = "dark";
          } else if (current === "light-purple") {
            targetThemeId = "dark-purple";
          } else if (current === "light-green") {
            targetThemeId = "dark-green";
          } else {
            targetThemeId = "dark";
          }
        } else {
          // 切换到浅色：尝试找同系列浅色，否则用默认浅色
          if (current === "dark") {
            targetThemeId = "light";
          } else if (current === "dark-purple") {
            targetThemeId = "light-purple";
          } else if (current === "dark-green") {
            targetThemeId = "light-green";
          } else {
            targetThemeId = "light";
          }
        }

        get().setTheme(targetThemeId);
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

      clearThemeChangedFlag: () => {
        set({ themeJustChanged: false });
      },
    }),
    {
      name: "ai-chatbox-theme",
      partialize: (state) => ({ currentTheme: state.currentTheme }),
    }
  )
);

/**
 * 获取可用的主题预设
 */
export function getThemePresets() {
  return themePresets;
}
