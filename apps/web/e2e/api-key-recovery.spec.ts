import { test, expect } from "@playwright/test";

/**
 * E2E Test: API Key Invalid → Toast with action button to Settings > LLM
 *
 * Scenario:
 * 1. User visits the chat page
 * 2. User sends a message
 * 3. Backend sends SSE error (401 / 402 / 5xx / 429)
 * 4. Frontend shows toast with appropriate message
 * 5. For recoverable errors (401/402), toast has an action button "去配置"/"去充值"
 * 6. For non-recoverable errors (5xx/429), no action button or no redirect action
 */
test.describe("API Key Recovery Flow", () => {
  test.beforeEach(async ({ page }) => {
    // Clear persisted state to ensure a clean test environment
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
  });

  test("should show toast with '去配置' action when backend sends SSE error (401)", async ({ page }) => {
    // Mock /api/chat to return HTTP 200 with an SSE error event
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
        body: 'event: error\ndata: {"error":"401 Invalid API key"}\n\n',
      });
    });

    await expect(page.locator("textarea")).toBeVisible();
    await page.locator("textarea").fill("Hello, this is a test message");
    await page.getByRole("button", { name: "Send message" }).click();

    // Wait for toast to appear
    const toast = page.getByRole("status");
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(/API Key 无效/);

    // Verify the toast has an action button "去配置"
    const actionButton = page.getByRole("button", { name: "去配置" });
    await expect(actionButton).toBeVisible();

    // Clicking the action button should navigate to settings > llm
    await actionButton.click();
    await expect(page).toHaveURL(/\/settings\?tab=llm/, { timeout: 5000 });
  });

  test("should show toast with '去充值' action when backend sends SSE error (402)", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
        body: 'event: error\ndata: {"error":"402 Payment required: Insufficient balance"}\n\n',
      });
    });

    await expect(page.locator("textarea")).toBeVisible();
    await page.locator("textarea").fill("Test message for balance error");
    await page.getByRole("button", { name: "Send message" }).click();

    const toast = page.getByRole("status");
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(/余额不足/);

    // Verify the toast has an action button "去充值"
    const actionButton = page.getByRole("button", { name: "去充值" });
    await expect(actionButton).toBeVisible();
  });

  test("should show toast WITHOUT action button for server errors (5xx SSE error)", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
        body: 'event: error\ndata: {"error":"503 Service Unavailable"}\n\n',
      });
    });

    await expect(page.locator("textarea")).toBeVisible();
    await page.locator("textarea").fill("Test message for server error");
    await page.getByRole("button", { name: "Send message" }).click();

    const toast = page.getByRole("status");
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(/服务暂时不可用/);

    // Should NOT have any action button ("去配置" or "去充值")
    await expect(page.getByRole("button", { name: "去配置" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "去充值" })).not.toBeVisible();

    // Should stay on the chat page
    await expect(page).toHaveURL(/\/$/);
  });

  test("should show toast WITHOUT action button for rate limit errors (429 SSE error)", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
        body: 'event: error\ndata: {"error":"429 Rate limit exceeded"}\n\n',
      });
    });

    await expect(page.locator("textarea")).toBeVisible();
    await page.locator("textarea").fill("Test message for rate limit");
    await page.getByRole("button", { name: "Send message" }).click();

    const toast = page.getByRole("status");
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(/频率超限/);

    // Should NOT have any action button
    await expect(page.getByRole("button", { name: "去配置" })).not.toBeVisible();
    await expect(page.getByRole("button", { name: "去充值" })).not.toBeVisible();

    // Should stay on the chat page
    await expect(page).toHaveURL(/\/$/);
  });
});
