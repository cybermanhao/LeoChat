# Onboarding Wizard — Design Spec

**Date:** 2026-05-18  
**Branch:** master  
**Status:** Approved for implementation

## Overview

A full-screen RPG-style initialization wizard that appears on first launch and is re-accessible from Settings. Each step presents one question centered on screen with a fade-in animation. Uses the LeoChat theme system throughout — no hardcoded colors.

---

## Trigger & Lifecycle

- **Auto-trigger:** When `onboardingCompleted === false` (first launch, no config), wizard renders over the entire app.
- **Manual re-trigger:** "重新运行初始化向导" button in Settings → resets `onboardingCompleted` to `false`.
- **Partial completion:** If the user closes mid-wizard (e.g., closes the Electron window), wizard restarts from step 1 on next launch. No partial state is saved.
- **Skip all:** A "跳过，直接进入 →" link is always visible at the bottom in `text-muted-foreground text-xs`. Clicking it marks onboarding complete without saving any inputs.

---

## Architecture

### New store: `onboarding.ts` (Zustand + persist)

```ts
interface OnboardingState {
  onboardingCompleted: boolean;
  workDir: string;                    // persisted, synced to Filesystem MCP args
  setOnboardingCompleted: (v: boolean) => void;
  setWorkDir: (path: string) => void;
}
```

`workDir` is committed only when the user clicks "完成" on the final step. It is also written into the `filesystem` built-in MCP server's `args` at that point.

### New component: `OnboardingWizard.tsx`

- Rendered in `App.tsx` at the top level, above all other content, when `!onboardingCompleted`.
- Manages step index and per-step input values in local React state.
- On "完成": flushes all collected values to their respective stores atomically, then calls `setOnboardingCompleted(true)`.
- On "跳过": calls `setOnboardingCompleted(true)` immediately, no values written.

### Modified: `App.tsx`

```tsx
const onboardingCompleted = useOnboardingStore(s => s.onboardingCompleted);

return (
  <>
    {!onboardingCompleted && <OnboardingWizard />}
    <MainLayout />   {/* always rendered underneath */}
  </>
);
```

### Modified: `AppearanceSettings.tsx`

Add easter egg hint below the theme selector:

```tsx
<p className="text-muted-foreground text-sm mt-2">
  ✨ 试试对 AI 说：开灯 / 关灯 / 换个主题
</p>
```

### Modified: Settings page

Add a button in a suitable section (e.g., bottom of General settings or a dedicated "账户/初始化" section):

```tsx
<button onClick={() => setOnboardingCompleted(false)}>
  重新运行初始化向导
</button>
```

---

## Steps

Step list is computed at runtime. Electron (`window.__IS_ELECTRON__` or equivalent flag) adds the working directory step.

| Index | ID | Title | Input | Skippable |
|-------|----|-------|-------|-----------|
| 0 | `welcome` | ✦ LeoChat ✦ | 无 — 仅「开始」按钮 | — |
| 1 | `api-key` | 你使用哪个 AI 服务商？ | Provider 下拉 + API Key 文本框 | ✓ |
| 2 *(Electron only)* | `work-dir` | 设置工作目录 | 文本输入 + 「浏览」按钮 (native dialog) | ✓ |
| 3 | `appearance` | 选择你的语言与主题 | 语言下拉 + 主题下拉（实时预览） | — |
| 4 | `done` | 一切就绪 | 无 — 「进入 LeoChat」按钮 | — |

---

## Visual Design

### Layout (every step)

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│                    ✦  LeoChat  ✦                    │  text-primary, top ~30%
│                                                      │
│              [question text, fade-in]               │  text-foreground, text-xl
│                                                      │
│              [input or choices, centered]            │
│                                                      │
│                   [ 继续 →  ]                        │  bg-primary, disabled until valid
│                                                      │
│              ←返回          跳过，直接进入 →          │  text-muted-foreground text-xs
│                                                      │
│                  ·  ·  ●  ·  ·                      │  step dots, bottom
└──────────────────────────────────────────────────────┘
```

### Color tokens (no hardcoding)

| Element | Class |
|---------|-------|
| Background | `bg-background` |
| Question text | `text-foreground` |
| Decorative title | `text-primary` |
| Input | `bg-card border-border` |
| Primary button | `bg-primary text-primary-foreground` |
| Disabled button | `opacity-40 cursor-not-allowed` |
| Back / Skip | `text-muted-foreground hover:text-foreground` |
| Active step dot | `bg-primary` |
| Inactive step dots | `bg-muted` |

### Animation

- Each step fades in: `opacity-0 → opacity-100`, `translateY(8px) → translateY(0)`, duration 300ms, ease-out.
- Step transition: current step fades out (150ms), next step fades in (300ms). No slide — just cross-fade.
- 「继续」button lights up with a 200ms transition when input becomes valid.

---

## Electron vs Web Differences

| Concern | Electron | Web |
|---------|----------|-----|
| Working directory step | Shown, with native folder picker button | Hidden entirely |
| Folder picker | `ipcRenderer.invoke('dialog:openDirectory')` | N/A |
| Path format hint | Shows OS-native example path | N/A |
| API Key storage | Zustand persist (localStorage in renderer) | Same |
| Theme switching | Zustand store (same) | Same |

`isElectron` detection: `!!(window as any).__IS_ELECTRON__` (existing pattern in codebase).

---

## Error Handling

- **Invalid API Key format:** Show inline hint below input (`text-muted-foreground text-xs`) but do not block progress — key validation happens at first use, not at setup.
- **Working directory doesn't exist:** Show inline warning but allow continuing. MCP server will fail gracefully at connection time.
- **Native folder picker cancelled:** Input field stays unchanged, no error shown.

---

## Out of Scope

- AI-controlled theme switching ("开灯" / "关灯") — the Settings hint references this feature, but implementing the AI command handler is a separate task.
- System Keychain integration for API keys — future enhancement.
- Per-step analytics / telemetry.
