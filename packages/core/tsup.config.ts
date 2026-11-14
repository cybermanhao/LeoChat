import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/view/index.ts", "src/testing/index.ts"],
  format: ["esm"],
  dts: { compilerOptions: { types: [] } },
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  target: "es2022",
  platform: "neutral",
  external: ["zod"],
});
