import { test, expect, type Page } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/**
 * 窄窗口的侧边栏（按 dsh 的 ui-layout）：窄于 1024px 自动收成窄条；仍可手动展开；打开右栏会把它收回去。
 * 需要运行中的 server：LEOCHAT_E2E_LIVE=1 npx playwright test e2e/layout.spec.ts
 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a running server; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(120_000);

const sidebarWidth = (page: Page) => page.getByTestId("app-sidebar").evaluate((el) => el.getBoundingClientRect().width);

test("below 1024px the sidebar collapses to a rail, can be expanded, and opening the dock collapses it again", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 760 });
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await expect.poll(() => sidebarWidth(page)).toBeLessThan(80);

  // 有内容的会话（/loop，不需要等模型），这样才有右栏
  await page.locator("textarea").first().fill("/loop 30m 布局测试提醒");
  await page.locator("textarea").first().press("Enter");
  await expect(page.getByTestId("schedule-bar")).toBeVisible({ timeout: 15_000 });

  await page.getByTestId("app-sidebar").getByRole("button", { name: "展开侧边栏" }).first().click();
  await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(200);

  await page.getByTestId("dock-toggle").click();
  await expect(page.getByTestId("right-dock")).toBeVisible();
  await expect.poll(() => sidebarWidth(page)).toBeLessThan(80);

  // 900px 时右栏也是让出位置（dsh 的 push），对话区至少 400px
  const dockBox = await page.getByTestId("right-dock").boundingBox();
  expect(dockBox!.width).toBeGreaterThanOrEqual(300);
  expect(dockBox!.x).toBeGreaterThanOrEqual(56 + 400 - 2);

  // 回到宽屏：恢复用户自己的设置（默认展开）
  await page.getByTestId("right-dock").getByRole("button", { name: "收起右栏" }).click();
  await page.setViewportSize({ width: 1400, height: 760 });
  await expect.poll(() => sidebarWidth(page)).toBeGreaterThan(200);

  // 清理：删掉提醒（连同会话）
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("conversation-menu").click();
  await page.getByRole("menuitem", { name: "删除这个对话" }).click();
  await expect(page.getByTestId("conversation-header")).toHaveCount(0, { timeout: 15_000 });
});
