import type { ThemeConfig } from "../types";

/**
 * Theme presets with names
 */
export interface ThemePreset {
  id: string;
  name: string;
  isDark: boolean;
  config: ThemeConfig;
}

/**
 * Default theme configuration (Light)
 */
export const defaultTheme: ThemeConfig = {
  primary: "222.2 47.4% 11.2%",
  secondary: "210 40% 96.1%",
  accent: "210 40% 96.1%",
  background: "0 0% 100%",
  foreground: "222.2 47.4% 11.2%",
  card: "0 0% 98%",              // 卡片稍暗于背景（浅灰）
  cardForeground: "222.2 47.4% 11.2%",
  muted: "210 40% 96.1%",
  mutedForeground: "215.4 16.3% 46.9%",
  border: "214.3 31.8% 91.4%",
  radius: "0.5rem",
};

/**
 * Dark theme configuration
 */
export const darkTheme: ThemeConfig = {
  primary: "210 40% 98%",
  secondary: "217.2 32.6% 17.5%",
  accent: "217.2 32.6% 17.5%",
  background: "222.2 84% 4.9%",
  foreground: "210 40% 98%",
  card: "222.2 84% 7%",         // 卡片稍亮于背景
  cardForeground: "210 40% 98%",
  muted: "217.2 32.6% 17.5%",
  mutedForeground: "215 20.2% 65.1%",
  border: "217.2 32.6% 17.5%",
  radius: "0.5rem",
};

/**
 * Light Purple Theme - 浅背景 + 紫色
 */
export const lightPurpleTheme: ThemeConfig = {
  primary: "270 50% 40%",
  secondary: "270 30% 96%",
  accent: "270 40% 94%",
  background: "0 0% 100%",
  foreground: "270 50% 10%",
  card: "270 30% 98%",           // 卡片带紫色调
  cardForeground: "270 50% 10%",
  muted: "270 20% 95%",
  mutedForeground: "270 10% 45%",
  border: "270 20% 90%",
  radius: "0.5rem",
};

/**
 * Dark Green Theme - 深背景 + 绿色
 */
export const darkGreenTheme: ThemeConfig = {
  primary: "142 70% 50%",
  secondary: "142 30% 15%",
  accent: "142 40% 20%",
  background: "150 30% 6%",
  foreground: "142 40% 95%",
  card: "150 30% 8%",           // 卡片使用稍亮的绿色调
  cardForeground: "142 40% 95%",
  muted: "142 20% 15%",
  mutedForeground: "142 15% 60%",
  border: "142 25% 18%",
  radius: "0.5rem",
};

/**
 * Dark Purple Theme - 深背景 + 紫色
 */
export const darkPurpleTheme: ThemeConfig = {
  primary: "270 60% 65%",
  secondary: "270 30% 15%",
  accent: "270 35% 20%",
  background: "270 40% 6%",
  foreground: "270 20% 95%",
  card: "270 40% 8%",           // 卡片使用稍亮的紫色调
  cardForeground: "270 20% 95%",
  muted: "270 25% 15%",
  mutedForeground: "270 15% 60%",
  border: "270 25% 18%",
  radius: "0.5rem",
};

/**
 * Light Green Theme - 浅背景 + 绿色
 */
export const lightGreenTheme: ThemeConfig = {
  primary: "142 50% 35%",
  secondary: "142 30% 95%",
  accent: "142 35% 92%",
  background: "0 0% 100%",
  foreground: "142 50% 10%",
  card: "142 30% 98%",           // 卡片带绿色调
  cardForeground: "142 50% 10%",
  muted: "142 20% 95%",
  mutedForeground: "142 10% 45%",
  border: "142 20% 88%",
  radius: "0.5rem",
};

/**
 * All available theme presets
 */
export const themePresets: ThemePreset[] = [
  { id: "light", name: "Light", isDark: false, config: defaultTheme },
  { id: "dark", name: "Dark", isDark: true, config: darkTheme },
  { id: "light-purple", name: "Light Purple", isDark: false, config: lightPurpleTheme },
  { id: "dark-green", name: "Dark Green", isDark: true, config: darkGreenTheme },
  { id: "dark-purple", name: "Dark Purple", isDark: true, config: darkPurpleTheme },
  { id: "light-green", name: "Light Green", isDark: false, config: lightGreenTheme },
];

/**
 * Get theme preset by ID
 */
export function getThemeById(id: string): ThemePreset | undefined {
  return themePresets.find((t) => t.id === id);
}

/**
 * Apply theme config to document root
 */
export function applyTheme(theme: Partial<ThemeConfig>): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  Object.entries(theme).forEach(([key, value]) => {
    if (value) {
      root.style.setProperty(`--${camelToKebab(key)}`, value);
    }
  });
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

/**
 * Parse color string to HSL values
 */
export function parseHSL(hsl: string): { h: number; s: number; l: number } | null {
  const match = hsl.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!match) return null;
  return {
    h: parseFloat(match[1]),
    s: parseFloat(match[2]),
    l: parseFloat(match[3]),
  };
}

/**
 * Generate theme from a primary color
 */
export function generateThemeFromPrimary(primaryHSL: string, isDark = false): ThemeConfig {
  const parsed = parseHSL(primaryHSL);
  if (!parsed) return isDark ? darkTheme : defaultTheme;

  const { h } = parsed;

  if (isDark) {
    return {
      primary: `${h} 40% 98%`,
      secondary: `${h} 32.6% 17.5%`,
      accent: `${h} 32.6% 17.5%`,
      background: `${h} 84% 4.9%`,
      foreground: `${h} 40% 98%`,
      muted: `${h} 32.6% 17.5%`,
      mutedForeground: `${h} 20.2% 65.1%`,
      border: `${h} 32.6% 17.5%`,
      radius: "0.5rem",
    };
  }

  return {
    primary: `${h} 47.4% 11.2%`,
    secondary: `${h} 40% 96.1%`,
    accent: `${h} 40% 96.1%`,
    background: "0 0% 100%",
    foreground: `${h} 47.4% 11.2%`,
    muted: `${h} 40% 96.1%`,
    mutedForeground: `${h} 16.3% 46.9%`,
    border: `${h} 31.8% 91.4%`,
    radius: "0.5rem",
  };
}
