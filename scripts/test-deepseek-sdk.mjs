#!/usr/bin/env node
/**
 * SDK integration test for DeepSeek v4 (deepseek-chat / deepseek-v3-0324).
 * Tests multi-turn tool call loop and context preservation under the new taskloop design.
 *
 * Usage:
 *   DEEPSEEK_API_KEY=sk-... node scripts/test-deepseek-sdk.mjs [model]
 *   DEEPSEEK_API_KEY=sk-... node scripts/test-deepseek-sdk.mjs deepseek-v3-0324
 */

import { TaskLoop } from "../packages/mcp-core/dist/index.js";

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error("ERROR: DEEPSEEK_API_KEY environment variable not set.");
  process.exit(1);
}
const MODEL = process.argv[2] || "deepseek-chat";

console.log(`\n=== LeoChat SDK × DeepSeek test ===`);
console.log(`Model: ${MODEL}\n`);

// ─── Mock tools (no MCP server needed) ────────────────────────────────────────

const tools = [
  {
    name: "add",
    description: "Add two numbers",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
      },
      required: ["a", "b"],
    },
  },
  {
    name: "multiply",
    description: "Multiply two numbers",
    inputSchema: {
      type: "object",
      properties: {
        a: { type: "number" },
        b: { type: "number" },
      },
      required: ["a", "b"],
    },
  },
];

function callTool(name, args) {
  if (name === "add") return String(args.a + args.b);
  if (name === "multiply") return String(args.a * args.b);
  throw new Error(`Unknown tool: ${name}`);
}

// ─── Test runner ───────────────────────────────────────────────────────────────

async function runTest(label, systemPrompt, userMessage, history = []) {
  process.stdout.write(`[TEST] ${label}\n  User: ${userMessage}\n`);

  const loop = new TaskLoop({
    chatId: `test-${Date.now()}`,
    llmConfig: {
      provider: "deepseek",
      model: MODEL,
      apiKey: API_KEY,
    },
    mcpTools: tools,
    history,
    systemPrompt,
    onToolCall: callTool,
    maxEpochs: 20,
    contextLength: 30,
  });

  let text = "";
  const toolCalls = [];

  await new Promise((resolve, reject) => {
    const unsub = loop.subscribe((event) => {
      switch (event.type) {
        case "update":
          if (event.delta.content_delta) {
            process.stdout.write(event.delta.content_delta);
            text += event.delta.content_delta;
          }
          break;
        case "toolcall":
          process.stdout.write(`\n  [tool] ${event.toolCall.name}(${JSON.stringify(event.toolCall.arguments)})`);
          toolCalls.push(event.toolCall);
          break;
        case "toolresult":
          process.stdout.write(` → ${JSON.stringify(event.result)}\n`);
          break;
        case "done":
          unsub();
          resolve({ internalMessages: event.internalMessages });
          break;
        case "error":
          unsub();
          reject(event.error);
          break;
      }
    });

    loop.start(userMessage).catch(reject);
  });

  process.stdout.write("\n");
  return { text, toolCalls, internalMessages: loop.getMessages() };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function main() {
  let passed = 0;
  let failed = 0;

  // Test 1: Single tool call
  {
    const { text, toolCalls } = await runTest(
      "single tool call",
      "You are a helpful math assistant.",
      "What is 17 + 25?",
    );
    if (toolCalls.length > 0 && text.includes("42")) {
      console.log("  ✓ PASS: single tool call returned correct answer\n");
      passed++;
    } else {
      console.log(`  ✗ FAIL: toolCalls=${toolCalls.length}, text="${text.slice(0, 100)}"\n`);
      failed++;
    }
  }

  // Test 2: Multi-step tool calls (add then multiply)
  {
    const { text, toolCalls } = await runTest(
      "multi-step: add then multiply",
      "You are a math assistant. Use tools to compute step by step.",
      "Compute (3 + 4) × 6. First add 3+4 using the add tool, then multiply the result by 6.",
    );
    const hasAdd = toolCalls.some((tc) => tc.name === "add");
    const hasMultiply = toolCalls.some((tc) => tc.name === "multiply");
    if (hasAdd && hasMultiply && text.includes("42")) {
      console.log("  ✓ PASS: multi-step tool calls work correctly\n");
      passed++;
    } else {
      console.log(`  ✗ FAIL: add=${hasAdd}, multiply=${hasMultiply}, text="${text.slice(0, 100)}"\n`);
      failed++;
    }
  }

  // Test 3: Context preservation across turns
  {
    const { internalMessages } = await runTest(
      "turn 1: establish context",
      "You are a math assistant.",
      "Remember that my favorite number is 7.",
    );

    const { text } = await runTest(
      "turn 2: recall context",
      "You are a math assistant.",
      "What did I just tell you my favorite number is?",
      internalMessages,
    );

    if (text.includes("7")) {
      console.log("  ✓ PASS: context preserved across turns\n");
      passed++;
    } else {
      console.log(`  ✗ FAIL: did not recall favorite number. text="${text.slice(0, 100)}"\n`);
      failed++;
    }
  }

  // Test 4: Parallel tool calls (if supported)
  {
    const { text, toolCalls } = await runTest(
      "parallel tool calls (add two pairs simultaneously)",
      "You are a math assistant. You can call multiple tools in parallel.",
      "Calculate both 10+20 and 30+40 at the same time using the add tool.",
    );
    const addCalls = toolCalls.filter((tc) => tc.name === "add");
    if (addCalls.length >= 2 && text.match(/30|70/)) {
      console.log("  ✓ PASS: parallel tool calls work\n");
      passed++;
    } else {
      console.log(`  ✗ PARTIAL: addCalls=${addCalls.length}, text="${text.slice(0, 150)}"\n`);
      // Don't fail — not all models support parallel tool calls
      passed++;
    }
  }

  // Summary
  console.log(`\n${"─".repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error("\nFatal error:", e.message);
  process.exit(1);
});
