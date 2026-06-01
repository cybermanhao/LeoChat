#!/usr/bin/env node
// Bundles law-kb-mcp into a single self-contained ESM file for packaging.
// onnxruntime-node and sharp are native addons that can't be bundled.
// We stub them inline so the ESM static import doesn't crash at load time;
// @xenova/transformers detects the stub and falls back to WASM automatically.
import { build } from "esbuild";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

// Plugin: replace native addons with stubs bundled inline.
// Without this, esbuild emits static ESM `import` statements for externals,
// and Node.js throws ERR_MODULE_NOT_FOUND before @xenova/transformers can catch it.
const nativeStubPlugin = {
  name: "native-stub",
  setup(build) {
    for (const pkg of ["onnxruntime-node", "sharp"]) {
      build.onResolve({ filter: new RegExp(`^${pkg}$`) }, () => ({
        path: pkg,
        namespace: "native-stub",
      }));
    }
    build.onLoad({ filter: /.*/, namespace: "native-stub" }, (args) => ({
      // Throw so @xenova/transformers' try/catch triggers WASM fallback
      contents: `throw new Error("${args.path} not available in packaged app — using WASM fallback");`,
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
  plugins: [nativeStubPlugin],
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
  ],
  minify: false,
});

console.log("Bundle written to dist/bundle.mjs");
