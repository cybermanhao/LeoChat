---
name: release
description: Publish a new LeoChat release (standard or law edition) and sync it to the leo-releases download site
user-invocable: true
---

# 发布 LeoChat Release

发布新版本并同步到下载站 `dl.leoimmortal.com`。有两条独立发布线：**标准版** 和 **法律版**。

> 打包在 GitHub Actions 的 `windows-latest` 上完成，**本地不需要 `pnpm build:electron`**。
> 你只负责改版本号、推 tag、然后更新 leo-releases。

---

## 关键事实

| 事项 | 值 |
|---|---|
| 版本号的唯一位置 | `apps/electron/package.json` 的 `version`（root / `apps/web` 保持 `0.0.1`，不用动）|
| 标准版分支 / tag | `master` / `v<x.y.z>`（如 `v0.2.4`）→ 触发 `.github/workflows/release.yml` |
| 法律版分支 / tag | `leochat-for-law` / `leochat-law-v<x.y.z>`（如 `leochat-law-v0.2.6`）→ 触发 `release-law.yml` |
| 法律版版本号后缀 | `apps/electron/package.json` 用 `0.2.6-law`；tag 里不带 `-law` 后面那段（`leochat-law-v0.2.6`）|
| CI 产物 | GitHub Release + 附件 `LeoChat-<version>-win.zip`（法律版是 `LeoChat-<version>-law-win.zip`）|
| 下载站仓库 | `cybermanhao/leo-releases`（私有），本地 clone：`C:\code\leo-releases` |
| 下载站元数据 | `leo-releases/resources.json`，条目 id：`leochat` / `leochat-law` |
| R2 key | `releases/leochat.zip` / `releases/leochat-law.zip`（bucket `leo-releases`）|
| R2 凭据 | `C:\code\leo-releases\.env`（`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_ENDPOINT` / `R2_BUCKET`）|
| 法律版下载密码 | `resources.json` 里 `leochat-law` 带 `passwordHash`，**更新版本时保留不动** |

`release-law.yml` 里 checkout 固定 `ref: leochat-for-law`，所以法律版必须先把改动合进 `leochat-for-law` 再打 tag。

---

## 标准版发布流程

1. **确认要发的提交都在 master**，确定新版本号 `X.Y.Z`（看 `git tag -l 'v*'` 取下一个）。
2. **改版本号**（从 default 分支操作要先开分支）：
   ```bash
   git checkout -b release/vX.Y.Z
   # 编辑 apps/electron/package.json: "version": "X.Y.Z"
   git commit -am "chore: bump version to X.Y.Z"
   git push -u origin release/vX.Y.Z
   git checkout master && git merge --ff-only release/vX.Y.Z && git push origin master
   git branch -d release/vX.Y.Z && git push origin --delete release/vX.Y.Z
   ```
3. **打 tag 触发 CI**：
   ```bash
   git tag -a vX.Y.Z -m "LeoChat vX.Y.Z"
   git push origin vX.Y.Z
   gh run watch $(gh run list --workflow=release.yml -L1 --json databaseId --jq '.[0].databaseId') --exit-status
   ```
4. **确认 Release**：`gh release view vX.Y.Z --json assets` 应有 `LeoChat-X.Y.Z-win.zip`。
5. 按下面 **同步到 leo-releases**（条目 `leochat`，key `releases/leochat.zip`）。

---

## 法律版发布流程

1. **把 master 合进法律分支**。用独立 worktree（已存在：`.claude/worktrees/law-release`），避免搅动主工作区：
   ```bash
   cd .claude/worktrees/law-release   # on leochat-for-law
   git merge master --no-edit
   ```
   固定冲突及解法：
   - `apps/electron/package.json` — 解成新版本号 `X.Y.Z-law`
   - `packages/leochat-mcp/tsup.config.ts` — 保留 **法律分支（HEAD）** 那段注释（two-zod-majors 导致 `dts: false` 的说明）
   - `pnpm-lock.yaml` — `git checkout --ours pnpm-lock.yaml` 后 `pnpm install --lockfile-only` 重新生成
