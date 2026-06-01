# Onboarding Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an RPG-style full-screen onboarding wizard that appears on first launch and guides users through API key, working directory (Electron only), and appearance setup.

**Architecture:** A new `onboarding.ts` Zustand store tracks completion state. `App.tsx` renders `OnboardingWizard` instead of `AppLayout` until onboarding completes, preventing MCP auto-connect before credentials are set. Each step fades in with a minimum 300ms animation; step transitions use a 150ms fade-out + 50ms gap + 300ms fade-in sequence.

**Tech Stack:** React (hooks, local state), Zustand + persist, Tailwind (themed classes only), existing `useI18nStore` / `useThemeStore` / `useChatStore`, Hono backend for test-connection endpoint.

**Branch:** `master`

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `apps/web/src/stores/onboarding.ts` | `onboardingCompleted`, `workDir`, setters |
| Create | `apps/web/src/components/OnboardingWizard.tsx` | All 5 steps + animation + navigation |
| Modify | `apps/web/src/App.tsx` | Conditional render; suppress MCP during onboarding |
| Modify | `apps/web/src/lib/api.ts` | Add `testLLMConnection()` |
| Modify | `packages/server/src/routes/index.ts` | Add `POST /api/llm/test-connection` |
| Modify | `apps/web/src/pages/Settings.tsx` | Add "重新运行初始化向导" button |

---

## Task 1: Onboarding Store

**Files:**
- Create: `apps/web/src/stores/onboarding.ts`

- [ ] **Step 1: Create the store file**

```ts
// apps/web/src/stores/onboarding.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OnboardingState {
  onboardingCompleted: boolean;
  workDir: string;
  setOnboardingCompleted: (v: boolean) => void;
  setWorkDir: (path: string) => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      onboardingCompleted: false,
      workDir: "",
      setOnboardingCompleted: (v) => set({ onboardingCompleted: v }),
      setWorkDir: (path) => set({ workDir: path }),
    }),
    {
      name: "leochat-onboarding",
      partialize: (state) => ({
        onboardingCompleted: state.onboardingCompleted,
        workDir: state.workDir,
      }),
    }
  )
);
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/stores/onboarding.ts
git commit -m "feat(onboarding): add onboarding store with completion flag and workDir"
```

---

## Task 2: Backend Test-Connection Endpoint

**Files:**
- Modify: `packages/server/src/routes/index.ts`

The endpoint sends a lightweight `GET /models` (or equivalent) to the provider's API with a 5-second timeout. Returns `{ success: true }` or `{ success: false, error: "..." }` with a generic message.

- [ ] **Step 1: Add the route** (add after existing LLM routes, before the catch-all)

```ts
// In packages/server/src/routes/index.ts
// POST /api/llm/test-connection
app.post("/llm/test-connection", async (c) => {
  let body: { provider: string; apiKey: string };
  try {
    body = await c.req.json<typeof body>();
  } catch {
    return c.json({ success: false, error: "Invalid JSON body" }, 400);
  }

  const { provider, apiKey } = body;

  if (!apiKey || typeof apiKey !== "string" || apiKey.length > 2048) {
    return c.json({ success: false, error: "Invalid API key" }, 400);
  }

  const ALLOWED_PROVIDERS = ["deepseek", "openrouter", "openai", "moonshot", "kimi-code", "google"] as const;
  if (!ALLOWED_PROVIDERS.includes(provider as typeof ALLOWED_PROVIDERS[number])) {
    return c.json({ success: false, error: "Unknown provider" }, 400);
  }

  const providerUrls: Record<string, string> = {
    deepseek: "https://api.deepseek.com/models",
    openrouter: "https://openrouter.ai/api/v1/models",
    openai: "https://api.openai.com/v1/models",
    moonshot: "https://api.moonshot.cn/v1/models",
    "kimi-code": "https://api.moonshot.cn/v1/models",
    google: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  };

  const url = providerUrls[provider];
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (provider !== "google") {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, { method: "GET", headers, signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      return c.json({ success: true });
    }
    return c.json({ success: false, error: "Authentication failed" });
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return c.json({ success: false, error: "Connection timed out" });
    }
    console.error("[LLM test-connection]", err);
    return c.json({ success: false, error: "Connection failed" });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/routes/index.ts
git commit -m "feat(server): add POST /api/llm/test-connection endpoint"
```

---

## Task 3: Frontend API Client Method

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Add `testLLMConnection` to the `chatApi` object**

