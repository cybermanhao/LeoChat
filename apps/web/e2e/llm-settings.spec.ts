import { test, expect, type Page } from "@playwright/test";
import { resetStateBypassOnboarding } from "./helpers";

/**
 * E2E coverage for the reworked LLM settings / model catalog:
 *  - OpenRouter model list is fetched dynamically and noise-filtered
 *  - saving a key surfaces backend-sync failure instead of silently succeeding
 *  - curated fallback list shows when no key is configured
 *
 * The backend is stubbed via route interception so the test is hermetic
 * (no real server, no real API key).
 */

const OPENROUTER_MODELS = [
  "deepseek/deepseek-chat",
  "anthropic/claude-haiku-4.5",
  "openai/gpt-4o-mini",
  "google/gemini-2.5-flash-lite",
  "x-ai/grok-4.20",
  "meta-llama/llama-3.3-70b-instruct",
  "vendor/model:batch", // must be filtered out by filterModelIds
  "vendor/model-image", // must be filtered out by filterModelIds
];
const VISIBLE_COUNT = 6; // 8 returned - 2 noise entries

type ConfigResult = { status: number; body: Record<string, unknown> };

async function stubBackend(page: Page, opts: { config: ConfigResult; models?: string[] }) {
  // Catch-all for backend calls we don't care about (MCP autoconnect, system probes…).
  // Registered first so the specific handlers below take precedence (routes are LIFO).
  await page.route("**/api/**", (route) => route.fulfill({ json: {} }));

  // GET /api/llm/config — polled on app boot
  await page.route("**/api/llm/config", async (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        json: { availableProviders: [], defaultProvider: "", backendConfigured: false },
      });
    }
    // POST /api/llm/config — key sync
    return route.fulfill({ status: opts.config.status, json: opts.config.body });
  });

  await page.route("**/api/llm/models", async (route) => {
    if (opts.models) return route.fulfill({ json: { models: opts.models } });
    return route.fulfill({ status: 502, json: { error: "no models" } });
  });

  // keep unrelated backend chatter from hanging the page
  await page.route("**/api/mcp/**", (route) => route.fulfill({ json: {} }));
}

async function openLlmSettings(page: Page) {
  await page.goto("/");
  await resetStateBypassOnboarding(page);
  await page.goto("/settings?tab=llm");
  await expect(page.getByRole("heading", { name: "默认提供商" })).toBeVisible({ timeout: 15000 });
}

async function selectOpenRouter(page: Page) {
  await page.locator("button", { hasText: "OpenRouter" }).first().click();
  await expect(page.getByRole("heading", { name: "OpenRouter API Key" })).toBeVisible();
}

test.describe("LLM settings — OpenRouter", () => {
  test("dynamic model list is fetched, noise-filtered, and selectable", async ({ page }) => {
    await stubBackend(page, {
      config: { status: 200, body: { success: true, availableProviders: ["openrouter"], defaultProvider: "openrouter" } },
      models: OPENROUTER_MODELS,
    });
    await openLlmSettings(page);
    await selectOpenRouter(page);

    await page.locator('input[type="password"]').fill("sk-or-v1-e2e-test-key");
    await page.getByRole("button", { name: "保存" }).click();

    // key sync confirmed
    await expect(page.getByText("保存成功")).toBeVisible();

    // dynamic list rendered with the "live" badge and the filtered count
    await expect(page.getByText(new RegExp(`实时 · ${VISIBLE_COUNT}`))).toBeVisible();

    // noise entries dropped
    await expect(page.getByText("vendor/model:batch")).toHaveCount(0);
    await expect(page.getByText("vendor/model-image")).toHaveCount(0);

    // curated metadata still decorates a known slug
    const row = page.getByRole("button", { name: /DeepSeek V3/ });
    await expect(row).toBeVisible();
    await row.click();
    await expect(row).toHaveClass(/border-primary/);
  });

  test("save surfaces backend sync failure", async ({ page }) => {
    await stubBackend(page, {
      config: { status: 502, body: { error: "backend unavailable" } },
      models: OPENROUTER_MODELS,
    });
    await openLlmSettings(page);
    await selectOpenRouter(page);

    await page.locator('input[type="password"]').fill("sk-or-v1-e2e-test-key");
    await page.getByRole("button", { name: "保存" }).click();

    await expect(page.getByText("后端未确认收到 key")).toBeVisible();
    await expect(page.getByText("保存成功")).toHaveCount(0);
  });

  test("switching provider does not leak the previous provider's live list", async ({ page }) => {
    await stubBackend(page, {
      config: { status: 200, body: { success: true, availableProviders: ["openrouter"], defaultProvider: "openrouter" } },
      models: OPENROUTER_MODELS,
    });
    await openLlmSettings(page);
    await selectOpenRouter(page);
    await page.locator('input[type="password"]').fill("sk-or-v1-e2e-test-key");
    await page.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText(new RegExp(`实时 · ${VISIBLE_COUNT}`))).toBeVisible();

    // switch to DeepSeek (no key, no dynamic fetch)
    await page.locator("button", { hasText: "DeepSeek" }).first().click();
    await expect(page.getByRole("heading", { name: "DeepSeek API Key" })).toBeVisible();

    // OpenRouter slugs and the live badge must be gone immediately; curated DeepSeek list shows
    await expect(page.getByText(/实时 · \d+/)).toHaveCount(0);
    await expect(page.getByText("x-ai/grok-4.20")).toHaveCount(0);
    await expect(page.getByText("deepseek/deepseek-chat")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /DeepSeek V4 Flash/ })).toBeVisible();
  });

  test("curated fallback list shows when no key is set", async ({ page }) => {
    await stubBackend(page, {
      config: { status: 200, body: { success: true, availableProviders: [], defaultProvider: "" } },
    });
    await openLlmSettings(page);
    await selectOpenRouter(page);

    await expect(page.getByText("请先配置 OpenRouter 的 API Key")).toBeVisible();
    await expect(page.getByRole("button", { name: /DeepSeek V3/ })).toBeVisible();
    await expect(page.getByText(/实时 · \d+/)).toHaveCount(0);
  });
});
