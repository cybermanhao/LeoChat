import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // 构建声明文件时不用 paths，让 @leochat/* 按包解析（保持为外部依赖，不内联）
  dts: { compilerOptions: { paths: {} } },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "node20",
  platform: "node",
  external: ["zod", "@leochat/core", "@leochat/mcp-kit", "@modelcontextprotocol/client"],
});