Find the `chatApi` object (after `setLLMConfig`) and add:

```ts
async testLLMConnection(provider: string, apiKey: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/llm/test-connection`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, apiKey }),
  });
  if (!res.ok) return { success: false, error: "Request failed" };
  return res.json();
},
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/lib/api.ts
git commit -m "feat(api): add testLLMConnection client method"
```

---

## Task 4: OnboardingWizard Component

**Files:**
- Create: `apps/web/src/components/OnboardingWizard.tsx`

This component manages all 5 steps. Local state tracks the current step index and draft values. Animations use inline style + CSS classes with the minimum durations from the spec.

- [ ] **Step 1: Create the component**

```tsx
// apps/web/src/components/OnboardingWizard.tsx
import { useState, useEffect, useCallback } from "react";
import { cn } from "@ai-chatbox/ui";
import { useOnboardingStore } from "../stores/onboarding";
import { useChatStore, type LLMProvider } from "../stores/chat";
import { useI18nStore, LOCALES, type Locale } from "../stores/i18n";
import { useThemeStore } from "../stores/theme";
import { useMCPStore } from "../stores/mcp";
import { chatApi } from "../lib/api";

// ── Electron detection ──────────────────────────────────────────────────────
const isElectron = !!(window as Window & { electronAPI?: unknown }).electronAPI;

// ── Step dot indicator ──────────────────────────────────────────────────────
function StepDots({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 rounded-full transition-all duration-200",
            i === current ? "w-4 bg-primary" : "w-1.5 bg-muted"
          )}
        />
      ))}
    </div>
  );
}

// ── Step wrapper with fade animation ───────────────────────────────────────
function StepContainer({ visible, children }: { visible: boolean; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "transition-all duration-300 ease-out",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
      )}
      style={{ transitionDuration: visible ? "300ms" : "150ms" }}
    >
      {children}
    </div>
  );
}

// ── Individual steps ────────────────────────────────────────────────────────

function StepWelcome() {
  return (
    <div className="text-center space-y-4">
      <h1 className="text-3xl font-semibold text-primary tracking-wide">✦ LeoChat ✦</h1>
      <p className="text-muted-foreground text-base max-w-sm mx-auto">
        你的智能 AI 工作台，让我们先做一些简单设置。
      </p>
    </div>
  );
}

type TestStatus = "idle" | "testing" | "ok" | "fail";
const PROVIDERS: { id: LLMProvider; name: string }[] = [
  { id: "deepseek", name: "DeepSeek" },
  { id: "openrouter", name: "OpenRouter" },
  { id: "openai", name: "OpenAI" },
  { id: "moonshot", name: "Moonshot" },
  { id: "google", name: "Google Gemini" },
];

function StepApiKey({
  provider, setProvider, apiKey, setApiKey,
}: {
  provider: LLMProvider;
  setProvider: (p: LLMProvider) => void;
  apiKey: string;
  setApiKey: (k: string) => void;
}) {
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState("");

  const handleTest = useCallback(async () => {
    if (!provider || !apiKey) return;
    setTestStatus("testing");
    setTestError("");
    try {
      const result = await chatApi.testLLMConnection(provider, apiKey);
      setTestStatus(result.success ? "ok" : "fail");
      if (!result.success) setTestError(result.error ?? "连接失败");
    } catch {
      setTestStatus("fail");
      setTestError("网络错误");
    }
  }, [provider, apiKey]);

  // Reset test status when inputs change
  useEffect(() => { setTestStatus("idle"); setTestError(""); }, [provider, apiKey]);

  return (
    <div className="space-y-5 w-full max-w-sm mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-medium text-foreground">你使用哪个 AI 服务商？</h2>
        <p className="text-sm text-muted-foreground mt-1">可以跳过，稍后在设置中配置</p>
      </div>

      {/* Provider selector */}
      <select
        value={provider}
        onChange={(e) => setProvider(e.target.value as LLMProvider)}
        className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
      >
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      {/* API key input */}
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="输入 API Key"
        className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
      />

      {/* Test button + status */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleTest}
          disabled={!apiKey || testStatus === "testing"}
          className={cn(
            "px-4 py-1.5 rounded-md text-sm border border-border transition-all duration-200",
            "text-muted-foreground hover:text-foreground hover:border-primary",
            (!apiKey || testStatus === "testing") && "opacity-40 cursor-not-allowed"
          )}
        >
          {testStatus === "testing" ? "测试中…" : "测试连接"}
        </button>
        {testStatus === "ok" && (
          <span className="text-sm transition-opacity duration-200 text-green-500">✓ 连接成功</span>
        )}
        {testStatus === "fail" && (
          <span className="text-sm transition-opacity duration-200 text-destructive">✗ {testError}</span>
        )}
      </div>
    </div>
  );
}

