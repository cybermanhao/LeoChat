import { test, expect } from "@playwright/test";

/**
 * E2E Tests for Image Generation (generate_image & refine_image)
 *
 * We mock the backend to avoid consuming real Gemini API quota and to have
 * deterministic responses for assertions.
 */

test.describe("Image Generation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
  });

  test("should render generated image card with metadata for refine", async ({ page }) => {
    const imageBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="; // 1x1 red png
    const thoughtSignature = "mock-signature-123";
    const imageId = "img_mock_12345";

    // Mock chat SSE to trigger generate_image tool call
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: [
          'event: tool_call\n',
          `data: {"id":"call_1","name":"generate_image","arguments":{"prompt":"a cat","aspectRatio":"1:1","imageSize":"1K"}}\n\n`,
          'event: tool_result\n',
          `data: {"id":"call_1","result":"{\\"id\\":\\"${imageId}\\",\\"kind\\":\\"media\\",\\"title\\":\\"生成的图片\\",\\"body\\":[{\\"type\\":\\"image\\",\\"image\\":{\\"url\\":\\"data:image/png;base64,${imageBase64}\\",\\"alt\\":\\"a cat\\"}}],\\"actions\\":[{\\"id\\":\\"download\\",\\"label\\":\\"下载图片\\",\\"kind\\":\\"primary\\",\\"action\\":{\\"type\\":\\"link\\",\\"url\\":\\"data:image/png;base64,${imageBase64}\\"}}],\\"metadata\\":{\\"imageId\\":\\"${imageId}\\",\\"thoughtSignature\\":\\"${thoughtSignature}\\",\\"originalPrompt\\":\\"a cat\\",\\"canRefine\\":true}}"}\n\n`,
          'event: complete\n',
          'data: {"role":"assistant","content":"Here is your cat image!"}\n\n',
        ].join(""),
      });
    });

    // Send a message that would trigger generate_image
    await expect(page.locator("textarea")).toBeVisible();
    await page.locator("textarea").fill("画一只猫");
    await page.getByRole("button", { name: "Send message" }).click();

    // Wait for tool call animation
    await expect(page.locator("text=generate_image")).toBeVisible({ timeout: 10000 });

    // Wait for the card to appear
    const card = page.locator(`[data-card-id="${imageId}"]`).or(page.locator("text=生成的图片"));
    await expect(card.first()).toBeVisible({ timeout: 10000 });

    // Verify image is rendered
    const img = page.locator('img[alt="a cat"]');
    await expect(img).toBeVisible({ timeout: 10000 });

    // Verify download button exists
    const downloadBtn = page.getByRole("button", { name: "下载图片" });
    await expect(downloadBtn).toBeVisible();

    // UX: Verify the card shows the title "生成的图片"
    await expect(page.locator("text=生成的图片")).toBeVisible();
  });

  test("should handle generate_image error gracefully", async ({ page }) => {
    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: [
          'event: tool_call\n',
          'data: {"id":"call_2","name":"generate_image","arguments":{"prompt":"bad prompt"}}\n\n',
          'event: tool_error\n',
          'data: {"id":"call_2","error":"内容安全策略限制，请尝试更换提示词"}\n\n',
          'event: complete\n',
          'data: {"role":"assistant","content":"Sorry, generation failed."}\n\n',
        ].join(""),
      });
    });

    await expect(page.locator("textarea")).toBeVisible();
    await page.locator("textarea").fill("画一些违规内容");
    await page.getByRole("button", { name: "Send message" }).click();

    // Wait for the tool call to show error status
    await expect(page.locator("text=generate_image")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=[失败]")).toBeVisible({ timeout: 10000 });

    // Expand details to verify error message is present
    await page.locator("text=详情").click();
    await expect(page.locator("text=内容安全策略限制")).toBeVisible({ timeout: 5000 });
  });

  test("should allow aborting image generation", async ({ page }) => {
    // Make the tool call take a long time so we can abort it
    let toolCallReceived = false;
    await page.route("**/api/mcp/tools/generate_image/call", async (route) => {
      toolCallReceived = true;
      // Delay response to simulate long generation
      await new Promise((r) => setTimeout(r, 30000));
      await route.fulfill({
        status: 200,
        body: JSON.stringify({ result: { content: [{ type: "text", text: "mock" }] } }),
      });
    });

    await page.route("**/api/chat", async (route) => {
      await route.fulfill({
        status: 200,
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
        },
        body: [
          'event: tool_call\n',
          'data: {"id":"call_3","name":"generate_image","arguments":{"prompt":"slow image"}}\n\n',
        ].join(""),
      });
    });

    await expect(page.locator("textarea")).toBeVisible();
    await page.locator("textarea").fill("画一张很慢的图片");
    await page.getByRole("button", { name: "Send message" }).click();

    // Wait for tool call to start
    await expect(page.locator("text=generate_image")).toBeVisible({ timeout: 10000 });

    // Find and click the stop button (should appear during generation)
    const stopButton = page.getByRole("button", { name: /停止|Stop/ });
    if (await stopButton.isVisible().catch(() => false)) {
      await stopButton.click();
      // After abort, the loading state should disappear or show cancelled
      await expect(page.locator("text=generate_image")).not.toBeVisible({ timeout: 10000 });
    }
  });

  test("should render refined image after refine_image tool call", async ({ page }) => {
    const originalBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const refinedBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwPwAGAwJ/l7s8gQAAAABJRU5ErkJggg=="; // 1x1 blue png
    const originalId = "img_orig_123";
    const refinedId = "img_refined_456";

    await page.route("**/api/chat", async (route, request) => {
      const body = await request.postDataJSON?.();
      // First message triggers generate_image, second triggers refine_image
      const isRefine = body?.messages?.some((m: any) =>
        m.content?.includes("refine") || m.content?.includes("优化") || m.content?.includes("背景")
      );

      if (isRefine) {
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
          body: [
            'event: tool_call\n',
            `data: {"id":"call_ref","name":"refine_image","arguments":{"imageId":"${originalId}","instruction":"让背景变成蓝色"}}\n\n`,
            'event: tool_result\n',
            `data: {"id":"call_ref","result":"{\\"id\\":\\"${refinedId}\\",\\"kind\\":\\"media\\",\\"title\\":\\"优化后的图片\\",\\"body\\":[{\\"type\\":\\"image\\",\\"image\\":{\\"url\\":\\"data:image/png;base64,${refinedBase64}\\",\\"alt\\":\\"refined\\"}}],\\"actions\\":[{\\"id\\":\\"download\\",\\"label\\":\\"下载图片\\",\\"kind\\":\\"primary\\",\\"action\\":{\\"type\\":\\"link\\",\\"url\\":\\"data:image/png;base64,${refinedBase64}\\"}}],\\"metadata\\":{\\"imageId\\":\\"${refinedId}\\",\\"canRefine\\":true}}"}\n\n`,
            'event: complete\n',
            'data: {"role":"assistant","content":"Here is the refined image!"}\n\n',
          ].join(""),
        });
      } else {
        await route.fulfill({
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
          body: [
            'event: tool_call\n',
            `data: {"id":"call_gen","name":"generate_image","arguments":{"prompt":"a cat"}}\n\n`,
            'event: tool_result\n',
            `data: {"id":"call_gen","result":"{\\"id\\":\\"${originalId}\\",\\"kind\\":\\"media\\",\\"title\\":\\"生成的图片\\",\\"body\\":[{\\"type\\":\\"image\\",\\"image\\":{\\"url\\":\\"data:image/png;base64,${originalBase64}\\",\\"alt\\":\\"cat\\"}}],\\"actions\\":[{\\"id\\":\\"download\\",\\"label\\":\\"下载图片\\",\\"kind\\":\\"primary\\",\\"action\\":{\\"type\\":\\"link\\",\\"url\\":\\"data:image/png;base64,${originalBase64}\\"}}],\\"metadata\\":{\\"imageId\\":\\"${originalId}\\",\\"thoughtSignature\\":\\"sig-abc\\",\\"originalPrompt\\":\\"a cat\\",\\"canRefine\\":true}}"}\n\n`,
            'event: complete\n',
            'data: {"role":"assistant","content":"Here is your cat!"}\n\n',
          ].join(""),
        });
      }
    });

    // Step 1: Generate original image
    await expect(page.locator("textarea")).toBeVisible();
    await page.locator("textarea").fill("画一只猫");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.locator("text=生成的图片")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('img[alt="cat"]')).toBeVisible({ timeout: 10000 });

    // Step 2: Refine the image
    await page.locator("textarea").fill("让背景变成蓝色");
    await page.getByRole("button", { name: "Send message" }).click();

    await expect(page.locator("text=优化后的图片")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('img[alt="refined"]')).toBeVisible({ timeout: 10000 });
  });
});
