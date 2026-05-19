import { useState, useEffect, useCallback } from "react";
import { useOnboardingStore } from "../stores/onboarding";
import { useI18nStore, LOCALES, type Locale } from "../stores/i18n";
import { useThemeStore } from "../stores/theme";
import { useChatStore, type LLMProvider } from "../stores/chat";
import { useMCPStore } from "../stores/mcp";
import { chatApi } from "../lib/api";
import { applyTheme, getThemeById, LLM_PROVIDERS } from "@ai-chatbox/shared";
import { cn } from "@ai-chatbox/ui";

// Electron detection
const isElectron = !!(window as Window & { electronAPI?: unknown }).electronAPI;

type Step = "welcome" | "api-key" | "work-dir" | "appearance" | "done";

const STEPS: Step[] = isElectron
  ? ["welcome", "api-key", "work-dir", "appearance", "done"]
  : ["welcome", "api-key", "appearance", "done"];

const PROVIDER_OPTIONS: { value: LLMProvider; label: string }[] = [
  { value: "deepseek", label: "DeepSeek" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "openai", label: "OpenAI" },
  { value: "moonshot", label: "Moonshot" },
  { value: "kimi", label: "Kimi" },
  { value: "google", label: "Google Gemini" },
];

const THEME_OPTIONS: { id: string; label: string }[] = [
  { id: "light", label: "浅色" },
  { id: "dark", label: "深色" },
  { id: "light-purple", label: "浅色紫" },
  { id: "dark-purple", label: "深色紫" },
  { id: "light-green", label: "浅色绿" },
  { id: "dark-green", label: "深色绿" },
];

type TestStatus = "idle" | "testing" | "ok" | "fail";

