import { test, expect, type Page } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/**
 * 聊天区贴底滚动（真实流式输出）：贴底时跟随、用户上滚后不被拽回、"回到底部"按钮。
 * 需要真实模型：LEOCHAT_E2E_LIVE=1 npx playwright test e2e/scroll.spec.ts
 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a live model; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(180_000);

const input = (page: Page) => page.locator("textarea").first();
const stopButton = (page: Page) => page.getByRole("button", { name: "Stop generating" });
const metrics = (page: Page) =>
  page.getByTestId("chat-scroll").evaluate((el) => ({ top: el.scrollTop, height: el.scrollHeight, client: el.clientHeight }));
const distance = (m: { top: number; height: number; client: number }) => m.height - m.top - m.client;

test("follows the stream at the bottom, stays put after the user scrolls up, and the button brings it back", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await input(page).fill("写一篇大约 1500 字的散文，题目是《秋天的银杏》，分很多段落。");
  await input(page).press("Enter");
  await expect(stopButton(page)).toBeVisible({ timeout: 30_000 });

  // 1. 贴底跟随：内容超过一屏后，连续采样时始终在底部附近
  await expect.poll(async () => (await metrics(page)).height, { timeout: 60_000 }).toBeGreaterThan(1500);
  const samples: number[] = [];
  for (let i = 0; i < 15; i++) {
    samples.push(distance(await metrics(page)));
    await page.waitForTimeout(100);
  }
  expect(Math.max(...samples)).toBeLessThan(120);

  // 2. 用户向上滚：之后不再被拽回底部，出现"回到底部"
  await page.getByTestId("chat-scroll").hover();
  await page.mouse.wheel(0, -900);
  await page.waitForTimeout(300);
  const held = (await metrics(page)).top;
  await page.waitForTimeout(1500);
  const later = await metrics(page);
  if (later.height > held + later.client) expect(Math.abs(later.top - held)).toBeLessThan(5); // 内容在继续增长，位置不动
  await expect(page.getByRole("button", { name: /回到底部/ })).toBeVisible();

  // 3. 点"回到底部"：回到底部并继续跟随
  await page.getByRole("button", { name: /回到底部/ }).click();
  await expect.poll(async () => distance(await metrics(page)), { timeout: 5_000 }).toBeLessThan(120);
  await expect(page.getByRole("button", { name: /回到底部/ })).toHaveCount(0);
  if (await stopButton(page).count()) await stopButton(page).click(); // 还在生成就停掉，省 token
});
