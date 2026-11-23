import { test, expect, type Page } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/**
 * GUI 迁移第二步的端到端检查：前端直接渲染 core 事件，会话由本地 server 保存。
 * 需要真实的模型（后端已配置 key）和运行中的 server，默认跳过：
 *   LEOCHAT_E2E_LIVE=1 npx playwright test e2e/chat-core.spec.ts
 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a live model; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(180_000);
test.describe.configure({ retries: 1 });

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

test("web search (DeepSeek native) shows the search and its sources", async ({ page }) => {
  // 是否真的去搜索由模型决定，偶尔会直接回答；允许重试一次
  test.info().annotations.push({ type: "flaky", description: "model may skip the search" });
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  // 联网默认开启（2026-11-22）；按钮名只认输入框下的开关（侧边栏会话标题里也可能有"联网"）
  await expect(page.getByRole("button", { name: "联网", exact: true })).toHaveAttribute("aria-pressed", "true");

  await input(page).fill("联网搜索：DeepSeek 最新发布的模型叫什么？一句话回答并注明来源。");
  await input(page).press("Enter");
  await expect(page.getByText("联网搜索", { exact: true }).first()).toBeVisible({ timeout: 60_000 }); // 模型可能搜索多次
  await waitIdle(page);
  const reply = messages(page).nth(1);
  // 回合结束后过程收成一行（简洁模式），点开看搜索步骤
  await reply.locator("[data-process] > button").first().click();
  await expect(reply.getByText(/条结果/).first()).toBeVisible(); // 模型可能搜索多次
  // 引用的来源以链接列出
  await expect(reply.locator('a[href^="http"]').first()).toBeVisible();
});

test("Ctrl+Enter during a turn queues in the inbox bar, and a queued message can be withdrawn", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  // 这一轮要足够长：负载高时数到 300 可能在撤回之前就结束，排队的消息被领取，撤回按钮随之消失（2026-11-23 现场确认）
  await input(page).fill("从 1 数到 1000，用逗号分隔，不要其他内容");
  await input(page).press("Enter");
  await expect(stopButton(page)).toBeVisible({ timeout: 30_000 });
  await input(page).fill("这条稍后再说");
  await input(page).press("Control+Enter");
  const bar = page.getByTestId("inbox-bar");
  await expect(bar).toContainText("这条稍后再说", { timeout: 10_000 });
  await bar.getByRole("button", { name: /撤回/ }).click({ timeout: 15_000 });
  await expect(bar).toHaveCount(0, { timeout: 15_000 }); // 负载高时 server 处理撤回要几秒
  // 不用等它数完，省 token；这一轮可能恰好结束（停止按钮和发送按钮是同一个 DOM 节点，结束后变成禁用的发送按钮），点不到就算了
  await stopButton(page).click({ timeout: 5_000 }).catch(() => {});
  await waitIdle(page);
  await expect(page.locator("[data-message-id]", { hasText: "这条稍后再说" })).toHaveCount(0);
});
