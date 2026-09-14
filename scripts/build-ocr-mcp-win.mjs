#!/usr/bin/env node
/**
 * Builds a standalone ocr-mcp-server.exe (PaddleOCR MCP server) using PyInstaller.
 * Modeled directly on build-word-mcp-win.mjs — same venv/PyInstaller recipe.
 * Requires Python 3.8+ on the build machine (CI always has it).
 *
 * Uses --onedir (not --onefile): a --onefile build has to re-extract its
 * entire ~287MB archive to a temp dir on EVERY launch, which measured
 * ~54s on a warm cache — enough to blow past any reasonable MCP connect
 * timeout, worse under real-world disk/AV contention. --onedir extracts
 * once at build time; each launch just runs the already-unpacked files.
 *
 * Usage:
 *   node scripts/build-ocr-mcp-win.mjs [--force]
 *
 * Output: build-resources/ocr-mcp-server/ocr-mcp-server.exe (+ supporting files)
 *         build-resources/ocr-models/official_models/  (pre-downloaded OCR models,
 *         ~177MB — bundled so the packaged app works fully offline; otherwise
 *         they'd auto-download on first real OCR call)
 */
import { execSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "build-resources");
const OUT_APP_DIR = join(OUT_DIR, "ocr-mcp-server");
const OUT_EXE = join(OUT_APP_DIR, "ocr-mcp-server.exe");
const MODELS_CACHE_DIR = join(OUT_DIR, "ocr-models");
const FORCE = process.argv.includes("--force");

if (existsSync(OUT_EXE) && existsSync(MODELS_CACHE_DIR) && !FORCE) {
  console.log("✓ ocr-mcp-server/ + models already exist (use --force to rebuild)");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });

function findPython() {
  for (const cmd of ["python", "python3", "py"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cmd;
  }
  return null;
}

const python = findPython();
if (!python) {
  console.error("✗ Python not found. Install Python 3.8+ to build ocr-mcp-server.exe");
  process.exit(1);
}

const pyVer = execSync(`${python} --version`, { encoding: "utf8" }).trim();
console.log(`Using ${pyVer}`);

const VENV = join(ROOT, ".build-venv-ocr-mcp");

console.log("Creating build venv...");
execSync(`${python} -m venv "${VENV}"`, { stdio: "inherit" });

const pipExe = process.platform === "win32"
  ? join(VENV, "Scripts", "pip.exe")
  : join(VENV, "bin", "pip");

const mirrorArgs = process.env.PYPI_MIRROR
  ? ["-i", process.env.PYPI_MIRROR]
  : [];

console.log("Installing paddleocr-mcp[local-cpu] + PyInstaller...");
execSync(
  `"${pipExe}" install "paddleocr-mcp[local-cpu]" pyinstaller ${mirrorArgs.join(" ")}`,
  { stdio: "inherit" }
);

const launcherPath = join(ROOT, ".pyinstaller-spec", "ocr_mcp_launcher.py");
mkdirSync(join(ROOT, ".pyinstaller-spec"), { recursive: true });
writeFileSync(launcherPath,
  "from paddleocr_mcp.__main__ import main\nmain()\n"
);

const entryPoint = launcherPath;
console.log(`Entry point: ${entryPoint}`);
console.log("Running PyInstaller...");

const pyinstallerExe = process.platform === "win32"
  ? join(VENV, "Scripts", "pyinstaller.exe")
  : join(VENV, "bin", "pyinstaller");

// Heavy ML dependency tree — two distinct problems, both need explicit flags:
//
// 1. paddlex's own `require_extra()` dependency check (paddlex/utils/deps.py)
//    verifies its "ocr"/"ocr-core" extras are installed by probing
//    importlib.metadata — which in a frozen PyInstaller build only sees
//    packages whose dist-info was explicitly copied via --copy-metadata.
//    Miss one of paddlex's declared ocr-extra deps here and pipeline
//    creation fails at runtime with an opaque "A dependency error occurred
//    during pipeline creation" (the real DependencyError message is only
//    visible by running the exe with --verbose). The list below is
//    paddlex's `Requires-Dist: ...; extra == "ocr"` / "ocr-core" set,
//    found via `paddlex-*.dist-info/METADATA`.
// 2. paddlex/paddleocr/paddle ship non-.py package data (default pipeline
//    YAML configs, compiled extension submodules) PyInstaller's static
//    import scanner doesn't see — --collect-all pulls those in wholesale.
const metadataPkgs = [
  "fastmcp", "fastmcp-slim", "mcp", "paddleocr-mcp", "paddleocr", "paddlex",
  "paddlepaddle", "pydantic", "starlette",
  // paddlex[ocr]/[ocr-core] extras:
  "opencv-contrib-python", "numpy", "scipy", "scikit-learn", "shapely",
  "pyclipper", "openpyxl", "premailer", "imagesize", "pypdfium2",
  "python-bidi", "beautifulsoup4", "einops", "ftfy", "Jinja2",
  "latex2mathml", "lxml", "cssselect", "cssutils", "regex", "tokenizers",
  "huggingface-hub", "safetensors", "sentencepiece",
];
const metadataFlags = metadataPkgs.map(p => `--copy-metadata ${p}`).join(" ");

const collectAllPkgs = ["paddlex", "paddleocr", "paddleocr_mcp", "paddle"];
const collectFlags = collectAllPkgs.map(p => `--collect-all ${p}`).join(" ");

execSync(
  `"${pyinstallerExe}" --onedir --name ocr-mcp-server ${metadataFlags} ${collectFlags} --distpath "${OUT_DIR}" --workpath "${join(ROOT, ".pyinstaller-work-ocr")}" --specpath "${join(ROOT, ".pyinstaller-spec")}" "${entryPoint}"`,
  { stdio: "inherit", cwd: ROOT }
);

if (!existsSync(OUT_EXE)) {
  console.error("✗ PyInstaller finished but exe not found at expected path");
  process.exit(1);
}

// This build is fragile (see the --copy-metadata comment above) — a missing
// flag doesn't fail the PyInstaller build itself, it fails at runtime with
// an opaque dependency error. Smoke-test it here so CI catches that instead
// of silently shipping a server that 500s on first real tool call.
//
// This same run also pre-downloads the OCR models (PP-OCRv6 det/rec,
// UVDoc, orientation classifiers — ~177MB total): paddlex loads them at
// startup (not lazily on first real OCR call), and PADDLE_PDX_CACHE_HOME
// below redirects that download into build-resources/ocr-models instead of
// the default ~/.paddlex, so the exe genuinely works offline once packaged
// — main/index.ts points the running app's PADDLE_PDX_CACHE_HOME at the
// bundled copy of this same directory.
mkdirSync(MODELS_CACHE_DIR, { recursive: true });
console.log("Smoke-testing the built exe + downloading OCR models into build-resources/ocr-models (closing stdin immediately, like a well-behaved MCP client would after a failed handshake)...");
const smoke = spawnSync(OUT_EXE, ["--verbose"], {
  input: "",
  encoding: "utf8",
  timeout: 300000, // model download on a cold cache can take a few minutes
  env: { ...process.env, PADDLE_PDX_CACHE_HOME: MODELS_CACHE_DIR },
});
if (smoke.status !== 0) {
  console.error("✗ Smoke test failed — exe exited non-zero or crashed on startup:");
  console.error(smoke.stdout);
  console.error(smoke.stderr);
  process.exit(1);
}
console.log("✓ Smoke test passed (clean startup + clean exit on stdin close)");

console.log(`✓ ocr-mcp-server built at build-resources/ocr-mcp-server/`);
console.log(`✓ OCR models cached at build-resources/ocr-models`);
