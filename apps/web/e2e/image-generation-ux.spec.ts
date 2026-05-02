import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, "..", "test-results", "ux-screenshots");
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function snap(page: any, name: string) {
  return page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: false });
}

test.describe("Image Generation UX Screenshots", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("screenshot: initial chat page", async ({ page }) => {
    await snap(page, "01-initial-chat-page");
  });

  test("screenshot: tool call loading state", async ({ page }) => {
    await page.route("**/api/mcp/tools/generate_image/call", async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ result: { content: [{ type: "text", text: "{}" }] } }),
      });
    });

    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body: [
          'event: tool_call\n',
          'data: {"id":"call_1","name":"generate_image","arguments":{"prompt":"a cat"}}\n\n',
        ].join(""),
      });
    });

    await page.locator("textarea").fill("画一只猫");
    await page.getByRole("button", { name: "Send message" }).click();

    await page.waitForTimeout(500);
    await snap(page, "02-tool-call-loading");
  });

  test("screenshot: generated image card", async ({ page }) => {
    // A larger 4x4 colored PNG for better visibility in screenshots
    const imageBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH6AQOFB0X0b3wzgAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIHRoZSBHSU1QvMlMmgAAADVJREFUOMtjYBgFoyEwGgKjITAaAqMhMBoCoyEwGgKjITAaAqMhMBoCoyEwGgKjITAaAqMhMBoCAwAMdwEGr5VH4QAAAABJRU5ErkJggg==";

    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body: [
          'event: tool_call\n',
          'data: {"id":"call_1","name":"generate_image","arguments":{"prompt":"a beautiful sunset over mountains","aspectRatio":"16:9","imageSize":"2K"}}\n\n',
          'event: tool_result\n',
          `data: {"id":"call_1","result":"{\\"id\\":\\"img_demo_001\\",\\"kind\\":\\"media\\",\\"title\\":\\"生成的图片\\",\\"subtitle\\":\\"a beautiful sunset over mountains\\",\\"body\\":[{\\"type\\":\\"image\\",\\"image\\":{\\"url\\":\\"data:image/png;base64,${imageBase64}\\",\\"alt\\":\\"sunset\\"}}],\\"actions\\":[{\\"id\\":\\"download\\",\\"label\\":\\"下载图片\\",\\"kind\\":\\"primary\\",\\"action\\":{\\"type\\":\\"link\\",\\"url\\":\\"data:image/png;base64,${imageBase64}\\"}}],\\"metadata\\":{\\"imageId\\":\\"img_demo_001\\",\\"thoughtSignature\\":\\"sig-demo\\",\\"originalPrompt\\":\\"a beautiful sunset over mountains\\",\\"canRefine\\":true}}"}\n\n`,
          'event: complete\n',
          'data: {"role":"assistant","content":"Here is the generated image!"}\n\n',
        ].join(""),
      });
    });

    await page.locator("textarea").fill("画一幅美丽的日落山景图");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.locator("text=生成的图片")).toBeVisible({ timeout: 10000 });
    await snap(page, "03-generated-image-card");
  });

  test("screenshot: error state", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        body: [
          'event: tool_call\n',
          'data: {"id":"call_err","name":"generate_image","arguments":{"prompt":"bad"}}\n\n',
          'event: tool_error\n',
          'data: {"id":"call_err","error":"内容安全策略限制，请尝试更换提示词"}\n\n',
          'event: complete\n',
          'data: {"role":"assistant","content":"Sorry, generation failed."}\n\n',
        ].join(""),
      });
    });

    await page.locator("textarea").fill("画一些违规内容");
    await page.getByRole("button", { name: "Send message" }).click();

    // Wait for the tool call to complete (even if mocked as error)
    await page.waitForTimeout(2000);
    await snap(page, "04-error-state");
  });

  test("screenshot: refined image card", async ({ page }) => {
    const originalBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAnElEQVR42u3RAQ0AAAgDoJvc6FrDBQfNyV5EREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREQe2W9fA0FXR8JHAAAAAElFTkSuQmCC";
    const refinedBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAYAAABw4pVUAAAAnElEQVR42u3RAQ0AAAgDoJvc6FrDBQfNyV5EREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREREQe2W9fA0FXR8JHAAAAAElFTkSuQmCC";

    await page.route("**/api/chat", async (route, request) => {
      const body = await request.postDataJSON?.();
      const isSecond = body?.messages?.length > 2;

      if (isSecond) {
        await route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          body: [
            'event: tool_call\n',
            'data: {"id":"call_ref","name":"refine_image","arguments":{"imageId":"img_demo_001","instruction":"add more vibrant colors"}}\n\n',
            'event: tool_result\n',
            `data: {"id":"call_ref","result":"{\\"id\\":\\"img_demo_002\\",\\"kind\\":\\"media\\",\\"title\\":\\"优化后的图片\\",\\"subtitle\\":\\"add more vibrant colors\\",\\"body\\":[{\\"type\\":\\"image\\",\\"image\\":{\\"url\\":\\"data:image/png;base64,${refinedBase64}\\",\\"alt\\":\\"refined\\"}}],\\"actions\\":[{\\"id\\":\\"download\\",\\"label\\":\\"下载图片\\",\\"kind\\":\\"primary\\",\\"action\\":{\\"type\\":\\"link\\",\\"url\\":\\"data:image/png;base64,${refinedBase64}\\"}}],\\"metadata\\":{\\"imageId\\":\\"img_demo_002\\",\\"canRefine\\":true}}"}\n\n`,
            'event: complete\n',
            'data: {"role":"assistant","content":"Here is the refined image!"}\n\n',
          ].join(""),
        });
      } else {
        await route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
          body: [
            'event: tool_call\n',
            'data: {"id":"call_gen","name":"generate_image","arguments":{"prompt":"a landscape"}}\n\n',
            'event: tool_result\n',
            `data: {"id":"call_gen","result":"{\\"id\\":\\"img_demo_001\\",\\"kind\\":\\"media\\",\\"title\\":\\"生成的图片\\",\\"body\\":[{\\"type\\":\\"image\\",\\"image\\":{\\"url\\":\\"data:image/png;base64,${originalBase64}\\",\\"alt\\":\\"landscape\\"}}],\\"actions\\":[{\\"id\\":\\"download\\",\\"label\\":\\"下载图片\\",\\"kind\\":\\"primary\\",\\"action\\":{\\"type\\":\\"link\\",\\"url\\":\\"data:image/png;base64,${originalBase64}\\"}}],\\"metadata\\":{\\"imageId\\":\\"img_demo_001\\",\\"thoughtSignature\\":\\"sig-abc\\",\\"originalPrompt\\":\\"a landscape\\",\\"canRefine\\":true}}"}\n\n`,
            'event: complete\n',
            'data: {"role":"assistant","content":"Here is your landscape!"}\n\n',
          ].join(""),
        });
      }
    });

    // First generation
    await page.locator("textarea").fill("画一幅风景画");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator("text=生成的图片")).toBeVisible({ timeout: 10000 });

    // Then refine
    await page.locator("textarea").fill("让颜色更鲜艳一些");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.locator("text=优化后的图片")).toBeVisible({ timeout: 10000 });

    await snap(page, "05-refined-image-card");
  });
});
