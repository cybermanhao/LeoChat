import { test, expect, type Page } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/**
 * 会话"⋯"菜单（重命名、删除）和手机上收起的输入控件（重设计计划 §3 / §5 / §7）。
 * 需要运行中的 server：LEOCHAT_E2E_LIVE=1 npx playwright test e2e/conversation-menu.spec.ts
 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a running server; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(120_000);

const input = (page: Page) => page.locator("textarea").first();

/** 用 /loop 建一个有内容的会话（不需要等模型） */
async function conversationWithReminder(page: Page) {
  await input(page).fill("/loop 30m 菜单测试提醒");
  await input(page).press("Enter");
  await expect(page.getByTestId("schedule-bar")).toBeVisible({ timeout: 15_000 });
}

test("rename from the ⋯ menu survives a reload; delete removes the conversation after confirming", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await conversationWithReminder(page);

  const header = page.getByTestId("conversation-header");
  await header.getByTestId("conversation-menu").click();
  await page.getByRole("menuitem", { name: "重命名" }).click();
  const title = header.getByRole("textbox", { name: "会话标题" });
  await title.fill("菜单改名测试");
  await title.press("Enter");
  await expect(header.getByRole("heading", { name: "菜单改名测试" })).toBeVisible();
  await expect(page.getByTestId("app-sidebar").getByRole("button", { name: "菜单改名测试" })).toBeVisible();

  await page.reload();
  await expect(page.getByTestId("conversation-header").getByRole("heading", { name: "菜单改名测试" })).toBeVisible({ timeout: 15_000 });

  // Esc 取消不改名
  await page.getByTestId("conversation-menu").click();
  await page.getByRole("menuitem", { name: "重命名" }).click();
  await page.getByRole("textbox", { name: "会话标题" }).fill("不应该保存");
  await page.getByRole("textbox", { name: "会话标题" }).press("Escape");
  await expect(page.getByTestId("conversation-header").getByRole("heading", { name: "菜单改名测试" })).toBeVisible();

  // 删除（不可逆，先确认）
  page.once("dialog", (d) => void d.accept());
  await page.getByTestId("conversation-menu").click();
  await page.getByRole("menuitem", { name: "删除这个对话" }).click();
  await expect(page.getByTestId("app-sidebar").getByRole("button", { name: "菜单改名测试" })).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId("conversation-header")).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("composer controls fold into ⋯ and show their labels when opened", async ({ page }) => {
    await page.goto("/");
    await resetStateBypassOnboarding(page);
    await expect(page.getByRole("button", { name: "联网", exact: true })).toHaveCount(0);
    await page.getByTestId("mobile-chips-menu").click();
    const web = page.getByRole("button", { name: "联网", exact: true });
    await expect(web).toBeVisible();
    await expect(web).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("联网", { exact: true })).toBeVisible(); // 文字标签显示出来
  });
});
