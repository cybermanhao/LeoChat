#!/usr/bin/env node
/**
 * Force-install the Electron-ABI prebuilt binary for better-sqlite3.
 *
 * Why this exists: electron-builder runs @electron/rebuild during packaging,
 * but in this pnpm workspace it silently no-ops — the packaged app then ships
 * a better_sqlite3.node compiled for the system Node ABI (e.g. 127) instead of
 * Electron's (130), and every /api/kb/* endpoint fails with ERR_DLOPEN_FAILED.
 * (Found 2026-07-03; the KB UI showed 0 laws because of this.)
 *
 * Run before electron-builder (wired into apps/electron predist).
 */
import { execSync } from "child_process";
import { createRequire } from "module";
import { existsSync, statSync } from "fs";
import { join, dirname } from "path";

const ROOT = join(import.meta.dirname, "..");
const require = createRequire(join(ROOT, "apps/electron/package.json"));

// Resolve the real (pnpm store) location of better-sqlite3 and Electron version
const bsqlDir = dirname(require.resolve("better-sqlite3/package.json"));
const electronPkg = require("electron/package.json");
const electronVersion = electronPkg.version;

const binary = join(bsqlDir, "build/Release/better_sqlite3.node");
console.log(`better-sqlite3 dir: ${bsqlDir}`);
console.log(`electron version:   ${electronVersion}`);

const before = existsSync(binary) ? statSync(binary).size : 0;

execSync(
  `npx prebuild-install --runtime=electron --target=${electronVersion} --arch=x64 --force`,
  { cwd: bsqlDir, stdio: "inherit" }
);

if (!existsSync(binary)) {
  console.error("✗ better_sqlite3.node missing after prebuild-install");
  process.exit(1);
}
const after = statSync(binary).size;
console.log(`✓ Electron-ABI binary installed (${before} → ${after} bytes)`);
