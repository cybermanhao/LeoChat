import { test, expect, type Page } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/** 工具调用 + bash 审批（GUI 迁移第二步）。需要真实模型和内置 leochat MCP 服务，默认跳过 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a live model; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(180_000);

const input = (page: Page) => page.locator("textarea").first();
const stopButton = (page: Page) => page.getByRole("button", { name: "Stop generating" });

/** 打开 bash（默认禁用）并让内置 leochat 服务自动连接，等到 server 上真有 bash 工具 */
async function enableBash(page: Page) {
  await page.evaluate(() =>
    localStorage.setItem(
      "leochat-mcp-storage",
      JSON.stringify({ state: { autoConnectServerIds: ["leochat"], disabledToolIds: [] }, version: 0 }),
    ),
  );
  await page.reload();
  await page.waitForFunction(
    async () => {
      const r = await fetch("/api/mcp/tools").then((x) => x.json()).catch(() => null);
      const tools = (r?.tools ?? r ?? []) as Array<{ name?: string }>;
      return Array.isArray(tools) && tools.some((t) => t.name === "bash");
    },
    undefined,
    { timeout: 60_000, polling: 1000 },
  );
  // server 上可能还留着上一次的连接；以这个页面自己连上为准（工具白名单来自页面的 MCP 状态）
  await expect(page.getByRole("button", { name: /^MCP [1-9]/ })).toBeVisible({ timeout: 60_000 });
}

test("bash asks for approval, runs after Allow, and the result is rendered", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await enableBash(page);

  await input(page).fill("请用 bash 工具执行命令 `echo leochat-e2e-ok`，然后把输出原样告诉我。");
  await input(page).press("Enter");

  const banner = page.getByText("AI 请求执行");
  await expect(banner).toBeVisible({ timeout: 90_000 });
  await expect(page.locator("pre", { hasText: "echo leochat-e2e-ok" })).toBeVisible();
  await page.getByRole("button", { name: "允许", exact: true }).click();
  await expect(banner).toHaveCount(0, { timeout: 30_000 });

  await expect(stopButton(page)).toHaveCount(0, { timeout: 120_000 });
  const last = page.locator("[data-message-id]").last();
  await expect(last).toContainText("leochat-e2e-ok");
});

test("Reject is reported back to the model and the run still finishes", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await enableBash(page);

  await input(page).fill("请用 bash 工具执行命令 `echo should-not-run`。如果被拒绝，就回复：已取消。");
  await input(page).press("Enter");
  await expect(page.getByText("AI 请求执行")).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "拒绝" }).click();
  await expect(stopButton(page)).toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator("[data-message-id]").last()).toContainText("已取消");
});
