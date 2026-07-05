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

// @xenova/transformers/src/utils/image.js has a top-level `import sharp from "sharp"`.
// ES module top-level imports can't be lazily deferred the way esbuild defers CJS
// requires, so marking "sharp" as `external` (the old approach) left a real import
// statement in the bundle that Node evaluates unconditionally at startup — crashing
// the packaged server immediately with ERR_MODULE_NOT_FOUND, even though law-kb-mcp
// never calls any image-processing code path (text-only embeddings).
// Stub it out at bundle time instead: the import resolves to an inert module, so
// nothing ships or loads at runtime, and startup no longer depends on sharp's
// presence in resources/.
const sharpStubPlugin = {
  name: "stub-sharp",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /^sharp$/ }, (args) => ({ path: args.path, namespace: "sharp-stub" }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "sharp-stub" }, () => ({
      // Must be truthy: @xenova/transformers/utils/image.js does
      // `else if (sharp) { ... } else { throw new Error('Unable to load image
      // processing library.') }` at module init — an undefined/falsy stub trips
      // that throw and silently disables vector search (caught by embedder.ts's
      // try/catch, which falls back to keyword-only search). This stub is never
      // actually invoked because law-kb-mcp only does text embeddings.
      contents: "export default function sharp() { throw new Error('sharp image processing not available in this build'); };",
      loader: "js",
    }));
  },
};

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
  plugins: [sharpStubPlugin],
  external: [
    "node:*",
    "fs", "path", "os", "url", "crypto", "http", "https", "stream", "buffer",
    "util", "events", "assert", "zlib", "net", "tls", "child_process",
    "onnxruntime-node", // shipped in resources/node_modules/onnxruntime-node/
  ],
  minify: false,
});

console.log("Bundle written to dist/bundle.mjs");
