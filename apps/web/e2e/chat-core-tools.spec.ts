import { test, expect, type Page } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/** 工具调用 + bash 审批（GUI 迁移第二步）。需要真实模型和内置 leochat MCP 服务，默认跳过 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a live model; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(180_000);

const input = (page: Page) => page.locator("textarea").first();
const stopButton = (page: Page) => page.getByRole("button", { name: "Stop generating" });

/**
 * 让内置 leochat 服务自动连接，再在 MCP → 工具 页面里打开 bash。
 * bash 每次加载页面都会被强制禁用，只能在当前会话里手动打开；所以全程不刷新页面，用应用内导航切回聊天
 */
async function enableBash(page: Page) {
  await page.evaluate(() =>
    localStorage.setItem("leochat-mcp-storage", JSON.stringify({ state: { autoConnectServerIds: ["leochat"] }, version: 0 })),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: /^MCP [1-9]/ })).toBeVisible({ timeout: 60_000 });
  // 界面上没有到 /mcp/tools 的入口，用应用内导航过去（不刷新页面）
  await page.evaluate(() => {
    history.pushState({}, "", "/mcp/tools");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  const row = page.locator("div", { has: page.getByText("bash", { exact: true }) }).filter({ has: page.getByRole("switch") }).last();
  const sw = row.getByRole("switch").first();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "聊天", exact: true }).click();
  await expect(input(page)).toBeVisible();
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

test("UI tools run in-process: the model switches the theme without any MCP server", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  // 不连接任何 MCP 服务：界面工具由 server 进程内提供
  await page.evaluate(() =>
    localStorage.setItem("leochat-mcp-storage", JSON.stringify({ state: { autoConnectServerIds: [] }, version: 0 })),
  );
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);

  await input(page).fill("请调用 update_theme 工具，把界面主题切换成深绿色（dark-green）。");
  await input(page).press("Enter");
  await expect(stopButton(page)).toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 10_000 });
  const stored = await page.evaluate(() => localStorage.getItem("ai-chatbox-theme"));
  expect(stored).toContain("dark-green");
});
