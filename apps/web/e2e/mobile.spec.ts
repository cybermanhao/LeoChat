import { test, expect, type Page } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/**
 * 手机（390px，重设计 P5 的验收）：新建会话 → 发消息 → 看过程 → 批准工具，全程没有横向滚动。
 * 需要真实模型和内置 leochat MCP 服务：LEOCHAT_E2E_LIVE=1 npx playwright test e2e/mobile.spec.ts
 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a live model; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(240_000);
test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const input = (page: Page) => page.locator("textarea").first();
const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

test("on a phone: new chat, send, see the process, approve a tool — without horizontal scrolling", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await page.evaluate(() =>
    localStorage.setItem("leochat-mcp-storage", JSON.stringify({ state: { autoConnectServerIds: ["leochat"] }, version: 0 })),
  );
  await page.reload();

  // 侧边栏是抽屉，默认隐藏
  await expect(page.getByTestId("app-sidebar")).toHaveCount(0);
  await expect(page.getByTestId("mobile-top-bar")).toBeVisible();
  await noHorizontalScroll(page);

  // 打开 bash：菜单 → 设置 → MCP → 工具（抽屉在跳转后自动关上）
  await page.getByTestId("mobile-top-bar").getByRole("button").first().click();
  await expect(page.getByTestId("app-sidebar")).toBeVisible();
  await page.getByTestId("app-sidebar").getByRole("button", { name: /^MCP [1-9]/ }).click({ timeout: 60_000 });
  await expect(page.getByTestId("app-sidebar")).toHaveCount(0);
  await page.getByRole("link", { name: "工具", exact: true }).click();
  await expect(page.getByText("bash", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  await noHorizontalScroll(page);
  const row = page.locator("div", { has: page.getByText("bash", { exact: true }) }).filter({ has: page.getByRole("switch") }).last();
  await row.getByRole("switch").first().click();
  await expect(row.getByRole("switch").first()).toHaveAttribute("aria-checked", "true");

  // 新对话（顶栏右侧按钮）→ 发消息
  await page.getByTestId("mobile-top-bar").getByRole("button", { name: "新对话" }).click();
  await input(page).fill("请用 bash 工具执行命令 `echo leochat-mobile-ok`，然后把输出原样告诉我。");
  await input(page).press("Enter");

  // 过程里出现审批卡片，批准
  await expect(page.getByText("AI 请求执行")).toBeVisible({ timeout: 90_000 });
  await noHorizontalScroll(page);
  await page.getByRole("button", { name: "允许", exact: true }).click();
  await expect(page.getByRole("button", { name: "Stop generating" })).toHaveCount(0, { timeout: 120_000 });
  await expect(page.locator("[data-message-id]").last()).toContainText("leochat-mobile-ok");

  // 展开过程能看到这条命令
  await page.locator("[data-process] > button").last().click();
  await expect(page.locator("[data-tool=bash]").last()).toContainText("echo leochat-mobile-ok");
  await noHorizontalScroll(page);
});
