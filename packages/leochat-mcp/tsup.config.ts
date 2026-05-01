import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  // Bundle all dependencies so the output is a self-contained single file.
  // Required for use as an extraResource in the packaged Electron app where
  // workspace packages (@ai-chatbox/*) and npm deps are not on the Node path.
  noExternal: [/.*/],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
