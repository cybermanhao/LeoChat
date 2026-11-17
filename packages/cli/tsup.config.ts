import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  dts: { entry: "src/index.ts", compilerOptions: { paths: {} } },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "node20",
  platform: "node",
  external: ["zod", "@leochat/core", "@leochat/deepseek", "@leochat/mcp-kit", "@leochat/node"],
});
