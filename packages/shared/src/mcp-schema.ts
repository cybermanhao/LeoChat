import { z } from "zod";

/**
 * MCP Server Configuration Schema
 * 用于验证 MCP 服务器配置的完整性和正确性
 */
export const MCPServerConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "服务器名称不能为空"),
  transport: z.enum(["stdio", "streamable-http"], {
    message: "连接类型必须是 stdio 或 streamable-http",
  }),

  // STDIO 配置
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),

  // HTTP 配置
  url: z.string().url("无效的 URL").optional(),

  // 高级配置
  description: z.string().optional(),
  provider: z.string().optional(),
  logoUrl: z.union([z.string().url("无效的 Logo URL"), z.literal("")]).optional(),
  tags: z.array(z.string()).optional(),
  registryUrl: z.string().optional(),
  timeout: z.preprocess(
    (val) => (Number.isNaN(val as number) ? undefined : val),
    z.number().int().positive("超时时间必须是正整数").optional()
  ),
  longRunning: z.boolean().optional(),
  autoConnect: z.boolean().optional(),

  // 信任和安全
  isTrusted: z.boolean().optional(),
  trustedAt: z.number().optional(),
}).superRefine((data, ctx) => {
  // STDIO 类型必须提供 command
  if (data.transport === "stdio" && !data.command) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "STDIO 类型必须提供 command 字段",
      path: ["command"],
    });
  }

  // HTTP 类型必须提供 url
  if (data.transport === "streamable-http" && !data.url) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "HTTP 类型必须提供 url 字段",
      path: ["url"],
    });
  }
});

/**
 * MCP Source Schema
 */
export const MCPSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["builtin", "custom"]),
  servers: z.array(MCPServerConfigSchema),
});

/**
 * Registry 配置
 */
export interface RegistryConfig {
  name: string;
  url: string;
  type: "npm" | "pip";
}

/**
 * NPM Registry 预设
 */
export const NPM_REGISTRIES: RegistryConfig[] = [
  { name: "淘宝 NPM 镜像", url: "https://registry.npmmirror.com", type: "npm" },
  { name: "华为云 NPM 镜像", url: "https://repo.huaweicloud.com/repository/npm", type: "npm" },
  { name: "腾讯云 NPM 镜像", url: "https://mirrors.cloud.tencent.com/npm", type: "npm" },
];

/**
 * Pip Registry 预设
 */
export const PIP_REGISTRIES: RegistryConfig[] = [
  { name: "清华大学 PyPI 镜像", url: "https://pypi.tuna.tsinghua.edu.cn/simple", type: "pip" },
  { name: "阿里云 PyPI 镜像", url: "https://mirrors.aliyun.com/pypi/simple", type: "pip" },
  { name: "华为云 PyPI 镜像", url: "https://repo.huaweicloud.com/repository/pypi/simple", type: "pip" },
];

/**
 * 验证 MCP 服务器配置
 */
export function validateMCPServerConfig(config: unknown) {
  return MCPServerConfigSchema.parse(config);
}

/**
 * 安全验证 MCP 服务器配置（不抛出异常）
 */
export function safeValidateMCPServerConfig(config: unknown) {
  return MCPServerConfigSchema.safeParse(config);
}

/**
 * 从 Zod Schema 推断类型
 */
export type MCPServerConfigValidated = z.infer<typeof MCPServerConfigSchema>;
export type MCPSourceValidated = z.infer<typeof MCPSourceSchema>;
