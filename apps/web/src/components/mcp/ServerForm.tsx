import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  MCPServerConfigSchema,
  type MCPServerConfigValidated,
} from "@ai-chatbox/shared";
import { Button, cn } from "@ai-chatbox/ui";
import { Terminal, Globe, ChevronDown, ChevronRight } from "lucide-react";
import { RegistrySelector } from "./RegistrySelector";

function Label({ children, className, htmlFor }: { children: React.ReactNode; className?: string; htmlFor?: string }) {
  return <label htmlFor={htmlFor} className={className}>{children}</label>;
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
          <div>
            <Label htmlFor="args" className="text-sm font-medium">
              参数
            </Label>
            <input
              id="args"
              {...register("args")}
              placeholder="例如: -y @modelcontextprotocol/server-memory"
              className="mt-1.5 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              onChange={(e) => {
                const args = e.target.value
                  .split(/\s+/)
                  .filter((arg) => arg.trim() !== "");
                setValue("args", args.length > 0 ? args : undefined, {
                  shouldDirty: true,
                });
              }}
              defaultValue={defaultValues?.args?.join(" ") || ""}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              用空格分隔多个参数
            </p>
          </div>

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
