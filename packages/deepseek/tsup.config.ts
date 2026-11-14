import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // 构建声明文件时不用 paths，让 @leochat/core 按包解析（保持为外部依赖，不内联）
  dts: { compilerOptions: { types: [], paths: {} } },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  platform: "neutral",
  external: ["zod", "@leochat/core"],
});
