import { test, expect, type Page } from "@playwright/test";
import { enableBash, resetStateBypassOnboarding } from "./helpers";

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

test("a message queued during a turn waits in the inbox while the turn awaits approval, and can be withdrawn", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  // 让这一轮停在等待审批上：这一轮一直进行中，排队的消息会留在收件箱里，不取决于模型写得多快
  await enableBash(page);
  await input(page).fill("请用 bash 工具执行命令 `echo leochat-queue-test`。");
  await input(page).press("Enter");
  await expect(input(page)).toHaveValue("");
  // 审批面板会接管输入框（dsh 的 ui-approval），所以在它出现之前排队
  await input(page).fill("这条稍后再说");
  await input(page).press("Control+Enter");

  await expect(page.getByTestId("approval-panel")).toBeVisible({ timeout: 90_000 });
  const bar = page.getByTestId("context-strip").getByTestId("inbox-bar");
  await expect(bar).toContainText("这条稍后再说", { timeout: 15_000 });
  await bar.getByRole("button", { name: /撤回/ }).click();
  await expect(bar).toHaveCount(0, { timeout: 15_000 });

  // 拒绝执行，这一轮结束；撤回的消息不会出现在对话里
  await page.getByTestId("approval-panel").getByRole("button", { name: "拒绝", exact: true }).click();
  await waitIdle(page);
  await expect(page.locator("[data-message-id]", { hasText: "这条稍后再说" })).toHaveCount(0);
});

test("the approval panel takes over the composer: Enter on the request allows it", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await enableBash(page);
  await input(page).fill("请用 bash 工具执行命令 `echo leochat-enter-approve`，然后把输出原样告诉我。");
  await input(page).press("Enter");
  const panel = page.getByTestId("approval-panel");
  await expect(panel).toBeVisible({ timeout: 90_000 });
  await expect(input(page)).toBeHidden(); // 输入框被接管（还挂载着，草稿不丢）
  await expect(panel.locator('[aria-label^="AI 请求执行 bash"]')).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(panel).toHaveCount(0, { timeout: 30_000 });
  await expect(input(page)).toBeVisible();
  await waitIdle(page);
  await expect(page.locator("[data-message-id]").last()).toContainText("leochat-enter-approve");
});