export function OnboardingWizard() {
  const { setOnboardingCompleted, setWorkDir: storeSetWorkDir } = useOnboardingStore();
  const { currentLocale, setLocale } = useI18nStore();
  const { currentTheme, setTheme } = useThemeStore();
  const { setCurrentProvider, setProviderKey, setCurrentModel } = useChatStore();
  const { updateServer } = useMCPStore();

  const [stepIndex, setStepIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  // api-key step
  const [provider, setProvider] = useState<LLMProvider>("deepseek");
  const [apiKey, setApiKey] = useState("");
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState("");
  const [selectedModel, setSelectedModel] = useState<string>(
    () => (LLM_PROVIDERS["deepseek"].models as readonly string[])[0] ?? ""
  );
  const [modelList, setModelList] = useState<string[]>([]);

  // work-dir step
  const [workDir, setWorkDir] = useState("");

  // appearance step
  const [locale, setLocaleState] = useState<Locale>(currentLocale);
  const [theme, setThemeState] = useState(currentTheme);

  // Reset test status, model list, and selection when provider changes
  useEffect(() => {
    setTestStatus("idle");
    setTestError("");
    setModelList([]);
    const staticModels = (LLM_PROVIDERS[provider as keyof typeof LLM_PROVIDERS]?.models as readonly string[] | undefined) ?? [];
    setSelectedModel(staticModels[0] ?? "");
  }, [provider]);

  // Reset test status when apiKey changes
  useEffect(() => {
    setTestStatus("idle");
    setTestError("");
  }, [apiKey]);

  // Preview theme live
  useEffect(() => {
    const preset = getThemeById(theme);
    if (preset) {
      applyTheme(preset.config);
      if (preset.isDark) {
        document.documentElement.classList.add("dark");
      } else {
        document.documentElement.classList.remove("dark");
      }
    }
  }, [theme]);

  const currentStep = STEPS[stepIndex];

  const goToStep = useCallback(
    (newIndex: number) => {
      // Fade out
      setVisible(false);
      setTimeout(() => {
        setStepIndex(newIndex);
        // Gap then fade in
        setTimeout(() => {
          setVisible(true);
        }, 50);
      }, 150);
    },
    []
  );

  const handleNext = useCallback(async () => {
    if (currentStep === "api-key") {
      // No key entered — skip API key setup
      if (!apiKey) {
        goToStep(stepIndex + 1);
        return;
      }
      // Don't double-fire while testing
      if (testStatus === "testing") return;
      // Already succeeded or user is continuing despite failure
      if (testStatus === "ok" || testStatus === "fail") {
        goToStep(stepIndex + 1);
        return;
      }
      // First click: run test + fetch models in parallel
      setTestStatus("testing");
      setTestError("");
      try {
        const [testResult, modelsResult] = await Promise.allSettled([
          chatApi.testLLMConnection(provider, apiKey),
          chatApi.fetchLLMModels(provider, apiKey),
        ]);
        const testOk = testResult.status === "fulfilled" && testResult.value.success;
        if (modelsResult.status === "fulfilled" && modelsResult.value.models.length > 0) {
          setModelList(modelsResult.value.models);
          setSelectedModel(modelsResult.value.models[0]);
        }
        if (testOk) {
          setTestStatus("ok");
          // Stay on step so user can confirm/change model before continuing
        } else {
          setTestStatus("fail");
          const err = testResult.status === "fulfilled" ? testResult.value.error : undefined;
          setTestError(err || "连接失败");
        }
      } catch (e) {
        setTestStatus("fail");
        setTestError(e instanceof Error ? e.message : "未知错误");
      }
      return;
    }

    if (currentStep === "done") {
      // Write all values to stores
      if (apiKey) {
        setCurrentProvider(provider);
        setProviderKey(provider, apiKey);
        if (selectedModel) setCurrentModel(selectedModel);
      }
      if (workDir) {
        storeSetWorkDir(workDir);
        updateServer("filesystem", {
          args: [
            "../../node_modules/@modelcontextprotocol/server-filesystem/dist/index.js",
            workDir,
          ],
        });
      }
      setLocale(locale);
      setTheme(theme);
      setOnboardingCompleted(true);
      return;
    }
    goToStep(stepIndex + 1);
  }, [
    currentStep,
    stepIndex,
    apiKey,
    provider,
    selectedModel,
    modelList,
    testStatus,
    workDir,
    locale,
    theme,
    setCurrentProvider,
    setProviderKey,
    setCurrentModel,
    storeSetWorkDir,
    updateServer,
    setLocale,
    setTheme,
    setOnboardingCompleted,
    goToStep,
  ]);

  const handleBack = useCallback(() => {
    if (stepIndex > 0) {
      goToStep(stepIndex - 1);
    }
  }, [stepIndex, goToStep]);

  const handleSkip = useCallback(() => {
    setOnboardingCompleted(true);
  }, [setOnboardingCompleted]);

  const handleBrowseDir = useCallback(async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const electronAPI = (window as any).electronAPI as
        | { invoke: (ch: string) => Promise<unknown> }
        | undefined;
      if (!electronAPI) return;
      const dir = await electronAPI.invoke("dialog:openDirectory");
      if (typeof dir === "string" && dir) {
        setWorkDir(dir);
      }
    } catch {
      // ignore
    }
  }, []);

  const primaryLabel =
    currentStep === "welcome"
      ? "开始"
      : currentStep === "done"
      ? "进入 LeoChat"
      : currentStep === "api-key" && testStatus === "testing"
      ? "验证中..."
      : "继续 →";

  const isPrimaryDisabled = currentStep === "api-key" && testStatus === "testing";

  const isDoneStep = currentStep === "done";

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col items-center justify-center">
      {/* Content area */}
      <div
        className="w-full max-w-lg px-8 flex flex-col gap-8"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(8px)",
          transition: visible
            ? "opacity 300ms cubic-bezier(0.4,0,0.2,1), transform 300ms cubic-bezier(0.4,0,0.2,1)"
            : "opacity 150ms ease-in, transform 150ms ease-in",
        }}
      >
        {/* Step content */}
        {currentStep === "welcome" && <WelcomeStep />}
        {currentStep === "api-key" && (
          <ApiKeyStep
            provider={provider}
            setProvider={setProvider}
            apiKey={apiKey}
            setApiKey={setApiKey}
            testStatus={testStatus}
            testError={testError}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            modelList={modelList}
          />
        )}
        {currentStep === "work-dir" && (
          <WorkDirStep
            workDir={workDir}
            setWorkDir={setWorkDir}
            onBrowse={handleBrowseDir}
          />
        )}
        {currentStep === "appearance" && (
          <AppearanceStep
            locale={locale}
            setLocale={setLocaleState}
            theme={theme}
            setTheme={setThemeState}
          />
        )}
        {currentStep === "done" && <DoneStep />}

        {/* Primary button */}
        <div className="flex justify-center">
          <button
            onClick={handleNext}
            disabled={isPrimaryDisabled}
            className={cn(
              "rounded-full px-8 py-3 bg-primary text-primary-foreground font-medium",
              "transition-all duration-200",
              isPrimaryDisabled
                ? "opacity-60 cursor-not-allowed"
                : "hover:opacity-90 active:scale-95"
            )}
          >
            {primaryLabel}
          </button>
        </div>
      </div>

      {/* Step dots */}
      <div className="absolute bottom-16 flex gap-2 items-center">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className="rounded-full transition-all duration-200"
            style={{
              width: i === stepIndex ? 20 : 8,
              height: 8,
              background: i === stepIndex ? "hsl(var(--primary))" : "hsl(var(--muted-foreground) / 0.4)",
            }}
          />
        ))}
      </div>

      {/* Bottom navigation */}
      <div className="absolute bottom-6 left-8 right-8 flex justify-between items-center">
        {/* Back button */}
        {stepIndex > 0 ? (
          <button
            onClick={handleBack}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            ← 返回
          </button>
        ) : (
          <div />
        )}

        {/* Skip button */}
        {!isDoneStep ? (
          <button
            onClick={handleSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-200"
          >
            稍后再说
          </button>
        ) : (
          <div />
        )}
      </div>
    </div>
  );
}

