#!/usr/bin/env node
/**
 * 发布 @leochat/core、@leochat/deepseek、@leochat/mcp-kit 到 git tag（设计文档 §13 Spike 1 的结论）。
 *
 * 做法：
 *   1. 检查包之间只用 peerDependencies 引用（dependencies 里出现 workspace:* 会让 git 依赖装不上）
 *   2. 类型检查、测试、构建三个包
 *   3. 在单独的 sdk-release 分支上提交"package.json + dist + README"（master 上不提交 dist），打 tag sdk-vX.Y.Z
 *   4. 默认**不推送**。加 --push 才会推送分支和 tag 到 origin
 *
 * 使用方：
 *   "@leochat/core": "github:cybermanhao/LeoChat#sdk-v0.1.0&path:packages/core"
 *
 * 用法：node scripts/release-sdk.mjs <version> [--push] [--skip-tests] [--force]
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const PACKAGES = ["core", "deepseek", "mcp-kit"];
const BRANCH = "sdk-release";
const root = resolve(import.meta.dirname, "..");

const args = process.argv.slice(2);
const version = args.find((a) => !a.startsWith("--"));
const push = args.includes("--push");
const skipTests = args.includes("--skip-tests");
const force = args.includes("--force");

function fail(msg) {
  console.error(`release-sdk: ${msg}`);
  process.exit(1);
}
function sh(cmd, argv, opts = {}) {
  return execFileSync(cmd, argv, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], shell: process.platform === "win32" && cmd === "pnpm", ...opts }).trim();
}
function git(argv, cwd = root) {
  return sh("git", argv, { cwd });
}

if (!version || !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(version)) fail("usage: node scripts/release-sdk.mjs <semver> [--push] [--skip-tests] [--force]");
const tag = `sdk-v${version}`;

// ── 1. 检查 ──────────────────────────────────────────────────────────────
const dirty = git(["status", "--porcelain", "--", ...PACKAGES.map((p) => `packages/${p}`)]);
if (dirty) fail(`uncommitted changes in SDK packages:\n${dirty}`);
const tagExists = git(["tag", "--list", tag]) === tag;
if (tagExists && !force) fail(`tag ${tag} already exists (use --force to move it)`);

for (const p of PACKAGES) {
  const pkg = JSON.parse(readFileSync(join(root, "packages", p, "package.json"), "utf8"));
  for (const field of ["dependencies", "peerDependencies"]) {
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      if (String(range).startsWith("workspace:")) fail(`${pkg.name} ${field}.${name} = ${range}: use a peer range, not workspace:`);
    }
  }
}

// ── 2. 类型检查、测试、构建 ──────────────────────────────────────────────
for (const p of PACKAGES) {
  const filter = ["--filter", `@leochat/${p}`];
  console.log(`· ${p}: typecheck`);
  sh("pnpm", [...filter, "run", "typecheck"]);
  if (!skipTests) {
    console.log(`· ${p}: test`);
    sh("pnpm", [...filter, "run", "test"]);
  }
  console.log(`· ${p}: build`);
  sh("pnpm", [...filter, "run", "build"]);
}

// ── 3. 在 sdk-release 分支上提交构建产物并打 tag ─────────────────────────
const sourceCommit = git(["rev-parse", "--short", "HEAD"]);
const work = mkdtempSync(join(tmpdir(), "leochat-sdk-release-"));
try {
  const branchExists = git(["branch", "--list", BRANCH]).length > 0;
  if (branchExists) {
    git(["worktree", "add", work, BRANCH]);
  } else {
    git(["worktree", "add", "--detach", work]);
    git(["checkout", "--orphan", BRANCH], work);
    git(["rm", "-rf", "--quiet", "."], work);
  }
  // 每次发布都完整替换包目录
  rmSync(join(work, "packages"), { recursive: true, force: true });
  for (const p of PACKAGES) {
    const src = join(root, "packages", p);
    const dst = join(work, "packages", p);
    mkdirSync(dst, { recursive: true });
    const pkg = JSON.parse(readFileSync(join(src, "package.json"), "utf8"));
    pkg.version = version;
    delete pkg.devDependencies; // 使用方不安装 devDependencies；去掉也避免 workspace: 协议出现在发布产物里
    delete pkg.scripts; // 尤其不能带 prepare：pnpm 会在安装时构建（慢，而且会因 workspace: 失败）
    pkg.leochat = { sourceCommit, tag };
    if (pkg.peerDependencies?.["@leochat/core"]) pkg.peerDependencies["@leochat/core"] = `^${version}`;
    writeFileSync(join(dst, "package.json"), JSON.stringify(pkg, null, 2) + "\n");
    cpSync(join(src, "dist"), join(dst, "dist"), { recursive: true });
    for (const f of ["README.md", "LICENSE"]) if (existsSync(join(src, f))) cpSync(join(src, f), join(dst, f));
  }
  if (existsSync(join(root, "LICENSE"))) cpSync(join(root, "LICENSE"), join(work, "LICENSE"));
  writeFileSync(
    join(work, "README.md"),
    [
      "# LeoChat SDK release branch",
      "",
      "Built output of `@leochat/core`, `@leochat/deepseek` and `@leochat/mcp-kit`, published as git tags (`sdk-vX.Y.Z`).",
      "Do not commit here by hand: run `node scripts/release-sdk.mjs <version>` on master.",
      "",
      "```json",
      `"@leochat/core": "github:cybermanhao/LeoChat#${tag}&path:packages/core"`,
      "```",
      "",
    ].join("\n"),
  );
  git(["add", "-A"], work);
  git(["-c", "core.autocrlf=false", "commit", "--quiet", "--allow-empty", "-m", `sdk ${version} (from ${sourceCommit})`], work);
  git(["tag", ...(force ? ["-f"] : []), "-a", tag, "-m", `LeoChat SDK ${version} (from ${sourceCommit})`], work);
  const releaseCommit = git(["rev-parse", "--short", "HEAD"], work);
  console.log(`\n✓ ${tag} -> ${releaseCommit} on branch ${BRANCH} (source ${sourceCommit})`);
} finally {
  try {
    git(["worktree", "remove", "--force", work]);
  } catch {
    rmSync(work, { recursive: true, force: true });
  }
}

// ── 4. 推送（可选）───────────────────────────────────────────────────────
if (push) {
  git(["push", "origin", BRANCH]);
  git(["push", ...(force ? ["--force"] : []), "origin", tag]);
  console.log(`✓ pushed ${BRANCH} and ${tag} to origin`);
} else {
  console.log(`(not pushed) to publish: git push origin ${BRANCH} && git push origin ${tag}`);
}
console.log("\nInstall with:");
for (const p of PACKAGES) console.log(`  "@leochat/${p}": "github:cybermanhao/LeoChat#${tag}&path:packages/${p}"`);
