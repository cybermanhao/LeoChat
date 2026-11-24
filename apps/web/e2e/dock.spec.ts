import { test, expect, type Page } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/**
 * 右栏（重设计 P4）：默认收起，有任务时顶栏按钮亮起；按会话记住开关；工具调用可以在右栏看完整输入输出。
 * 需要真实模型和运行中的 server：LEOCHAT_E2E_LIVE=1 npx playwright test e2e/dock.spec.ts
 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a live model; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(180_000);

const input = (page: Page) => page.locator("textarea").first();
const dock = (page: Page) => page.getByTestId("right-dock");
const stopButton = (page: Page) => page.getByRole("button", { name: "Stop generating" });

test("the Tasks button lights up with a reminder, and the panel stays open across reloads", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await input(page).fill("/loop 30m 看一眼邮箱有没有新邮件");
  await input(page).press("Enter");
  await expect(page.getByTestId("schedule-bar")).toBeVisible({ timeout: 15_000 });

  // 默认收起；按钮显示数量
  await expect(dock(page)).toHaveCount(0);
  const toggle = page.getByTestId("dock-toggle");
  await expect(toggle).toHaveAccessibleName("任务 1");
  await toggle.click();
  await expect(dock(page)).toContainText("定时提醒");
  await expect(dock(page)).toContainText("看一眼邮箱");

  // 拖左边缘调宽（dsh：用户拖出来的宽度优先，拖动时没有过渡）。先等展开动画结束（右边缘贴到窗口右侧、位置不再变）
  const viewportWidth = page.viewportSize()!.width;
  await expect.poll(async () => { const b = (await dock(page).boundingBox())!; return Math.round(b.x + b.width); }).toBe(viewportWidth);
  await page.waitForTimeout(350);
  const before = (await dock(page).boundingBox())!;
  const handle = (await page.getByTestId("dock-resize").boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + 200);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2 + 120, handle.y + 200, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await dock(page).boundingBox())!.width).toBeLessThan(before.width - 100);

  // 按会话记住
  await page.reload();
  await expect(dock(page)).toContainText("看一眼邮箱", { timeout: 15_000 });
  await dock(page).getByRole("button", { name: "收起右栏" }).click();
  await expect(dock(page)).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("dock-toggle")).toBeVisible({ timeout: 15_000 });
  await expect(dock(page)).toHaveCount(0);

  // 清理：删掉提醒
  await page.getByTestId("schedule-bar").getByRole("button", { name: /删除提醒/ }).click();
  await expect(page.getByTestId("schedule-bar")).toHaveCount(0);
});

test("a tool call opens in the Tools tab from the process timeline", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await input(page).fill("请调用 show_notification 工具，message 参数写：右栏测试。然后回复：好了。");
  await input(page).press("Enter");
  await expect(stopButton(page)).toBeVisible({ timeout: 30_000 });
  await expect(stopButton(page)).toHaveCount(0, { timeout: 120_000 });

  await page.locator("[data-process] > button").last().click();
  await page.locator("[data-tool=show_notification] > button").last().click();
  await page.getByRole("button", { name: "在右栏查看" }).click();
  await expect(dock(page).getByRole("tab", { name: "工具" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("dock-tool-detail")).toContainText("show_notification");
  await expect(page.getByTestId("dock-tool-detail")).toContainText("右栏测试");
});
