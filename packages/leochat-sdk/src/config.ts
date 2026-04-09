import { readFileSync } from "fs";
import { resolve } from "path";
import type { SdkConfig } from "./types";

/**
 * 展开字符串中的环境变量占位符 ${VAR_NAME}
 */
function expandEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => {
    const val = process.env[name];
    if (val === undefined) {
      console.warn(`[leochat-sdk] env var ${name} is not set`);
    }
    return val ?? "";
  });
}

/**
 * 递归展开对象中所有字符串值的环境变量
 */
function expandEnvVarsDeep(obj: unknown): unknown {
  if (typeof obj === "string") return expandEnvVars(obj);
  if (Array.isArray(obj)) return obj.map(expandEnvVarsDeep);
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      result[k] = expandEnvVarsDeep(v);
    }
    return result;
  }
  return obj;
}

/**
 * 从 JSON 文件加载 SDK 配置。
 * 兼容 Claude Desktop / OpenMCP 格式（mcpServers + defaultLLM）。
 * 支持 ${ENV_VAR} 占位符自动展开。
 */
export function loadConfig(configPath: string): SdkConfig {
  const absolutePath = resolve(configPath);
  let raw: string;
  try {
    raw = readFileSync(absolutePath, "utf-8");
  } catch (e) {
    throw new Error(`[leochat-sdk] Cannot read config file: ${absolutePath}\n${e}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`[leochat-sdk] Invalid JSON in config file: ${absolutePath}\n${e}`);
  }

  return expandEnvVarsDeep(parsed) as SdkConfig;
}
