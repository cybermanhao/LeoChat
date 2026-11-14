import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const core = (p: string) => fileURLToPath(new URL(`../core/src/${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    // 测试直接用 core 的源码，避免依赖过期的 dist
    alias: [
      { find: /^@leochat\/core\/testing$/, replacement: core("testing/index.ts") },
      { find: /^@leochat\/core$/, replacement: core("index.ts") },
    ],
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
