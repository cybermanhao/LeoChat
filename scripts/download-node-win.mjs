#!/usr/bin/env node
// Downloads the standalone node.exe for Windows packaging.
// Usage: node scripts/download-node-win.mjs [--force]
// Set NODE_MIRROR env var to use an alternative mirror (e.g. https://npmmirror.com/mirrors/node).

import { createWriteStream, existsSync, mkdirSync } from "fs";
import { get } from "https";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DEST = join(ROOT, "build-resources", "node.exe");
const NODE_VERSION = "v22.15.0";
const MIRROR = process.env.NODE_MIRROR ?? "https://nodejs.org/dist";
const URL = `${MIRROR}/${NODE_VERSION}/win-x64/node.exe`;

const force = process.argv.includes("--force");

if (!force && existsSync(DEST)) {
  console.log(`node.exe already present at build-resources/node.exe — skipping. Pass --force to re-download.`);
  process.exit(0);
}

mkdirSync(join(ROOT, "build-resources"), { recursive: true });

console.log(`Downloading Node.js ${NODE_VERSION} node.exe for Windows packaging...`);
console.log(`  From: ${URL}`);
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

try {
  await download(URL, DEST);
  console.log(`\nDone.`);
} catch (err) {
  console.error(`\nFailed to download node.exe: ${err.message}`);
  console.error(`Try setting NODE_MIRROR to a closer mirror, e.g.:`);
  console.error(`  NODE_MIRROR=https://npmmirror.com/mirrors/node node scripts/download-node-win.mjs`);
  process.exit(1);
}
