import { useCallback, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  MCPServerConfigSchema,
  type MCPServerConfigValidated,
} from "@ai-chatbox/shared";
import { Button, cn } from "@ai-chatbox/ui";
import { Terminal, Globe, ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { useT } from "../../i18n";

function Label({ children, className, htmlFor }: { children: React.ReactNode; className?: string; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className={className}>{children}</label>;
}

/** 已知 MCP 服务器的参数提示 */
interface MCPArgHint {
  /** 包名关键词匹配 */
  match: string;
  /** 固定参数部分（包名前缀等），用于识别"额外参数"起始位置 */
  fixedArgs: string[];
  /** 额外参数的提示 */
  extraArgs: {
    placeholder: string;
    description: string;
    required?: boolean;
    multiple?: boolean;
  }[];
  /** 环境变量提示 */
  envHints?: { key: string; description: string }[];
}

const MCP_ARG_HINTS: MCPArgHint[] = [
  {
    match: "server-filesystem",
    fixedArgs: ["-y", "@modelcontextprotocol/server-filesystem"],
    extraArgs: [
      {
        placeholder: "C:\\Users\\docs 或 /home/user/docs",
        description: "允许访问的目录路径（可添加多个）",
        required: true,
        multiple: true,
      },
    ],
  },
  {
    match: "server-github",
    fixedArgs: ["-y", "@modelcontextprotocol/server-github"],
    extraArgs: [],
    envHints: [
      { key: "GITHUB_PERSONAL_ACCESS_TOKEN", description: "GitHub 个人访问令牌" },
    ],
  },
  {
    match: "server-gitlab",
    fixedArgs: ["-y", "@modelcontextprotocol/server-gitlab"],
    extraArgs: [],
    envHints: [
      { key: "GITLAB_PERSONAL_ACCESS_TOKEN", description: "GitLab 个人访问令牌" },
      { key: "GITLAB_API_URL", description: "GitLab API 地址（默认 https://gitlab.com/api/v4）" },
    ],
  },
  {
    match: "server-postgres",
    fixedArgs: ["-y", "@modelcontextprotocol/server-postgres"],
    extraArgs: [
      {
        placeholder: "postgresql://user:pass@localhost:5432/dbname",
        description: "PostgreSQL 连接字符串",
        required: true,
      },
    ],
  },
  {
    match: "server-sqlite",
    fixedArgs: ["-y", "@modelcontextprotocol/server-sqlite"],
    extraArgs: [
      {
        placeholder: "C:\\data\\my-database.db",
        description: "SQLite 数据库文件路径",
        required: true,
      },
    ],
  },
  {
    match: "server-puppeteer",
    fixedArgs: ["-y", "@modelcontextprotocol/server-puppeteer"],
    extraArgs: [],
  },
  {
    match: "server-brave-search",
    fixedArgs: ["-y", "@modelcontextprotocol/server-brave-search"],
    extraArgs: [],
    envHints: [
      { key: "BRAVE_API_KEY", description: "Brave Search API 密钥" },
    ],
  },
  {
    match: "server-google-maps",
    fixedArgs: ["-y", "@modelcontextprotocol/server-google-maps"],
    extraArgs: [],
    envHints: [
      { key: "GOOGLE_MAPS_API_KEY", description: "Google Maps API 密钥" },
    ],
  },
  {
    match: "server-fetch",
    fixedArgs: ["-y", "@modelcontextprotocol/server-fetch"],
    extraArgs: [],
  },
  {
    match: "server-memory",
    fixedArgs: ["-y", "@modelcontextprotocol/server-memory"],
    extraArgs: [],
  },
  {
    match: "server-everything",
    fixedArgs: ["-y", "@modelcontextprotocol/server-everything"],
    extraArgs: [],
  },
  {
    match: "server-sequential-thinking",
    fixedArgs: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    extraArgs: [],
  },
];

function detectMCPHint(args: string[]): MCPArgHint | null {
  const joined = args.join(" ").toLowerCase();
  return MCP_ARG_HINTS.find((h) => joined.includes(h.match)) || null;
}

/** 动态增减参数列表 */
function ArgsInput({
  defaultValue,
  onChange,
}: {
  defaultValue?: string[];
  onChange: (args: string[]) => void;
}) {
  const { t } = useT();
  const [items, setItems] = useState<string[]>(
    defaultValue && defaultValue.length > 0 ? defaultValue : [""]
  );

  const hint = useMemo(() => detectMCPHint(items), [items]);

  const update = useCallback(
    (newItems: string[]) => {
      setItems(newItems);
      onChange(newItems.filter((v) => v.trim() !== ""));
    },
    [onChange]
  );

  const handleChange = (index: number, value: string) => {
    const next = [...items];
    next[index] = value;
    update(next);
  };

  const handleAdd = () => {
    update([...items, ""]);
  };

  const handleRemove = (index: number) => {
    if (items.length <= 1) {
      update([""]);
      return;
    }
    update(items.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...items];
      next.splice(index + 1, 0, "");
      setItems(next);
      setTimeout(() => {
        const el = document.getElementById(`arg-${index + 1}`);
        el?.focus();
      }, 0);
    }
    if (e.key === "Backspace" && items[index] === "" && items.length > 1) {
      e.preventDefault();
      handleRemove(index);
      setTimeout(() => {
        const target = Math.max(0, index - 1);
        const el = document.getElementById(`arg-${target}`);
        el?.focus();
      }, 0);
    }
  };

  const getPlaceholder = (index: number): string => {
    if (hint) {
      if (index < hint.fixedArgs.length) {
        return hint.fixedArgs[index];
      }
      const extraIndex = index - hint.fixedArgs.length;
      if (hint.extraArgs.length > 0) {
        const extra = hint.extraArgs[Math.min(extraIndex, hint.extraArgs.length - 1)];
        return extra.placeholder;
      }
      return t("mcp.form.argPlaceholder");
    }
    if (index === 0) return t("mcp.form.argExample1");
    if (index === 1) return t("mcp.form.argExample2");
    return t("mcp.form.argPlaceholder");
  };

  const needsExtraArgs = hint?.extraArgs.some((e) => e.required) && items.length <= (hint?.fixedArgs.length ?? 0);

  return (
    <div>
      <Label className="text-sm font-medium">{t("mcp.form.args")}</Label>
      <div className="mt-1.5 space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground w-5 text-right shrink-0">
              {index + 1}
            </span>
            <input
              id={`arg-${index}`}
              value={item}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              placeholder={getPlaceholder(index)}
              className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={() => handleRemove(index)}
              className="shrink-0 p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
              title={t("mcp.form.deleteArg")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:bg-primary/10 rounded-md px-2 py-1.5 transition-colors"
        title={t("mcp.form.addArgHint")}
      >
        <Plus className="h-3.5 w-3.5" />
        {t("mcp.form.addArg")}
      </button>

      {/* 知名 MCP 参数提示 */}
      {hint && (needsExtraArgs || (hint.envHints && hint.envHints.length > 0)) && (
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs space-y-2">
          {needsExtraArgs && hint.extraArgs.map((extra, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">*</span>
              <span className="text-blue-700">
                {extra.description}
                {extra.multiple && ""}
              </span>
            </div>
          ))}
          {hint.envHints?.map((env) => (
            <div key={env.key} className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">*</span>
              <span className="text-blue-700">
                <code className="px-1 py-0.5 rounded bg-blue-100 font-mono text-[11px]">{env.key}</code>
                {" — "}{env.description}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 环境变量 key-value 编辑器 */
function EnvInput({
  defaultValue,
  onChange,
}: {
  defaultValue?: Record<string, string>;
  onChange: (env: Record<string, string> | undefined) => void;
}) {
  const { t } = useT();
  const [items, setItems] = useState<{ key: string; value: string }[]>(
    defaultValue
      ? Object.entries(defaultValue).map(([key, value]) => ({ key, value }))
      : []
  );
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const syncToForm = useCallback(
    (updated: { key: string; value: string }[]) => {
      setItems(updated);
      const env: Record<string, string> = {};
      updated.forEach((item) => {
        if (item.key.trim()) {
          env[item.key.trim()] = item.value;
        }
      });
      onChange(Object.keys(env).length > 0 ? env : undefined);
    },
    [onChange]
  );

  const handleAdd = () => {
    if (!newKey.trim()) return;
    // 重复 key 则更新 value
    const existing = items.findIndex((item) => item.key === newKey.trim());
    if (existing >= 0) {
      const updated = [...items];
      updated[existing] = { key: newKey.trim(), value: newValue };
      syncToForm(updated);
    } else {
      syncToForm([...items, { key: newKey.trim(), value: newValue }]);
    }
    setNewKey("");
    setNewValue("");
    // 聚焦回 key 输入框
    setTimeout(() => document.getElementById("env-new-key")?.focus(), 0);
  };

  const handleRemove = (index: number) => {
    syncToForm(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: "key" | "value", val: string) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: val };
    syncToForm(updated);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAdd();
    }
  };

  return (
    <div>
      <Label className="text-sm font-medium">{t("mcp.form.env")}</Label>

      {/* 已有条目 */}
      {items.length > 0 && (
        <div className="mt-1.5 space-y-2">
          {items.map((item, index) => (
            <div key={index} className="flex items-center gap-2">
              <input
                value={item.key}
                onChange={(e) => handleItemChange(index, "key", e.target.value)}
                placeholder={t("mcp.form.envNamePlaceholder")}
                className="w-[40%] rounded-md border bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20"
              />
              <span className="text-muted-foreground">=</span>
              <input
                value={item.value}
                onChange={(e) => handleItemChange(index, "value", e.target.value)}
                placeholder={t("mcp.form.envValuePlaceholder")}
                className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={() => handleRemove(index)}
                className="shrink-0 p-1 rounded text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                title={t("mcp.form.deleteEnv")}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 添加行 */}
      <div className="mt-2 flex items-center gap-2">
        <input
          id="env-new-key"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("mcp.form.envNamePlaceholder")}
          className="w-[40%] rounded-md border bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20"
        />
        <span className="text-muted-foreground">=</span>
        <input
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("mcp.form.envValuePlaceholder")}
          className="flex-1 rounded-md border bg-background px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={handleAdd}
          className={cn(
            "shrink-0 p-1 rounded transition-colors",
            newKey.trim()
              ? "text-primary hover:bg-primary/10"
              : "text-muted-foreground/40 cursor-not-allowed"
          )}
          title={t("mcp.form.addEnvHint")}
          disabled={!newKey.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

interface ServerFormProps {
  defaultValues?: Partial<MCPServerConfigValidated>;
  onSubmit: (data: MCPServerConfigValidated) => void;
  onCancel?: () => void;
  submitLabel?: string;
}

export function ServerForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
}: ServerFormProps) {
  const { t } = useT();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<MCPServerConfigValidated>({
    resolver: zodResolver(MCPServerConfigSchema),
    defaultValues: {
      transport: "stdio",
      command: "npx",
      args: [],
      env: {},
      timeout: 30000,
      ...defaultValues,
    },
  });

  const transport = watch("transport");
  const command = watch("command");

  // 自动检测 Registry 类型
  const registryType = useMemo<"npm" | "pip" | null>(() => {
    if (!command) return null;

    const lowerCommand = command.toLowerCase();
    if (
      lowerCommand.includes("npx") ||
      lowerCommand.includes("npm") ||
      lowerCommand.includes("bun")
    ) {
      return "npm";
    }
    if (
      lowerCommand.includes("uvx") ||
      lowerCommand.includes("uv") ||
      lowerCommand.includes("pip")
    ) {
      return "pip";
    }
    return null;
  }, [command]);

  const handleFormSubmit = (data: MCPServerConfigValidated) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* 基础信息 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">{t("mcp.form.basicInfo")}</h3>

        {/* 名称 */}
        <div>
          <Label htmlFor="name" className="text-sm font-medium">
            {t("mcp.form.name")} <span className="text-red-500">*</span>
          </Label>
          <input
            id="name"
            {...register("name")}
            placeholder={t("mcp.form.serverNameExample")}
            className={cn(
              "mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20",
              errors.name && "border-red-500"
            )}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
          )}
        </div>

        {/* 连接类型 */}
        <div>
          <Label className="text-sm font-medium mb-2 block">
            {t("mcp.form.connectionType")} <span className="text-red-500">*</span>
          </Label>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setValue("transport", "stdio", { shouldDirty: true })}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-4 py-3 transition-all",
                transport === "stdio"
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-muted"
              )}
            >
              <Terminal className="h-4 w-4" />
              <div className="text-left">
                <div className="font-medium text-sm">STDIO</div>
                <div className="text-xs opacity-80">{t("mcp.form.stdioDesc")}</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() =>
                setValue("transport", "streamable-http", { shouldDirty: true })
              }
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg border px-4 py-3 transition-all",
                transport === "streamable-http"
                  ? "border-primary bg-primary/10 text-primary"
                  : "hover:bg-muted"
              )}
            >
              <Globe className="h-4 w-4" />
              <div className="text-left">
                <div className="font-medium text-sm">HTTP</div>
                <div className="text-xs opacity-80">{t("mcp.form.httpDesc")}</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* STDIO 配置 */}
      {transport === "stdio" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t("mcp.form.stdioConfig")}</h3>

          {/* 命令 */}
          <div>
            <Label htmlFor="command" className="text-sm font-medium">
              {t("mcp.form.command")} <span className="text-red-500">*</span>
            </Label>
            <input
              id="command"
              {...register("command")}
              placeholder={t("mcp.form.commandExample")}
              className={cn(
                "mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20",
                errors.command && "border-red-500"
              )}
            />
            {errors.command && (
              <p className="mt-1 text-xs text-red-500">{errors.command.message}</p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("mcp.form.commandDesc")}
            </p>
          </div>

          {/* 参数 */}
          <ArgsInput
            defaultValue={defaultValues?.args}
            onChange={(args) => {
              setValue("args", args.length > 0 ? args : undefined, {
                shouldDirty: true,
              });
            }}
          />

          {/* Registry 选择器 (尚未实现) */}
          {registryType && (
            <div className="rounded-lg border bg-muted/30 p-4 opacity-50 pointer-events-none">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ChevronRight className="h-4 w-4" />
                {registryType === "npm" ? "NPM" : "Pip"} {t("mcp.form.registryConfig")}
                <span className="ml-auto text-xs text-muted-foreground">(coming soon)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* HTTP 配置 */}
      {transport === "streamable-http" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">{t("mcp.form.httpConfig")}</h3>

          {/* URL */}
          <div>
            <Label htmlFor="url" className="text-sm font-medium">
              {t("mcp.form.serverUrl")} <span className="text-red-500">*</span>
            </Label>
            <input
              id="url"
              type="url"
              {...register("url")}
              placeholder="http://localhost:3000/mcp"
              className={cn(
                "mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20",
                errors.url && "border-red-500"
              )}
            />
            {errors.url && (
              <p className="mt-1 text-xs text-red-500">{errors.url.message}</p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              {t("mcp.form.serverUrlDesc")}
            </p>
          </div>
        </div>
      )}

      {/* 通用选项 */}
      <div className="space-y-4">
        {/* Auto Connect */}
        <div className="flex items-center gap-2">
          <input
            id="autoConnect"
            type="checkbox"
            {...register("autoConnect")}
            className="h-4 w-4 rounded border-gray-300"
          />
          <Label
            htmlFor="autoConnect"
            className="text-sm font-medium cursor-pointer"
          >
            {t("mcp.form.autoConnectLabel")}
          </Label>
        </div>
      </div>

      {/* 高级设置 */}
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-semibold"
        >
          {showAdvanced ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
          {t("mcp.form.advancedSettings")}
        </button>

        {showAdvanced && (
          <div className="space-y-4 pl-6 border-l-2">
            {/* 描述 */}
            <div>
              <Label htmlFor="description" className="text-sm font-medium">
                {t("mcp.form.description")}
              </Label>
              <textarea
                id="description"
                {...register("description")}
                placeholder={t("mcp.form.descriptionPlaceholder")}
                rows={3}
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
            </div>

            {/* 环境变量 */}
            <EnvInput
              defaultValue={defaultValues?.env}
              onChange={(env) => {
                setValue("env", env, { shouldDirty: true });
              }}
            />

            {/* Timeout */}
            <div>
              <Label htmlFor="timeout" className="text-sm font-medium">
                {t("mcp.form.timeout")}
              </Label>
              <input
                id="timeout"
                type="number"
                {...register("timeout", { valueAsNumber: true })}
                placeholder="30000"
                className={cn(
                  "mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20",
                  errors.timeout && "border-red-500"
                )}
              />
              {errors.timeout && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.timeout.message}
                </p>
              )}
            </div>

            {/* Provider */}
            <div>
              <Label htmlFor="provider" className="text-sm font-medium">
                Provider
              </Label>
              <input
                id="provider"
                {...register("provider")}
                placeholder="例如: Anthropic, OpenAI"
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>

            {/* Tags */}
            <div>
              <Label htmlFor="tags" className="text-sm font-medium">
                {t("mcp.form.tags")}
              </Label>
              <input
                id="tags"
                placeholder="tag1, tag2, tag3"
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                onChange={(e) => {
                  const tags = e.target.value
                    .split(",")
                    .map((t) => t.trim())
                    .filter((t) => t !== "");
                  setValue("tags", tags.length > 0 ? tags : undefined, {
                    shouldDirty: true,
                  });
                }}
                defaultValue={defaultValues?.tags?.join(", ") || ""}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t("mcp.form.tagsSeparator")}
              </p>
            </div>

            {/* Logo URL (尚未实现) */}
            <div className="opacity-50 pointer-events-none">
              <Label htmlFor="logoUrl" className="text-sm font-medium">
                Logo URL
                <span className="ml-2 text-xs text-muted-foreground font-normal">(coming soon)</span>
              </Label>
              <input
                id="logoUrl"
                type="url"
                disabled
                placeholder="https://example.com/logo.png"
                className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none"
              />
            </div>

            {/* Long Running (尚未实现) */}
            <div className="flex items-center gap-2 opacity-50 pointer-events-none">
              <input
                id="longRunning"
                type="checkbox"
                disabled
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="longRunning" className="text-sm font-medium">
                {t("mcp.form.longRunning")}
                <span className="ml-2 text-xs text-muted-foreground font-normal">(coming soon)</span>
              </Label>
            </div>
          </div>
        )}
      </div>

      {/* 表单操作 */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" disabled={!isDirty && !!defaultValues}>
          {submitLabel || t("common.save")}
        </Button>
      </div>
    </form>
  );
}