2. **本地冒烟**（CI 跑一次要 8 分钟，先本地挡一道）：
   ```bash
   pnpm install --frozen-lockfile
   pnpm build:packages
   pnpm --filter @leochat/law-kb-mcp run build
   pnpm --filter @ai-chatbox/leochat-mcp run build
   pnpm --filter @ai-chatbox/server run build
   pnpm --filter @ai-chatbox/web typecheck
   ```
3. **提交合并 + 推分支**：
   ```bash
   git commit --no-edit    # 或补充说明冲突解法
   git push origin leochat-for-law
   ```
4. **打 tag 触发 CI**：
   ```bash
   git tag -a leochat-law-vX.Y.Z -m "LeoChat Law vX.Y.Z"
   git push origin leochat-law-vX.Y.Z
   gh run watch $(gh run list --workflow=release-law.yml -L1 --json databaseId --jq '.[0].databaseId') --exit-status
   ```
   （SignPath 签名步骤默认跳过；日志里 `git exit code 128` 的 annotation 是无害的。）
5. **确认 Release**：`gh release view leochat-law-vX.Y.Z --json assets` 应有 `LeoChat-X.Y.Z-law-win.zip`。
6. 按下面 **同步到 leo-releases**（条目 `leochat-law`，key `releases/leochat-law.zip`，`passwordHash` 保留）。

---

## 同步到 leo-releases

在 `C:\code\leo-releases`（不是本仓库）操作：

1. **下载 CI 产物**：
   ```bash
   cd /c/code/leo-releases
   gh release download <tag> -R cybermanhao/LeoChat --pattern "LeoChat-*-win.zip" --dir .tmp-release --clobber
   ```
2. **更新 `resources.json`** 对应条目：`version`、`date`（今天 `YYYY-MM-DD`）、`size`（`ls -la` 拿字节数 / 1048576，四舍五入到 `MB`）、需要时更新 `description`。**不要动** `id` / `r2Key` / `passwordHash`。
3. **上传 zip 到 R2**（脚本已在 commit `1a15e6f` 修好：Buffer 上传 + size/sha256 自校验，失败会非零退出）：
   ```bash
   node scripts/r2-upload.mjs .tmp-release/<zip 文件名> releases/<leochat|leochat-law>.zip
   ```
   > 别用 `wrangler r2 object put --remote`：单次 put 上限 300 MiB，法律版 zip 放不下。
4. **提交 + 推**：
   ```bash
   git add resources.json
   git commit -m "release: publish <标准版|法律版> vX.Y.Z"
   git push origin master
   ```
5. **构建 + 部署 CF Pages**：
   ```bash
   pnpm build   # 末行须是 Complete!
   node_modules/.bin/wrangler pages deploy dist --project-name leo-releases --branch master --commit-dirty=true
   ```
6. **验证**：
   ```bash
   curl -s https://leo-releases.pages.dev/r/<leochat|leochat-law> | grep -oE '0\.[0-9]+\.[0-9]+|[0-9]+MB'
   ```
   标准版可直接 `curl -sI https://leo-releases.pages.dev/api/download/leochat` 看 `Content-Length` 是否等于 release 附件字节数（法律版有密码，会返回 401，属正常）。

---

## 排查

- **CI 失败**：`gh run view <id> --log-failed`。法律版常见是 `law-kb-mcp` 要在 `server` 之前构建（workflow 已处理），或 HF 模型 / `laws.db` 下载。
- **下载站版本没变**：`resources.json` 没提交、或没重新 `wrangler pages deploy`。
- **下载的 zip 损坏 / 大小不对**：R2 对象被截断。用修好的 `r2-upload.mjs` 重传，它会自校验；旧版本脚本（stream Body）在大文件上会静默丢最后一片。
