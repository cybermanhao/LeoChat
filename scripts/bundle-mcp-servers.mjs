#!/usr/bin/env node
// Bundles official MCP npm server packages into self-contained ESM files.
// Run before electron-builder packaging (wired into predist via package.json).
import { build } from "esbuild";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, copyFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "build-resources", "mcp-bundles");

mkdirSync(OUT, { recursive: true });

// Some packages (e.g. jsdom inside mcp-npx-fetch) use dynamic require() which is
// not available in plain ESM. Inject a require shim via banner so they work.
const cjsShimBanner = `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);`;

const servers = [
  {
    name: "filesystem",
    entry: join(ROOT, "node_modules/@modelcontextprotocol/server-filesystem/dist/index.js"),
    out: join(OUT, "filesystem.js"),
  },
  {
    name: "everything",
    entry: join(ROOT, "node_modules/@modelcontextprotocol/server-everything/dist/index.js"),
    out: join(OUT, "everything.js"),
  },
  {
    name: "fetch",
    entry: join(ROOT, "node_modules/@tokenizin/mcp-npx-fetch/dist/index.js"),
    out: join(OUT, "fetch.js"),
    // jsdom uses dynamic require() — inject a shim so it resolves in ESM context
    banner: cjsShimBanner,
  },
];

for (const s of servers) {
  if (!existsSync(s.entry)) {
    console.warn(`⚠ skipping ${s.name}: entry not found at ${s.entry}`);
    continue;
  }
  process.stdout.write(`bundling ${s.name}...`);
  await build({
    entryPoints: [s.entry],
    bundle: true,
    platform: "node",
    format: "esm",
    outfile: s.out,
    external: ["node:*"],
    minify: false,
    banner: s.banner ? { js: s.banner } : undefined,
  });
  console.log(" done");
}

// jsdom (used by fetch server) references ./xhr-sync-worker.js by relative path
// at runtime. Copy it next to the fetch bundle so the require resolves correctly.
const xhrWorkerSrc = join(ROOT, "node_modules/.pnpm/jsdom@25.0.1/node_modules/jsdom/lib/jsdom/living/xhr/xhr-sync-worker.js");
const xhrWorkerDst = join(OUT, "xhr-sync-worker.js");
if (existsSync(xhrWorkerSrc)) {
  copyFileSync(xhrWorkerSrc, xhrWorkerDst);
  console.log("Copied xhr-sync-worker.js for jsdom");
} else {
  console.warn("⚠ xhr-sync-worker.js not found — fetch server may fail on XHR pages");
}

console.log(`All bundles written to build-resources/mcp-bundles/`);
