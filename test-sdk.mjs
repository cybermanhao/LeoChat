/**
 * LeoAgent SDK 端到端测试
 * 连接 ecommerce MCP server，执行商品搜索
 *
 * 运行：node --env-file=.env test-sdk.mjs
 */

import { LeoAgent } from "./packages/leochat-sdk/dist/index.js";

// 修正 cwd 占位符（mcp.test.json 中 ${PWD} 指向项目根）
process.env.PWD = process.cwd();

const agent = new LeoAgent();
agent.loadConfig("./mcp.test.json");

// 注册工具调用日志
agent.onToolCall((tc) => {
  console.error(`\n→ [tool] ${tc.name}`, JSON.stringify(tc.arguments).slice(0, 100));
  return tc;
});
agent.onToolCalled((id, result) => {
  console.error(`← [done] ${id}`);
  return result;
});

console.error("=== Test 1: 搜索商品 ===\n");

try {
  const result = await agent.ainvoke("帮我搜索一下耳机");

  console.error("\n--- Result ---");
  console.error("text:", result.text.slice(0, 200));
  console.error("toolCalls:", result.toolCalls.length);
  console.error("usage:", result.usage);
  console.error("history messages:", result.history.length);

  // Test 2: 多轮对话
  console.error("\n=== Test 2: 多轮对话（带历史）===\n");

  const result2 = await agent.ainvoke({
    messages: "第一个产品的详情是什么？",
    history: result.history,
  });

  console.error("\n--- Result 2 ---");
  console.error("text:", result2.text.slice(0, 200));
  console.error("history messages:", result2.history.length);

  console.error("\n✅ All tests passed");
} catch (e) {
  console.error("\n❌ Error:", e.message);
  if (e.stack) console.error(e.stack);
  process.exit(1);
} finally {
  await agent.disconnect();
}
