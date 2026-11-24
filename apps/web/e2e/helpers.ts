import { expect, type Page } from "@playwright/test";

/**
 * Clears all persisted state and marks onboarding as completed,
 * so the main chat UI is shown immediately without the wizard.
 */
export async function resetStateBypassOnboarding(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
    // Mark onboarding done so the wizard doesn't block the UI
    localStorage.setItem(
      "leochat-onboarding",
      JSON.stringify({ state: { onboardingCompleted: true }, version: 0 })
    );
  });
  await page.reload();
}

/**
 * 让内置 leochat 服务自动连接，再在 设置 → MCP → 工具 里打开 bash（需要审批的工具）。
 * bash 每次加载页面都会被强制禁用，只能在当前会话里手动打开；所以全程不刷新页面，用应用内导航切回聊天
 */
export async function enableBash(page: Page) {
  await page.evaluate(() =>
    localStorage.setItem("leochat-mcp-storage", JSON.stringify({ state: { autoConnectServerIds: ["leochat"] }, version: 0 })),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: /^MCP [1-9]/ })).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("app-sidebar").getByRole("button", { name: /^设置/ }).click();
  await page.getByRole("link", { name: "MCP", exact: true }).click();
  await page.getByRole("link", { name: "工具", exact: true }).click();
  // 工具列表在服务器连上之后异步到达（"MCP N" 出现不代表工具已就绪）
  await expect(page.getByText("bash", { exact: true }).first()).toBeVisible({ timeout: 60_000 });
  const row = page.locator("div", { has: page.getByText("bash", { exact: true }) }).filter({ has: page.getByRole("switch") }).last();
  const sw = row.getByRole("switch").first();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await page.getByRole("link", { name: "回到对话" }).click();
  await expect(page.locator("textarea").first()).toBeVisible();
}
