import { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  MCPServerConfigSchema,
  type MCPServerConfigValidated,
} from "@ai-chatbox/shared";
import { Button, cn } from "@ai-chatbox/ui";
import { Terminal, Globe, ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { RegistrySelector } from "./RegistrySelector";

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
    // Enter 在当前行后新增一行
    if (e.key === "Enter") {
      e.preventDefault();
      const next = [...items];
      next.splice(index + 1, 0, "");
      setItems(next);
      // 聚焦新行（下一个 tick）
      setTimeout(() => {
        const el = document.getElementById(`arg-${index + 1}`);
        el?.focus();
      }, 0);
    }
    // Backspace 在空行时删除并聚焦上一行
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

  // 计算每行的 placeholder
  const getPlaceholder = (index: number): string => {
    if (hint) {
      // 固定参数区域：显示预期值
      if (index < hint.fixedArgs.length) {
        return hint.fixedArgs[index];
      }
      // 额外参数区域：显示提示
      const extraIndex = index - hint.fixedArgs.length;
      if (hint.extraArgs.length > 0) {
        const extra = hint.extraArgs[Math.min(extraIndex, hint.extraArgs.length - 1)];
        return extra.placeholder;
      }
      return "参数值...";
    }
    // 无匹配时的通用提示
    if (index === 0) return "例如: -y";
    if (index === 1) return "例如: @modelcontextprotocol/server-memory";
    return "参数值...";
  };

  // 额外参数是否需要添加提示
  const needsExtraArgs = hint?.extraArgs.some((e) => e.required) && items.length <= (hint?.fixedArgs.length ?? 0);

  return (
    <div>
      <Label className="text-sm font-medium">参数</Label>
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
              title="删除此参数"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={handleAdd}
        className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        添加参数
      </button>

      {/* 知名 MCP 参数提示 */}
      {hint && (needsExtraArgs || (hint.envHints && hint.envHints.length > 0)) && (
        <div className="mt-3 rounded-md border border-blue-200 bg-blue-50/50 p-3 text-xs space-y-2">
          {needsExtraArgs && hint.extraArgs.map((extra, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">*</span>
              <span className="text-blue-700">
                {extra.description}
                {extra.multiple && " — 可添加多行"}
              </span>
            </div>
          ))}
          {hint.envHints?.map((env) => (
            <div key={env.key} className="flex items-start gap-2">
              <span className="text-blue-500 mt-0.5">*</span>
              <span className="text-blue-700">
                需要环境变量 <code className="px-1 py-0.5 rounded bg-blue-100 font-mono text-[11px]">{env.key}</code>
                {" — "}{env.description}
              </span>
            </div>
          ))}
        </div>
      )}
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
  submitLabel = "保存",
}: ServerFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showRegistrySelector, setShowRegistrySelector] = useState(false);

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
      ...defaultValues,
    },
  });

  const transport = watch("transport");
  const command = watch("command");
  const registryUrl = watch("registryUrl");

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

  // 当检测到 registry 类型时，自动显示选择器
  useEffect(() => {
    if (registryType && transport === "stdio") {
      setShowRegistrySelector(true);
    }
  }, [registryType, transport]);

  const handleFormSubmit = (data: MCPServerConfigValidated) => {
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      {/* 基础信息 */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold">基础信息</h3>

        {/* 名称 */}
        <div>
          <Label htmlFor="name" className="text-sm font-medium">
            名称 <span className="text-red-500">*</span>
          </Label>
          <input
            id="name"
            {...register("name")}
            placeholder="例如: Memory Server"
            className={cn(
              "mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20",
              errors.name && "border-red-500"
            )}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-500">{errors.name.message}</p>
          )}
        </div>

        {/* 描述 */}
        <div>
          <Label htmlFor="description" className="text-sm font-medium">
            描述
          </Label>
          <textarea
            id="description"
            {...register("description")}
            placeholder="简要描述此服务器的功能..."
            rows={3}
            className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none"
          />
        </div>

        {/* 连接类型 */}
        <div>
          <Label className="text-sm font-medium mb-2 block">
            连接类型 <span className="text-red-500">*</span>
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
                <div className="text-xs opacity-80">本地进程通信</div>
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
                <div className="text-xs opacity-80">远程 HTTP 连接</div>
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* STDIO 配置 */}
      {transport === "stdio" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">STDIO 配置</h3>

          {/* 命令 */}
          <div>
            <Label htmlFor="command" className="text-sm font-medium">
              命令 <span className="text-red-500">*</span>
            </Label>
            <input
              id="command"
              {...register("command")}
              placeholder="例如: npx 或 uvx"
              className={cn(
                "mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20",
                errors.command && "border-red-500"
              )}
            />
            {errors.command && (
              <p className="mt-1 text-xs text-red-500">{errors.command.message}</p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              用于启动 MCP 服务器的命令，如 npx、node、python 等
            </p>
          </div>

          {/* Registry 选择器 */}
          {registryType && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <button
                type="button"
                onClick={() => setShowRegistrySelector(!showRegistrySelector)}
                className="flex items-center gap-2 text-sm font-medium mb-3"
              >
                {showRegistrySelector ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                {registryType === "npm" ? "NPM" : "Pip"} Registry 配置
                {registryUrl && (
                  <span className="ml-auto text-xs text-green-600">已配置</span>
                )}
              </button>
              {showRegistrySelector && (
                <RegistrySelector
                  type={registryType}
                  value={registryUrl}
                  onChange={(url) =>
                    setValue("registryUrl", url || undefined, { shouldDirty: true })
                  }
                />
              )}
            </div>
          )}

          {/* 参数 */}
          <ArgsInput
            defaultValue={defaultValues?.args}
            onChange={(args) => {
              setValue("args", args.length > 0 ? args : undefined, {
                shouldDirty: true,
              });
            }}
          />

          {/* 环境变量 */}
          <div>
            <Label htmlFor="env" className="text-sm font-medium">
              环境变量
            </Label>
            <textarea
              id="env"
              placeholder={`KEY1=value1\nKEY2=value2`}
              rows={3}
              className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none font-mono"
              onChange={(e) => {
                const env: Record<string, string> = {};
                e.target.value.split("\n").forEach((line) => {
                  const [key, ...valueParts] = line.split("=");
                  if (key?.trim() && valueParts.length > 0) {
                    env[key.trim()] = valueParts.join("=").trim();
                  }
                });
                setValue("env", Object.keys(env).length > 0 ? env : undefined, {
                  shouldDirty: true,
                });
              }}
              defaultValue={
                defaultValues?.env
                  ? Object.entries(defaultValues.env)
                      .map(([k, v]) => `${k}=${v}`)
                      .join("\n")
                  : ""
              }
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              每行一个环境变量，格式: KEY=value
            </p>
          </div>
        </div>
      )}

      {/* HTTP 配置 */}
      {transport === "streamable-http" && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">HTTP 配置</h3>

          {/* URL */}
          <div>
            <Label htmlFor="url" className="text-sm font-medium">
              服务器 URL <span className="text-red-500">*</span>
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
              远程 MCP 服务器的完整 URL
            </p>
          </div>
        </div>
      )}

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
          高级设置
        </button>

        {showAdvanced && (
          <div className="space-y-4 pl-6 border-l-2">
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

            {/* Logo URL */}
            <div>
              <Label htmlFor="logoUrl" className="text-sm font-medium">
                Logo URL
              </Label>
              <input
                id="logoUrl"
                type="url"
                {...register("logoUrl")}
                placeholder="https://example.com/logo.png"
                className={cn(
                  "mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20",
                  errors.logoUrl && "border-red-500"
                )}
              />
              {errors.logoUrl && (
                <p className="mt-1 text-xs text-red-500">
                  {errors.logoUrl.message}
                </p>
              )}
            </div>

            {/* Tags */}
            <div>
              <Label htmlFor="tags" className="text-sm font-medium">
                标签
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
                用逗号分隔多个标签
              </p>
            </div>

            {/* Timeout */}
            <div>
              <Label htmlFor="timeout" className="text-sm font-medium">
                超时时间 (毫秒)
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

            {/* Long Running */}
            <div className="flex items-center gap-2">
              <input
                id="longRunning"
                type="checkbox"
                {...register("longRunning")}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="longRunning" className="text-sm font-medium cursor-pointer">
                长期运行服务器
              </Label>
            </div>

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
                启动时自动连接
              </Label>
            </div>
          </div>
        )}
      </div>

      {/* 表单操作 */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            取消
          </Button>
        )}
        <Button type="submit" disabled={!isDirty}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
