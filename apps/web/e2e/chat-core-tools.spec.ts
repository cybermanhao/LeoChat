import { test, expect, type Page } from "@playwright/test";
import { enableBash, resetStateBypassOnboarding } from "./helpers";

/** 工具调用 + bash 审批（GUI 迁移第二步）。需要真实模型和内置 leochat MCP 服务，默认跳过 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a live model; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(180_000);

const input = (page: Page) => page.locator("textarea").first();
const stopButton = (page: Page) => page.getByRole("button", { name: "Stop generating" });

/**
 * 等一个回合跑完：先等"停止"按钮出现（回合已开始），再等它消失。
 * 只等"消失"会在回合还没开始时立刻通过（联网默认开启后回合变慢，更容易撞上）
 */
async function waitForRun(page: Page) {
  await expect(stopButton(page)).toBeVisible({ timeout: 30_000 });
  await expect(stopButton(page)).toHaveCount(0, { timeout: 120_000 });
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
  await page.getByRole("button", { name: "拒绝", exact: true }).click(); // 思考行里也可能出现"拒绝"
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
  await waitForRun(page);
  await expect(page.locator("html")).toHaveClass(/dark/, { timeout: 10_000 });
  const stored = await page.evaluate(() => localStorage.getItem("ai-chatbox-theme"));
  expect(stored).toContain("dark-green");
});

test("full access (permission preset) runs bash without an approval banner", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await enableBash(page);
  page.on("dialog", (d) => void d.accept()); // 开启完全信任时的确认框
  await page.getByRole("button", { name: "询问" }).click();
  await expect(page.getByRole("button", { name: "完全信任" })).toHaveAttribute("aria-pressed", "true");

  await input(page).fill("请用 bash 工具执行命令 `echo leochat-full-access`，然后把输出原样告诉我。");
  await input(page).press("Enter");
  await waitForRun(page);
  await expect(page.getByText("AI 请求执行")).toHaveCount(0);
  await expect(page.locator("[data-message-id]").last()).toContainText("leochat-full-access");
});