// ── Step components ────────────────────────────────────────────────

function WelcomeStep() {
  return (
    <div className="text-center flex flex-col gap-4">
      <h1 className="text-4xl font-bold text-primary tracking-wide">✦ LeoChat ✦</h1>
      <p className="text-muted-foreground text-lg">
        欢迎使用 LeoChat。让我们花一点时间完成初始设置，开始你的 AI 对话之旅。
      </p>
    </div>
  );
}

interface ApiKeyStepProps {
  provider: LLMProvider;
  setProvider: (p: LLMProvider) => void;
  apiKey: string;
  setApiKey: (k: string) => void;
  testStatus: TestStatus;
  testError: string;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  modelList: string[];
}

function ApiKeyStep({
  provider,
  setProvider,
  apiKey,
  setApiKey,
  testStatus,
  testError,
  selectedModel,
  setSelectedModel,
  modelList,
}: ApiKeyStepProps) {
  // Use fetched models when available, fall back to static list
  const staticModels = (LLM_PROVIDERS[provider as keyof typeof LLM_PROVIDERS]?.models as readonly string[] | undefined) ?? [];
  const displayModels = modelList.length > 0 ? modelList : staticModels;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-foreground">配置 AI 服务</h2>
        <p className="text-muted-foreground text-sm">
          选择你的 AI 服务商并填入 API Key，也可以稍后在设置中配置。
        </p>
      </div>

      {/* Provider dropdown */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">服务商</label>
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value as LLMProvider)}
          className={cn(
            "w-full rounded-lg border border-border bg-card text-foreground px-3 py-2",
            "focus:outline-none focus:ring-2 focus:ring-primary/50",
            "transition-colors duration-200"
          )}
        >
          {PROVIDER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* API key input */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">API Key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="sk-..."
          className={cn(
            "w-full rounded-lg border border-border bg-card text-foreground px-3 py-2",
            "focus:outline-none focus:ring-2 focus:ring-primary/50",
            "placeholder:text-muted-foreground transition-colors duration-200"
          )}
        />
      </div>

      {/* Model selection */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">
          默认模型
          {testStatus === "testing" && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">获取列表中...</span>
          )}
        </label>
        {displayModels.length > 0 ? (
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={testStatus === "testing"}
            className={cn(
              "w-full rounded-lg border border-border bg-card text-foreground px-3 py-2",
              "focus:outline-none focus:ring-2 focus:ring-primary/50",
              "transition-colors duration-200",
              testStatus === "testing" && "opacity-50"
            )}
          >
            {displayModels.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            disabled={testStatus === "testing"}
            placeholder="输入模型名称，如 anthropic/claude-3.5-sonnet"
            className={cn(
              "w-full rounded-lg border border-border bg-card text-foreground px-3 py-2",
              "focus:outline-none focus:ring-2 focus:ring-primary/50",
              "placeholder:text-muted-foreground transition-colors duration-200",
              testStatus === "testing" && "opacity-50"
            )}
          />
        )}
      </div>

      {/* Connection test status */}
      {testStatus === "ok" && (
        <span
          className="text-green-500 text-sm font-medium"
          style={{ animation: "fadeIn 200ms ease-out" }}
        >
          ✓ 连接成功
        </span>
      )}
      {testStatus === "fail" && (
        <div
          className="flex flex-col gap-1"
          style={{ animation: "fadeIn 200ms ease-out" }}
        >
          <span className="text-destructive text-sm">
            ✗ 连接失败 — 你可以点击继续，稍后在设置中重新配置
          </span>
          {testError && (
            <span className="text-muted-foreground text-xs">{testError}</span>
          )}
        </div>
      )}
    </div>
  );
}

