import { test, expect } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/**
 * E2E Test: Missing API Key → Settings → Configure Kimi Code → Retry Successfully
 *
 * Scenario:
 * 1. User visits chat page with no API key saved
 * 2. User sends a message (default provider deepseek uses backend proxy)
 * 3. Backend returns SSE 401 error
 * 4. Frontend shows toast with "去配置" action button
 * 5. User clicks "去配置" and navigates to Settings > LLM
 * 6. User selects "Kimi Code" provider
 * 7. User enters API key and saves
 * 8. User navigates back to chat page
 * 9. User sends another message (now provider is kimi-code, direct request)
 * 10. Kimi Code API returns successful SSE streaming response
 * 11. Frontend displays the assistant response
 */
test.describe("Kimi Code Provider Setup Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await resetStateBypassOnboarding(page);
  });

  test("should handle missing key error, navigate to settings, configure Kimi Code, and retry successfully", async ({ page }) => {
    // ==========================================
    // Phase 1: Send message without key → get 401 error
    // ==========================================

    // Mock backend chat API to return 401 SSE error
    // (default provider is deepseek which uses backend proxy)
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

    // Send a message
    await expect(page.locator("textarea")).toBeVisible();
    await page.locator("textarea").fill("Hello, this is a test message");
    await page.getByRole("button", { name: "Send message" }).click();

    // Wait for error toast to appear
    const toast = page.getByRole("status");
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText(/API Key 无效/);

    // Verify and click the "去配置" action button
    const actionButton = page.getByRole("button", { name: "去配置" });
    await expect(actionButton).toBeVisible();
    await actionButton.click();

    // Should navigate to Settings > LLM tab
    await expect(page).toHaveURL(/\/settings\?tab=llm/, { timeout: 5000 });

    // ==========================================
    // Phase 2: Configure Kimi Code in settings
    // ==========================================

    // Select Kimi (Coding) provider
    const kimiButton = page.getByRole("button", { name: /Kimi \(Coding\)/ });
    await expect(kimiButton).toBeVisible();
    await kimiButton.click();

    // Verify provider switched: API Key section should show "Kimi (Coding) API Key"
    await expect(page.getByRole("heading", { name: /Kimi \(Coding\) API Key/ })).toBeVisible();

    // Enter API key
    const keyInput = page.locator('input[type="password"]');
    await expect(keyInput).toBeVisible();
    await keyInput.fill("test-kimi-api-key-sk-123456");

    // Save the key
    const saveButton = page.getByRole("button", { name: "保存" });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();
    await saveButton.click();

    // Verify key is saved by checking "已配置" badge appears on Kimi Code card
    await expect(page.getByText("已配置").first()).toBeVisible({ timeout: 5000 });

    // Verify model list is shown for Kimi
    await expect(page.getByText(/Kimi k2\.6/).first()).toBeVisible();

    // ==========================================
    // Phase 3: Return to chat and retry with mock success
    // ==========================================

    // Navigate back to home page
    await page.goto("/");

    // Mock backend proxy to return successful SSE streaming response
    // (app always uses useBackendProxy: true, so requests go to /api/chat)
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        },
        body: [
          'event: chunk\ndata: {"content":"你好","index":1}\n\n',
          'event: chunk\ndata: {"content":"，","index":2}\n\n',
          'event: chunk\ndata: {"content":"世界","index":3}\n\n',
          'event: complete\ndata: {"role":"assistant","content":"你好，世界"}\n\n',
        ].join(""),
      });
    });

    // Send another message
    await expect(page.locator("textarea")).toBeVisible();
    await page.locator("textarea").fill("Hello again after configuring Kimi Code");
    await page.getByRole("button", { name: "Send message" }).click();

    // Wait for the assistant response to appear
    // The response content "你好，世界" should be rendered in the chat area
    await expect(page.getByText("你好，世界")).toBeVisible({ timeout: 15000 });

    // Verify there are at least 2 messages in the conversation (user + assistant)
    const userMessage = page.getByText("Hello again after configuring Kimi Code");
    await expect(userMessage).toBeVisible();
  });
});
