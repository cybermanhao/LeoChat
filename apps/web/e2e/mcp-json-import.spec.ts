import { test, expect } from "@playwright/test";

const VALID_MCP_JSON = JSON.stringify({
  mcpServers: {
    memory: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-memory"],
    },
    fetch: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-fetch"],
      env: { API_KEY: "test-key" },
    },
    "remote-server": {
      url: "http://localhost:3001/mcp",
      transport: "streamable-http",
    },
  },
});

const INVALID_JSON = "{ invalid json }";

const NO_SERVERS_JSON = JSON.stringify({
  someOtherKey: "value",
});

test.describe("MCP JSON Import Flow", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/mcp/servers");
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
  });

  test("should navigate to JSON import mode from sidebar", async ({ page }) => {
    // Click "Import from JSON" button in the sidebar
    const importBtn = page.getByRole("button", { name: /从 JSON 导入/ });
    await expect(importBtn).toBeVisible();
    await importBtn.click();

    // Should navigate to add page with json mode
    await expect(page).toHaveURL(/\/mcp\/servers\/add\?mode=json/);

    // JSON tab should be active
    await expect(page.locator("textarea")).toBeVisible();
  });

  test("should parse and preview valid mcpServers JSON", async ({ page }) => {
    await page.goto("/mcp/servers/add?mode=json");

    const textarea = page.locator("textarea");
    await textarea.fill(VALID_MCP_JSON);

    // Click parse button
    const parseBtn = page.getByRole("button", { name: /解析配置|Parse Config/ });
    await parseBtn.click();

    // Should show preview with 3 servers
    await expect(page.getByTestId("mcp-import-server-memory")).toBeVisible();
    await expect(page.getByTestId("mcp-import-server-fetch")).toBeVisible();
    await expect(page.getByTestId("mcp-import-server-remote-server")).toBeVisible();

    // Should show transport badges
    await expect(page.locator("text=STDIO").first()).toBeVisible();
    await expect(page.locator("text=HTTP").first()).toBeVisible();
  });

  test("should import selected servers and navigate back to list", async ({ page }) => {
    await page.goto("/mcp/servers/add?mode=json");

    const textarea = page.locator("textarea");
    await textarea.fill(VALID_MCP_JSON);
    await page.getByRole("button", { name: /解析配置|Parse Config/ }).click();

    // Wait for preview
    await expect(page.getByTestId("mcp-import-server-memory")).toBeVisible();

    // All servers should be selected by default
    const selectedCount = page.locator("text=/已选择|Selected/");
    await expect(selectedCount).toContainText(/3/);

    // Click import button
    const importBtn = page.getByRole("button", { name: /导入选中项|Import Selected/ });
    await importBtn.click();

    // Should navigate back to server list
    await expect(page).toHaveURL(/\/mcp\/servers$/);

    // Servers should appear in the list (use more specific selector to avoid placeholder match)
    await expect(page.getByText("memory", { exact: true })).toBeVisible();
    await expect(page.getByText("fetch", { exact: true })).toBeVisible();
    await expect(page.getByText("remote-server", { exact: true })).toBeVisible();
  });

  test("should show error for invalid JSON", async ({ page }) => {
    await page.goto("/mcp/servers/add?mode=json");

    await page.locator("textarea").fill(INVALID_JSON);
    await page.getByRole("button", { name: /解析配置|Parse Config/ }).click();

    // Should show error message
    await expect(page.locator("text=/JSON 格式无效|Invalid JSON/")).toBeVisible();

    // Preview should not appear
    await expect(page.getByTestId("mcp-import-server-memory")).not.toBeVisible();
  });

  test("should show error for empty input", async ({ page }) => {
    await page.goto("/mcp/servers/add?mode=json");

    // Leave textarea empty and click parse
    await page.getByRole("button", { name: /解析配置|Parse Config/ }).click();

    await expect(page.locator("text=/请输入 JSON|Please enter JSON/")).toBeVisible();
  });

  test("should show error when no valid servers found", async ({ page }) => {
    await page.goto("/mcp/servers/add?mode=json");

    await page.locator("textarea").fill(NO_SERVERS_JSON);
    await page.getByRole("button", { name: /解析配置|Parse Config/ }).click();

    // NO_SERVERS_JSON has no valid server configs, so it shows errorNoValidServers
    await expect(page.locator("text=/未找到有效的服务器配置|No valid server configs/")).toBeVisible();
  });

  test("should support select all and deselect all", async ({ page }) => {
    await page.goto("/mcp/servers/add?mode=json");

    await page.locator("textarea").fill(VALID_MCP_JSON);
    await page.getByRole("button", { name: /解析配置|Parse Config/ }).click();

    await expect(page.getByTestId("mcp-import-server-memory")).toBeVisible();

    // Click deselect all
    const deselectAll = page.getByTestId("mcp-import-deselect-all");
    await deselectAll.click();

    // Import button should be disabled
    const importBtn = page.getByRole("button", { name: /导入选中项|Import Selected/ });
    await expect(importBtn).toBeDisabled();

    // Click select all
    const selectAll = page.getByTestId("mcp-import-select-all");
    await selectAll.click();

    // Import button should be enabled
    await expect(importBtn).toBeEnabled();
  });

  test("should switch between form and json tabs", async ({ page }) => {
    await page.goto("/mcp/servers/add");

    // Default should be form mode (textarea not visible, form inputs visible)
    await expect(page.locator("textarea")).not.toBeVisible();
    await expect(page.locator("input#name")).toBeVisible();

    // Click JSON tab (use role="tab" to distinguish from sidebar button)
    const jsonTab = page.getByRole("tab", { name: /JSON 导入|JSON Import/ });
    await jsonTab.click();

    // Now textarea should be visible
    await expect(page.locator("textarea")).toBeVisible();
    await expect(page.locator("input#name")).not.toBeVisible();

    // Click back to form tab
    const formTab = page.getByRole("tab", { name: /手动填写|Manual/ });
    await formTab.click();

    await expect(page.locator("textarea")).not.toBeVisible();
    await expect(page.locator("input#name")).toBeVisible();
  });

  test("should import only selected servers", async ({ page }) => {
    await page.goto("/mcp/servers/add?mode=json");

    await page.locator("textarea").fill(VALID_MCP_JSON);
    await page.getByRole("button", { name: /解析配置|Parse Config/ }).click();

    await expect(page.getByTestId("mcp-import-server-memory")).toBeVisible();

    // Deselect all first
    await page.getByRole("button", { name: /取消全选|Deselect All/ }).click();

    // Click only on memory row to select it
    await page.getByTestId("mcp-import-server-memory").click();

    // Import
    await page.getByRole("button", { name: /导入选中项|Import Selected/ }).click();

    // Navigate back
    await expect(page).toHaveURL(/\/mcp\/servers$/);

    // Only memory should be in the list
    await expect(page.getByText("memory", { exact: true })).toBeVisible();
    await expect(page.getByText("fetch", { exact: true })).not.toBeVisible();
    await expect(page.getByText("remote-server", { exact: true })).not.toBeVisible();
  });
});
