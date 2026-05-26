import type { Page } from "@playwright/test";

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
