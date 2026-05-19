# Onboarding Wizard — Design Spec

**Date:** 2026-05-18  
**Branch:** master  
**Status:** Approved for implementation

## Overview

A full-screen RPG-style initialization wizard that appears on first launch and is re-accessible from Settings. Each step presents one question centered on screen with a fade-in animation. Uses the LeoChat theme system throughout — no hardcoded colors.

---

## Trigger & Lifecycle

- **Auto-trigger:** When `onboardingCompleted === false` (first launch, no config), wizard renders instead of the main app.
- **Manual re-trigger:** "重新运行初始化向导" button in Settings → resets `onboardingCompleted` to `false`.
- **Partial completion:** If the user closes mid-wizard, wizard restarts from step 0 on next launch. No partial state is saved.
- **Global skip:** A "稍后再说" link is always visible at the bottom. Clicking it marks onboarding complete without saving any inputs.

---

## Architecture

### New store: `onboarding.ts` (Zustand + persist)

```ts
interface OnboardingState {
  onboardingCompleted: boolean;
  workDir: string;                    // persisted; synced to Filesystem MCP args on completion
  setOnboardingCompleted: (v: boolean) => void;
  setWorkDir: (path: string) => void;
}
```

Language and theme selections are **not** stored here — they are written directly to the existing `useI18nStore` and `useThemeStore` respectively when the user completes the wizard (or changes them live in the appearance step).

`workDir` is written to the `filesystem` built-in MCP server's `args` when the wizard completes.

### New component: `OnboardingWizard.tsx`

- Manages step index and per-step draft values in local React state.
- On "进入 LeoChat" (final step): writes `workDir` to onboarding store, writes API key to `useChatSettingsStore`, writes language to `useI18nStore`, writes theme to `useThemeStore` — all in the same synchronous frame — then calls `setOnboardingCompleted(true)`.
- On "稍后再说": calls `setOnboardingCompleted(true)` immediately, no values written.

### Modified: `App.tsx`

`MainLayout` is **not** mounted during onboarding to prevent MCP auto-connect and API requests before the user has configured credentials.

```tsx
const onboardingCompleted = useOnboardingStore(s => s.onboardingCompleted);

return onboardingCompleted ? <MainLayout /> : <OnboardingWizard />;
```

### Modified: Settings page

Add a "重新运行初始化向导" button in the General settings section.

### `AppearanceSettings.tsx` — easter egg hint

**Deferred.** The hint ("试试对 AI 说：开灯") will be added when the AI theme-switching command is implemented, so the prompt matches a working feature. Not part of this spec.

---

## Steps

Step list is computed at runtime. Electron adds the `work-dir` step.

| Index | ID | Question | Input | 继续 enabled when |
|-------|----|----------|-------|-------------------|
| 0 | `welcome` | ✦ LeoChat ✦ (intro only) | 无 — 「开始」按钮 | Always |
| 1 | `api-key` | 你使用哪个 AI 服务商？ | Provider 下拉 + Key 文本框 + 「测试」按钮 | Always (step is skippable) |
| 2 *(Electron only)* | `work-dir` | 设置工作目录 | 文本输入 + 「浏览」按钮 | Always (step is skippable) |
| 3 | `appearance` | 选择你的语言与主题 | 语言下拉 + 主题下拉 | Always (defaults pre-selected) |
| 4 | `done` | 一切就绪 | 无 — 「进入 LeoChat」按钮 | Always |

**Appearance defaults:** language defaults to the browser's `navigator.language` (fallback: `zh`); theme defaults to the currently active theme. The step is therefore always valid and the 「继续」 button is always enabled.

---

## API Key Test (step 1)

Step 1 includes a 「测试连接」 button next to the key input.

- Enabled only when provider is selected and key field is non-empty.
- On click: calls the existing `/api/llm/test` endpoint (or equivalent); shows one of three inline states:
  - **Testing…** — spinner, `text-muted-foreground`
  - **✓ 连接成功** — `text-green-600` (light) / `text-green-400` (dark) — use CSS variable if available, otherwise these are the only acceptable hardcoded exceptions
  - **✗ 连接失败** — `text-destructive` + short error reason
