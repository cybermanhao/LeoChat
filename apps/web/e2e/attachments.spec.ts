import { test, expect, type Page } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resetStateBypassOnboarding } from "./helpers";

/**
 * 附件（重设计 P3b）：选文件后上传，随消息发给模型；刷新后用户消息里仍显示附件。
 * 需要真实模型（DeepSeek）：LEOCHAT_E2E_LIVE=1 npx playwright test e2e/attachments.spec.ts
 */
test.skip(!process.env.LEOCHAT_E2E_LIVE, "needs a live model; set LEOCHAT_E2E_LIVE=1");
test.setTimeout(180_000);

const input = (page: Page) => page.locator("textarea").first();
const stopButton = (page: Page) => page.getByRole("button", { name: "Stop generating" });
const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => join(here, "fixtures", name);

async function waitForRun(page: Page) {
  await expect(stopButton(page)).toBeVisible({ timeout: 30_000 });
  await expect(stopButton(page)).toHaveCount(0, { timeout: 120_000 });
}

test("an image goes to the model and stays in the message after reload", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await page.getByTestId("attachment-input").setInputFiles(fixture("red.png"));
  await expect(page.getByTestId("pending-attachments")).toContainText("red.png");
  await input(page).fill("这张图是什么颜色？只回答颜色。");
  await input(page).press("Enter");
  await expect(page.getByTestId("pending-attachments")).toHaveCount(0);
  await waitForRun(page);
  await expect(page.locator("[data-message-id]").last()).toContainText("红");

  await page.reload();
  await expect(page.locator("[data-attachment=image] img").first()).toBeVisible({ timeout: 30_000 });
});

test("a text file goes to the model through DeepSeek Files", async ({ page }) => {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await page.getByTestId("attachment-input").setInputFiles(fixture("secret.txt"));
  await expect(page.getByTestId("pending-attachments")).toContainText("secret.txt");
  // 模型通过 DeepSeek Files 读到文件内容（只有附件、没有文字的情况在 server 测试里）
  await input(page).fill("附件里的暗号是什么？只回答暗号。");
  await input(page).press("Enter");
  await waitForRun(page);
  await expect(page.locator("[data-attachment=file]").first()).toContainText("secret.txt");
  await expect(page.locator("[data-message-id]").last()).toContainText("蓝莓");
});
