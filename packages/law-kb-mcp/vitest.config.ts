import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";

// Vite 5.4.x doesn't know that "sqlite" (the node: prefix stripped form) is a
// built-in Node 22 module, so loadAndTransform fails before any test even runs.
// Solution: intercept the import in a plugin and return a virtual module that uses
// createRequire at runtime. The actual require('node:sqlite') call happens inside
// the fork process (which has --experimental-sqlite in its execArgv), so it works.
const nodeSqlitePlugin: Plugin = {
  name: "virtual-node-sqlite",
  enforce: "pre",
  resolveId(id) {
    if (id === "node:sqlite" || id === "sqlite") {
      return "\0virtual:node-sqlite";
    }
  },
  load(id) {
    if (id === "\0virtual:node-sqlite") {
      return `
        import { createRequire } from 'node:module';
        const _req = createRequire(import.meta.url);
        const _m = _req('node:sqlite');
        export const DatabaseSync = _m.DatabaseSync;
      `;
    }
  },
};

export default defineConfig({
  plugins: [nodeSqlitePlugin],
  test: {
    pool: "forks",
    poolOptions: {
      forks: {
        execArgv: ["--experimental-sqlite"],
      },
    },
  },
});
