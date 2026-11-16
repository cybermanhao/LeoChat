import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const pkg = (p: string) => fileURLToPath(new URL(`../${p}`, import.meta.url));

export default defineConfig({
  resolve: {
    // 测试直接用源码，避免依赖过期的 dist
    alias: [
      { find: /^@leochat\/core\/testing$/, replacement: pkg("core/src/testing/index.ts") },
      { find: /^@leochat\/core$/, replacement: pkg("core/src/index.ts") },
      { find: /^@leochat\/mcp-kit$/, replacement: pkg("mcp-kit/src/index.ts") },
    ],
  },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
