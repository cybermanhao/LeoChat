#!/usr/bin/env node
/**
 * Builds a standalone word-mcp-server.exe using PyInstaller.
 * Requires Python 3.8+ on the build machine (CI always has it).
 *
 * Usage:
 *   node scripts/build-word-mcp-win.mjs [--force]
 *
 * Output: build-resources/word-mcp-server.exe
 */
import { execSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT_DIR = join(ROOT, "build-resources");
const OUT_EXE = join(OUT_DIR, "word-mcp-server.exe");
const FORCE = process.argv.includes("--force");

if (existsSync(OUT_EXE) && !FORCE) {
  console.log("✓ word-mcp-server.exe already exists (use --force to rebuild)");
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });

// Find python
function findPython() {
  for (const cmd of ["python", "python3", "py"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    if (r.status === 0) return cmd;
  }
  return null;
}

const python = findPython();
if (!python) {
  console.error("✗ Python not found. Install Python 3.8+ to build word-mcp-server.exe");
  process.exit(1);
}

const pyVer = execSync(`${python} --version`, { encoding: "utf8" }).trim();
console.log(`Using ${pyVer}`);

// Build in a temp venv to avoid polluting system Python
const VENV = join(ROOT, ".build-venv-word-mcp");

console.log("Creating build venv...");
execSync(`${python} -m venv "${VENV}"`, { stdio: "inherit" });

const pipExe = process.platform === "win32"
  ? join(VENV, "Scripts", "pip.exe")
  : join(VENV, "bin", "pip");

const pyExe = process.platform === "win32"
  ? join(VENV, "Scripts", "python.exe")
  : join(VENV, "bin", "python");

// Mirror support
const mirrorArgs = process.env.PYPI_MIRROR
  ? ["-i", process.env.PYPI_MIRROR]
  : [];

console.log("Installing office-word-mcp-server + PyInstaller...");
execSync(
  `"${pipExe}" install office-word-mcp-server pyinstaller ${mirrorArgs.join(" ")}`,
  { stdio: "inherit" }
);

// Create a launcher script that calls the module's main function.
// PyInstaller needs a .py file, not the compiled Windows exe shim.
const launcherPath = join(ROOT, ".pyinstaller-spec", "word_mcp_launcher.py");
mkdirSync(join(ROOT, ".pyinstaller-spec"), { recursive: true });
writeFileSync(launcherPath,
  "from word_document_server.main import main\nmain()\n"
);

const entryPoint = launcherPath;
console.log(`Entry point: ${entryPoint}`);
console.log("Running PyInstaller...");

const pyinstallerExe = process.platform === "win32"
  ? join(VENV, "Scripts", "pyinstaller.exe")
  : join(VENV, "bin", "pyinstaller");

// Copy metadata for packages that use importlib.metadata.version() at runtime
const metadataPkgs = [
  "fastmcp", "fastmcp-slim", "mcp", "office-word-mcp-server",
  "pydantic", "starlette",
];
const metadataFlags = metadataPkgs.map(p => `--copy-metadata ${p}`).join(" ");

// Build spec: single-file exe, named word-mcp-server
execSync(
  `"${pyinstallerExe}" --onefile --name word-mcp-server ${metadataFlags} --distpath "${OUT_DIR}" --workpath "${join(ROOT, ".pyinstaller-work")}" --specpath "${join(ROOT, ".pyinstaller-spec")}" "${entryPoint}"`,
  { stdio: "inherit", cwd: ROOT }
);

if (!existsSync(OUT_EXE)) {
  console.error("✗ PyInstaller finished but exe not found at expected path");
  process.exit(1);
}

console.log(`✓ word-mcp-server.exe built at build-resources/word-mcp-server.exe`);
