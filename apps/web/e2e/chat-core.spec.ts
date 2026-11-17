import { test, expect, type Page } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/**
 * GUI 迁移第二步的端到端检查：前端直接渲染 core 事件，会话由本地 server 保存。
 * 需要真实的模型（后端已配置 key）和运行中的 server，默认跳过：
 *   LEOCHAT_E2E_LIVE=1 npx playwright test e2e/chat-core.spec.ts
 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a live model; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(180_000);

const input = (page: Page) => page.locator("textarea").first();
const messages = (page: Page) => page.locator("[data-message-id]");
const stopButton = (page: Page) => page.getByRole("button", { name: "Stop generating" });

async function waitIdle(page: Page) {
  await expect(stopButton(page)).toHaveCount(0, { timeout: 150_000 });
}

test("streams a reply, persists it on the server, and restores it after reload", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);

  await input(page).fill("只回复四个字：你好世界");
  await input(page).press("Enter");
  await expect(messages(page)).toHaveCount(2, { timeout: 30_000 });
  await waitIdle(page);
  const reply = (await messages(page).nth(1).innerText()).trim();
  expect(reply.length).toBeGreaterThan(0);

  // 刷新后从 server 恢复当前会话
  await page.reload();
  await expect(messages(page)).toHaveCount(2, { timeout: 30_000 });
  await expect(messages(page).nth(0)).toContainText("你好世界");
});

test("Enter during a run steers into it instead of starting a new run", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);

  await input(page).fill("从 1 数到 200，用逗号分隔，不要其他内容");
  await input(page).press("Enter");
  await expect(stopButton(page)).toBeVisible({ timeout: 30_000 });
  await input(page).fill("停，改成只回复：收到");
  await input(page).press("Enter");
  await expect(input(page)).toHaveValue("");
  await waitIdle(page);
  // 插话作为用户消息出现在对话里（core 的 user_message 事件）
  await expect(page.locator("[data-message-id]", { hasText: "停，改成只回复：收到" })).toHaveCount(1);
});
