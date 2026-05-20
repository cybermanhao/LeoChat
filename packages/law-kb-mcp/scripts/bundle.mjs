#!/usr/bin/env node
// Bundles law-kb-mcp into a single self-contained ESM file for packaging.
// node: built-ins stay external; onnxruntime-node/sharp (native addons pulled in
// by @xenova/transformers) are also external — the library falls back to WASM
// automatically when they're absent at runtime.
import { build } from "esbuild";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

await build({
  entryPoints: [join(root, "dist/index.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: join(root, "dist/bundle.mjs"),
  external: [
    "node:*",           // Node.js built-ins (node:sqlite, node:fs, ...)
    "onnxruntime-node", // Native ONNX addon — @xenova/transformers falls back to WASM
    "sharp",            // Native image addon — not needed for text-only embeddings
  ],
  minify: false,
});

console.log("Bundle written to dist/bundle.mjs");
