import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  // This package is only ever spawned as a subprocess (its file path is
  // resolved and passed to child_process, see apps/electron/src/main) --
  // nothing imports it as a library, so its .d.ts output is unused and not
  // worth the extra build surface.
  dts: false,
  clean: true,
  // Bundle all dependencies so the output is a self-contained single file.
  // Required for use as an extraResource in the packaged Electron app where
  // workspace packages (@ai-chatbox/*) and npm deps are not on the Node path.
  noExternal: [/.*/],
  banner: {
    js: "#!/usr/bin/env node",
  },
});