- Test result is advisory only; the user can still click 继续 regardless of outcome.

---

## Two Skip Mechanisms — Visual Distinction

There are two distinct skip concepts in the UI:

| Mechanism | Label | Position | Behavior |
|-----------|-------|----------|----------|
| **Step-level skip** | Step is simply skippable — 「继续」is always enabled, input optional | Primary button | Advances to next step without saving this step's input |
| **Global skip** | 「稍后再说」 | Bottom-right, `text-xs text-muted-foreground` | Exits wizard immediately, nothing saved |

The global "稍后再说" is intentionally small and low-contrast to discourage accidental use. There is no separate "跳过此步" button — skippable steps simply allow continuing without input.

---

## Visual Design

### Layout (every step)

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│                    ✦  LeoChat  ✦                    │  text-primary, vertical center ~35%
│                                                      │
│              [question text, fade-in]               │  text-foreground, text-xl
│                                                      │
│              [input or choices, centered]            │
│                                                      │
│                   [ 继续 →  ]                        │  bg-primary
│                                                      │
│         ← 返回 (step > 0 only)      稍后再说         │  text-muted-foreground text-xs
│                                                      │
│                  ·  ·  ●  ·  ·                      │  step dots
└──────────────────────────────────────────────────────┘
```

- **Step 0 (welcome):** 返回 button is hidden. 「开始」replaces 「继续 →」.
- **Step 4 (done):** 「继续 →」 is replaced by 「进入 LeoChat」. 返回 and 稍后再说 are hidden.

### Color tokens (no hardcoding)

| Element | Class |
|---------|-------|
| Background | `bg-background` |
| Question text | `text-foreground` |
| Decorative title | `text-primary` |
| Input | `bg-card border-border` |
| Primary button | `bg-primary text-primary-foreground` |
| Back / Skip | `text-muted-foreground hover:text-foreground` |
| Active step dot | `bg-primary` |
| Inactive step dots | `bg-muted` |

### Animation — minimum durations

All transitions must meet minimum durations so they feel intentional, not accidental.

| Transition | Duration | Easing |
|------------|----------|--------|
| Step content fade-out | **150ms min** | ease-in |
| Step content fade-in | **300ms min** | ease-out (`cubic-bezier(0.4,0,0.2,1)`) |
| Entry translate (fade-in) | `translateY(8px) → translateY(0)`, same 300ms | same |
| 「继续」button enable/disable | **200ms min** | ease |
| API key test result appear | **200ms min** | ease-out |
| Step dot transition | **200ms min** | ease |

The gap between fade-out completing and fade-in starting must be at least **50ms** (one frame) to ensure the browser paints the empty state before the next step appears.

---

## Electron vs Web Differences

| Concern | Electron | Web |
|---------|----------|-----|
| Working directory step | Shown, with native folder picker button | Hidden entirely |
| Folder picker | `ipcRenderer.invoke('dialog:openDirectory')` | N/A |
| Path format hint | Shows OS-native example path (e.g. `C:\Users\...`) | N/A |
| API Key storage | Zustand persist (localStorage in renderer) | Same |
| Theme switching | Zustand store (same) | Same |

`isElectron` detection: `!!(window as any).__IS_ELECTRON__` (existing pattern in codebase).

---

## Error Handling

- **API Key test fails:** Show inline error, user can still proceed.
- **Working directory doesn't exist:** Show inline `text-muted-foreground` warning, allow continuing. MCP server fails gracefully at connection time.
- **Native folder picker cancelled:** Input unchanged, no error shown.

---

## Out of Scope

- AI-controlled theme switching ("开灯" / "关灯") and the corresponding `AppearanceSettings` hint — separate task.
- System Keychain integration for API keys — future enhancement.
- Per-step analytics / telemetry.
