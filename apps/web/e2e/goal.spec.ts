import { test, expect, type Page } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/**
 * /goal（harness 第一期）端到端：真实模型一轮接一轮推进目标，目标条显示状态。
 * 需要真实模型和运行中的 server，默认跳过：LEOCHAT_E2E_LIVE=1 npx playwright test e2e/goal.spec.ts
 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a live model; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(240_000);

const input = (page: Page) => page.locator("textarea").first();
const goalBar = (page: Page) => page.getByTestId("goal-bar");

test("/goal runs rounds until the model marks it complete, and survives a reload", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);

  await input(page).fill("/goal 写一首四行的短诗，主题是秋天的银杏。写完检查确实是四行，然后把目标标记为完成。");
  await input(page).press("Enter");
  await expect(goalBar(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-goal-round='1']")).toBeVisible({ timeout: 30_000 });
  await expect(goalBar(page)).toContainText("已完成", { timeout: 180_000 });
  // 模型的回复在第 1 轮之后
  await expect(page.locator("[data-message-id]").last()).not.toHaveAttribute("data-goal-round", /\d/);

  await page.reload();
  await expect(goalBar(page)).toContainText("已完成", { timeout: 30_000 });
  await expect(goalBar(page)).toContainText("银杏");
  await expect(page.locator("[data-goal-round='1']")).toBeVisible();
});

test("pause stops the goal, continue resumes it", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);

  await input(page).fill("/goal 列出 1 到 300 之间所有的质数，用逗号分隔。全部列完并核对后，把目标标记为完成。");
  await input(page).press("Enter");
  await expect(goalBar(page).getByRole("button", { name: "暂停" })).toBeVisible({ timeout: 30_000 });
  await goalBar(page).getByRole("button", { name: "暂停" }).click();
  await expect(goalBar(page)).toContainText("已暂停", { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Stop generating" })).toHaveCount(0);

  await goalBar(page).getByRole("button", { name: "继续" }).click();
  await expect(goalBar(page)).toContainText(/进行中|已完成/, { timeout: 30_000 });
  await expect(goalBar(page)).toContainText("已完成", { timeout: 200_000 });
});
