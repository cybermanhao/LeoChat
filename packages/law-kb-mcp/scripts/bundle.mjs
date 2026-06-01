#!/usr/bin/env node
// Bundles law-kb-mcp into a single self-contained ESM file for packaging.
// onnxruntime-node is kept external — the packaged app ships it under
// resources/node_modules/onnxruntime-node/ so Node.js directory traversal
// finds it from resources/mcp-servers/ (one level up).
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
  // Inject CJS globals so @xenova/transformers' require("fs") / __filename / __dirname work in ESM
  banner: {
    // Use aliased name to avoid collision with createRequire imported by db.ts
    js: [
      "import { createRequire as __bannerCR } from 'module';",
      "import { fileURLToPath as __fup } from 'url';",
      "import { dirname as __dn } from 'path';",
      "const require = __bannerCR(import.meta.url);",
      "const __filename = __fup(import.meta.url);",
      "const __dirname = __dn(__filename);",
    ].join(" "),
  },
  external: [
    "node:*",
    "fs", "path", "os", "url", "crypto", "http", "https", "stream", "buffer",
    "util", "events", "assert", "zlib", "net", "tls", "child_process",
    "onnxruntime-node", // shipped in resources/node_modules/onnxruntime-node/
    "sharp",            // not needed for text-only embeddings
  ],
  minify: false,
});

console.log("Bundle written to dist/bundle.mjs");