interface WorkDirStepProps {
  workDir: string;
  setWorkDir: (d: string) => void;
  onBrowse: () => void;
}

function WorkDirStep({ workDir, setWorkDir, onBrowse }: WorkDirStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-foreground">工作目录</h2>
        <p className="text-muted-foreground text-sm">
          设置文件系统工具可访问的工作目录，也可以稍后在设置中修改。
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">目录路径</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={workDir}
            onChange={(e) => setWorkDir(e.target.value)}
            placeholder={`例如 C:\\Users\\你的名字\\Documents`}
            className={cn(
              "flex-1 rounded-lg border border-border bg-card text-foreground px-3 py-2",
              "focus:outline-none focus:ring-2 focus:ring-primary/50",
              "placeholder:text-muted-foreground transition-colors duration-200"
            )}
          />
          <button
            onClick={onBrowse}
            className={cn(
              "rounded-lg border border-border px-4 py-2 text-sm font-medium",
              "text-foreground hover:bg-muted transition-colors duration-200"
            )}
          >
            浏览
          </button>
        </div>
      </div>
    </div>
  );
}

interface AppearanceStepProps {
  locale: Locale;
  setLocale: (l: Locale) => void;
  theme: string;
  setTheme: (t: string) => void;
}

function AppearanceStep({ locale, setLocale, theme, setTheme }: AppearanceStepProps) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl font-semibold text-foreground">外观设置</h2>
        <p className="text-muted-foreground text-sm">选择你喜欢的语言和主题，可以随时在设置中更改。</p>
      </div>

      {/* Language dropdown */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">语言</label>
        <select
          value={locale}
          onChange={(e) => setLocale(e.target.value as Locale)}
          className={cn(
            "w-full rounded-lg border border-border bg-card text-foreground px-3 py-2",
            "focus:outline-none focus:ring-2 focus:ring-primary/50",
            "transition-colors duration-200"
          )}
        >
          {LOCALES.map((loc) => (
            <option key={loc.code} value={loc.code}>
              {loc.flag} {loc.nativeName}
            </option>
          ))}
        </select>
      </div>

      {/* Theme grid */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium text-foreground">主题</label>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => setTheme(opt.id)}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm transition-all duration-200",
                theme === opt.id
                  ? "border-primary bg-primary/10 text-foreground font-medium"
                  : "border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DoneStep() {
  return (
    <div className="text-center flex flex-col gap-4">
      <h2 className="text-3xl font-bold text-foreground">一切就绪 🎉</h2>
      <p className="text-muted-foreground">
        你的 LeoChat 已经配置完成。所有设置都可以在主界面的设置中随时更改。
      </p>
    </div>
  );
}
