import { test, expect, type Page } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/**
 * /loop（harness 第二期：定时提醒）端到端。需要真实模型和运行中的 server，默认跳过：
 *   LEOCHAT_E2E_LIVE=1 npx playwright test e2e/loop.spec.ts
 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a live model; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(200_000);

const input = (page: Page) => page.locator("textarea").first();
const scheduleBar = (page: Page) => page.getByTestId("schedule-bar");
const stopButton = (page: Page) => page.getByRole("button", { name: "Stop generating" });

test("/loop creates a reminder shown in the bar, and it can be deleted", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await input(page).fill("/loop 30m 看一眼邮箱有没有新邮件");
  await input(page).press("Enter");
  await expect(scheduleBar(page)).toContainText("每 30 分钟", { timeout: 15_000 });
  await expect(scheduleBar(page)).toContainText("看一眼邮箱");
  await expect(input(page)).toHaveValue("");

  // 刷新后仍在
  await page.reload();
  await expect(scheduleBar(page)).toContainText("每 30 分钟", { timeout: 15_000 });
  await scheduleBar(page).getByRole("button", { name: /删除提醒/ }).click();
  await expect(scheduleBar(page)).toHaveCount(0);

  // 格式不对给出提示，不发送
  await input(page).fill("/loop 每天早上 喝水");
  await input(page).press("Enter");
  await expect(page.getByText(/用法：\/loop/).first()).toBeVisible(); // toast 的文字也在无障碍播报里出现一次
});

test("the model sets a reminder from natural language; when due it arrives live in the open conversation", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await input(page).fill("请用 schedule_create 设一个 60 秒后的一次性提醒，提醒内容是：回复我一句『该喝水了』。设好后简短确认。");
  await input(page).press("Enter");
  await expect(scheduleBar(page)).toBeVisible({ timeout: 60_000 }); // 模型的工具调用结束后刷新出提醒
  await expect(stopButton(page)).toHaveCount(0, { timeout: 60_000 });

  // 不做任何操作，等提醒到期：server 自己开一次运行，watch 推到当前页面
  await expect(page.locator("[data-reminder]")).toBeVisible({ timeout: 100_000 });
  await expect(stopButton(page)).toHaveCount(0, { timeout: 60_000 });
  await expect(page.locator("[data-message-id]").last()).toContainText("喝水");
  await expect(scheduleBar(page)).toHaveCount(0); // 一次性提醒已结束
});
