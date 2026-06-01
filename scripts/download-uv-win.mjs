#!/usr/bin/env node
// Downloads uv.exe for Windows packaging so uvx-based MCP servers work without Python.
// Usage: node scripts/download-uv-win.mjs [--force]
// Set UV_MIRROR env var for an alternative base URL (default: GitHub releases).
import { createWriteStream, existsSync, mkdirSync, copyFileSync, rmSync } from "fs";
import { get } from "https";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { tmpdir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEST = join(ROOT, "build-resources", "uv.exe");
const UV_VERSION = "0.7.13";
const MIRROR = process.env.UV_MIRROR ?? "https://github.com/astral-sh/uv/releases/download";
const DOWNLOAD_URL = `${MIRROR}/${UV_VERSION}/uv-x86_64-pc-windows-msvc.zip`;

const force = process.argv.includes("--force");

if (!force && existsSync(DEST)) {
  console.log("uv.exe already present at build-resources/uv.exe — skipping. Pass --force to re-download.");
  process.exit(0);
}

mkdirSync(join(ROOT, "build-resources"), { recursive: true });

console.log(`Downloading uv ${UV_VERSION} for Windows packaging...`);
console.log(`  From: ${DOWNLOAD_URL}`);
console.log(`  To:   ${DEST}`);

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    function fetch(u) {
      get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          fetch(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} from ${u}`));
          return;
        }
        const total = parseInt(res.headers["content-length"] ?? "0");
        let received = 0;
        res.on("data", (chunk) => {
          received += chunk.length;
          if (total) {
            process.stdout.write(`\r  ${(received / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB`);
          }
        });
        res.pipe(file);
        file.on("finish", () => file.close(resolve));
      }).on("error", reject);
    }
    fetch(url);
  });
}

const tempZip = join(tmpdir(), `uv-${Date.now()}.zip`);
const tempDir = join(tmpdir(), `uv-extract-${Date.now()}`);

try {
  await download(DOWNLOAD_URL, tempZip);
  console.log("\nExtracting uv.exe...");

  mkdirSync(tempDir, { recursive: true });
  execSync(`powershell -Command "Expand-Archive -Path '${tempZip}' -DestinationPath '${tempDir}' -Force"`, { stdio: "inherit" });

  // Zip contains uv-x86_64-pc-windows-msvc/uv.exe
  const nested = join(tempDir, "uv-x86_64-pc-windows-msvc", "uv.exe");
  const flat = join(tempDir, "uv.exe");
  const src = existsSync(nested) ? nested : existsSync(flat) ? flat : null;
  if (!src) throw new Error("uv.exe not found in extracted zip");

  copyFileSync(src, DEST);
  console.log("Done.");
} catch (err) {
  console.error(`\nFailed: ${err.message}`);
  console.error("Try setting UV_MIRROR to a closer source, e.g.:");
  console.error("  UV_MIRROR=https://gitcode.com/CherryHQ/uv/releases/download node scripts/download-uv-win.mjs");
  process.exit(1);
} finally {
  try { rmSync(tempZip); } catch {}
  try { rmSync(tempDir, { recursive: true }); } catch {}
}