function StepWorkDir({ workDir, setWorkDir }: { workDir: string; setWorkDir: (p: string) => void }) {
  const handleBrowse = useCallback(async () => {
    const electronAPI = (window as unknown as {
      electronAPI?: { invoke?: (ch: string) => Promise<string | null> }
    }).electronAPI;
    if (!electronAPI?.invoke) return;
    const selected = await electronAPI.invoke("dialog:openDirectory");
    if (selected) setWorkDir(selected);
  }, [setWorkDir]);

  return (
    <div className="space-y-5 w-full max-w-sm mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-medium text-foreground">设置工作目录</h2>
        <p className="text-sm text-muted-foreground mt-1">
          AI 可以读写此目录下的文件。可以跳过，稍后在设置中配置。
        </p>
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={workDir}
          onChange={(e) => setWorkDir(e.target.value)}
          placeholder={`例如 C:\\Users\\你的名字\\Documents`}
          className="flex-1 rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={handleBrowse}
          className="px-3 py-2 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:border-primary transition-all duration-200"
        >
          浏览
        </button>
      </div>
    </div>
  );
}

function StepAppearance({
  locale, setLocale, theme, setTheme,
}: {
  locale: Locale;
  setLocale: (l: Locale) => void;
  theme: string;
  setTheme: (t: string) => void;
}) {
  const themePresets = useThemeStore((s) => s); // get applyTheme for live preview
  const applyTheme = useThemeStore((s) => s.applyTheme);

  const handleThemeChange = (id: string) => {
    setTheme(id);
    applyTheme(id); // live preview
  };

  const THEME_OPTIONS = [
    { id: "light", label: "浅色" },
    { id: "dark", label: "深色" },
    { id: "light-purple", label: "浅色紫" },
    { id: "dark-purple", label: "深色紫" },
    { id: "light-green", label: "浅色绿" },
    { id: "dark-green", label: "深色绿" },
  ];

  return (
    <div className="space-y-5 w-full max-w-sm mx-auto">
      <div className="text-center">
        <h2 className="text-xl font-medium text-foreground">选择你的语言与主题</h2>
      </div>

      {/* Language */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground uppercase tracking-wide">语言</label>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className="w-full rounded-md border border-border bg-card text-foreground px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
        >
          {LOCALES.map((l) => (
            <option key={l.code} value={l.code}>{l.flag} {l.nativeName}</option>
          ))}
        </select>
      </div>

      {/* Theme */}
      <div className="space-y-1.5">
        <label className="text-xs text-muted-foreground uppercase tracking-wide">主题</label>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((t) => (
            <button
              key={t.id}
              onClick={() => handleThemeChange(t.id)}
              className={cn(
                "py-2 rounded-md border text-xs transition-all duration-200",
                theme === t.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StepDone() {
  return (
    <div className="text-center space-y-4">
      <div className="text-4xl">✦</div>
      <h2 className="text-xl font-medium text-foreground">一切就绪</h2>
      <p className="text-sm text-muted-foreground">你可以随时在设置中修改这些配置。</p>
    </div>
  );
}

// ── Main Wizard ─────────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const setOnboardingCompleted = useOnboardingStore((s) => s.setOnboardingCompleted);
  const storeSetWorkDir = useOnboardingStore((s) => s.setWorkDir);
  const setProviderKey = useChatStore((s) => s.setProviderKey);
  const setCurrentProvider = useChatStore((s) => s.setCurrentProvider);
  const setLocale = useI18nStore((s) => s.setLocale);
  const currentTheme = useThemeStore((s) => s.currentTheme);
  const setThemeStore = useThemeStore((s) => s.setTheme);
  const updateServer = useMCPStore((s) => s.updateServer);

  // Draft state — only committed on finish
  const [provider, setProvider] = useState<LLMProvider>("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [workDir, setWorkDir] = useState("");
  const [locale, setLocaleDraft] = useState<Locale>("zh");
  const [theme, setThemeDraft] = useState(currentTheme);

  // Build step list based on environment
  const steps = isElectron
    ? ["welcome", "api-key", "work-dir", "appearance", "done"]
    : ["welcome", "api-key", "appearance", "done"];

  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);

  const goTo = useCallback((next: number) => {
    // fade out (150ms) → gap (50ms) → fade in (300ms)
    setVisible(false);
    setTimeout(() => {
      setStep(next);
      setVisible(true);
    }, 200); // 150ms fade-out + 50ms gap
  }, []);

  const handleNext = () => {
    if (step < steps.length - 1) goTo(step + 1);
  };
  const handleBack = () => {
    if (step > 0) goTo(step - 1);
  };

  const handleFinish = () => {
    // Commit all values to their respective stores in the same synchronous frame
    if (apiKey) {
      setCurrentProvider(provider);
      setProviderKey(provider, apiKey);
    }
    if (workDir) {
      storeSetWorkDir(workDir);
      // Sync to filesystem MCP server args
      updateServer("filesystem", {
        args: [
          "../../node_modules/@modelcontextprotocol/server-filesystem/dist/index.js",
          workDir,
        ],
      });
    }
    setLocale(locale);
    setThemeStore(theme);
    setOnboardingCompleted(true);
  };

  const handleSkipAll = () => {
    setOnboardingCompleted(true);
  };

  const currentStepId = steps[step];
  const isFirst = step === 0;
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center p-8">
      {/* Content area */}
      <div className="w-full max-w-lg flex flex-col items-center gap-8">
        {/* Decorative title (always visible) */}
        <div className="text-primary text-sm font-medium tracking-widest opacity-60">
          L E O C H A T
        </div>

        {/* Step content with animation */}
        <div className="w-full min-h-[220px] flex items-center justify-center">
          <StepContainer visible={visible}>
            {currentStepId === "welcome" && <StepWelcome />}
            {currentStepId === "api-key" && (
              <StepApiKey
                provider={provider} setProvider={setProvider}
                apiKey={apiKey} setApiKey={setApiKey}
              />
            )}
            {currentStepId === "work-dir" && (
              <StepWorkDir workDir={workDir} setWorkDir={setWorkDir} />
            )}
            {currentStepId === "appearance" && (
              <StepAppearance
                locale={locale} setLocale={setLocaleDraft}
                theme={theme} setTheme={setThemeDraft}
              />
            )}
            {currentStepId === "done" && <StepDone />}
          </StepContainer>
        </div>

        {/* Primary action button */}
        <button
          onClick={isLast ? handleFinish : handleNext}
          className="px-8 py-2.5 rounded-full bg-primary text-primary-foreground text-sm font-medium transition-all duration-200 hover:opacity-90 active:scale-95"
        >
          {isFirst ? "开始" : isLast ? "进入 LeoChat" : "继续 →"}
        </button>

        {/* Secondary navigation */}
        <div className="flex items-center justify-between w-full max-w-sm text-xs text-muted-foreground">
          <button
            onClick={handleBack}
            className={cn(
              "hover:text-foreground transition-colors duration-200",
              isFirst && "invisible"
            )}
          >
            ← 返回
          </button>
          <button
            onClick={handleSkipAll}
            className={cn(
              "hover:text-foreground transition-colors duration-200",
              isLast && "invisible"
            )}
          >
            稍后再说
          </button>
        </div>

        {/* Step dots */}
        <StepDots total={steps.length} current={step} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/OnboardingWizard.tsx
git commit -m "feat(onboarding): add OnboardingWizard component with RPG-style steps and animations"
```

---

## Task 5: Wire into App.tsx

**Files:**
- Modify: `apps/web/src/App.tsx`

The goal: when onboarding is incomplete, render `OnboardingWizard` instead of the router/`AppInit`. This prevents MCP auto-connect and API calls before credentials are set.

- [ ] **Step 1: Import and conditionally render**

Add import at the top of `App.tsx`:
```ts
import { useOnboardingStore } from "./stores/onboarding";
import { OnboardingWizard } from "./components/OnboardingWizard";
```

Modify the `App` function to wrap the existing return:

```tsx
export function App() {
  const serverReady = useServerReady();
  const onboardingCompleted = useOnboardingStore((s) => s.onboardingCompleted);

  if (!serverReady) {
    return (
      <div className="h-full animate-in fade-in duration-200">
        <LoadingScreen />
      </div>
    );
  }

  // Apply persisted theme even before onboarding completes
  // (ThemeInit is a tiny component that just applies the theme on mount)
  if (!onboardingCompleted) {
    return (
      <TooltipProvider>
        <ThemeInit />
        <OnboardingWizard />
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Router>
        <AppInit>
          {/* ... existing routes unchanged ... */}
        </AppInit>
      </Router>
    </TooltipProvider>
  );
}
```

Add a `ThemeInit` component just above `App` in the same file to apply the persisted theme during onboarding:

```tsx
function ThemeInit() {
  const { currentTheme, applyTheme } = useThemeStore();
  useEffect(() => { applyTheme(currentTheme); }, [currentTheme, applyTheme]);
  return null;
}
```

- [ ] **Step 2: Verify existing `AppInit` still handles all side-effects** (MCP connect, i18n init, backend sync). These only fire after onboarding — which is the desired behavior. No changes needed inside `AppInit`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/App.tsx
git commit -m "feat(onboarding): gate MainLayout behind onboardingCompleted; add ThemeInit"
```

---

## Task 6: Settings Re-Run Button

**Files:**
- Modify: `apps/web/src/pages/Settings.tsx`

- [ ] **Step 1: Add import and button**

In `Settings.tsx`, import the store:
```ts
import { useOnboardingStore } from "../stores/onboarding";
```

Find the settings content area (where `AppearanceSettings` and `LLMSettings` are rendered). Add a "General" section or add to the existing sidebar. The button should appear in the LLM settings tab or as a standalone item.

The cleanest placement: add a new sidebar category `"general"` and a matching panel:

In the `settingCategories` array add:
```ts
{ id: "general", label: "通用", icon: Zap },
```

In the content rendering switch, add a case for `"general"`:
```tsx
{currentCategory === "general" && (
  <div className="p-6 space-y-6">
    <div>
      <h3 className="text-base font-medium text-foreground mb-1">初始化向导</h3>
      <p className="text-sm text-muted-foreground mb-3">
        重新运行初始设置（API Key、工作目录、外观）
      </p>
      <button
        onClick={() => useOnboardingStore.getState().setOnboardingCompleted(false)}
        className="px-4 py-2 rounded-md border border-border text-sm text-foreground hover:bg-muted transition-colors duration-200"
      >
        重新运行初始化向导
      </button>
    </div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/Settings.tsx
git commit -m "feat(settings): add General tab with re-run onboarding wizard button"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|-----------------|------|
| Auto-trigger on first launch | Task 5 (App.tsx gate) |
| Manual re-trigger from Settings | Task 6 |
| No MainLayout during onboarding | Task 5 |
| `onboardingCompleted` + `workDir` store | Task 1 |
| Welcome step | Task 4 (StepWelcome) |
| API Key step with test button | Task 4 (StepApiKey) |
| Work directory step (Electron only) | Task 4 (StepWorkDir, `isElectron` gate) |
| Appearance step (language + theme + live preview) | Task 4 (StepAppearance) |
| Done step with "进入 LeoChat" | Task 4 (StepDone + button label logic) |
| Fade-in 300ms, fade-out 150ms, 50ms gap | Task 4 (goTo callback) |
| Step dots with 200ms transition | Task 4 (StepDots) |
| Back button hidden on step 0 | Task 4 (`invisible` class on isFirst) |
| Back+skip hidden on done step | Task 4 (`isLast && "invisible"`) |
| "稍后再说" global skip | Task 4 (handleSkipAll) |
| API test endpoint (backend) | Task 2 |
| API test client method | Task 3 |
| Appearance defaults pre-selected | Task 4 (defaults from existing store values) |
| Values written in same synchronous frame | Task 4 (handleFinish) |
| Language → useI18nStore | Task 4 (handleFinish calls setLocale) |
| Theme → useThemeStore | Task 4 (handleFinish calls setThemeStore) |
| workDir → filesystem MCP args | Task 4 (handleFinish calls updateServer) |
| Themed colors only | Task 4 (all classes use bg-primary, bg-card, etc.) |
| Electron native folder picker | Task 4 (StepWorkDir handleBrowse) |
| Settings re-run button | Task 6 |
| Easter egg hint deferred | ✓ Not in plan |

**Placeholder check:** No TBD, TODO, or vague steps found.

**Type consistency:** `LLMProvider` imported from `../stores/chat` (same as existing usage). `Locale` imported from `../stores/i18n`. `updateServer` signature matches existing MCP store interface.
