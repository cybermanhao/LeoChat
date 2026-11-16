import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolError, defineTool, run, userMessage, type AnyTool, type ToolResultBlock } from "@leochat/core";
import { scriptedProvider, textTurn, toolTurn } from "@leochat/core/testing";
import { mcpTools, toMcpHandler } from "../src/index";

type App = { role: "visitor" | "organizer"; tenant: string };

const TOKENS: Record<string, App> = {
  "tok-visitor": { role: "visitor", tenant: "A" },
  "tok-organizer": { role: "organizer", tenant: "A" },
};

const searchExhibitors = defineTool<z.ZodObject<{ query: z.ZodString }>, App>({
  name: "search_exhibitors",
  description: "Search exhibitors",
  input: z.object({ query: z.string() }),
  execute: ({ query }, ctx) => ({
    data: { tenant: ctx.app.tenant, query, results: ["EX-1"] },
    ui: { type: "cards", cards: [{ title: "Exhibitor 1", subtitle: query }] },
  }),
});
const funnel = defineTool<z.ZodObject<Record<string, never>>, App>({
  name: "inquiry_funnel",
  description: "Organizer analytics",
  input: z.object({}),
  execute: () => ({ content: "funnel" }),
});
const strict = defineTool<z.ZodObject<{ id: z.ZodString }>, App>({
  name: "get_exhibitor",
  description: "",
  input: z.object({ id: z.string().regex(/^EX-/) }),
  execute: ({ id }) => {
    if (id === "EX-404") throw new ToolError("Exhibitor not found");
    if (id === "EX-500") throw new Error("database password in stack trace");
    return { content: `exhibitor ${id}` };
  },
});
const favorite = defineTool<z.ZodObject<Record<string, never>>, App>({
  name: "favorite",
  description: "UI only",
  input: z.object({}),
  visibility: ["app"],
  execute: () => ({ content: "ok" }),
});

const ORGANIZER_ONLY = new Set(["inquiry_funnel"]);
const handler = toMcpHandler<App>({
  name: "expo-test",
  version: "0.0.1",
  tools: [searchExhibitors, funnel, strict, favorite] as AnyTool<App>[],
  resolveApp: (req) => TOKENS[req.headers.get("authorization")?.replace(/^Bearer /, "") ?? ""] ?? null,
  filter: (tool, app) => !ORGANIZER_ONLY.has(tool.name) || app.role === "organizer",
});

// 进程内投递：完整走 MCP over HTTP 协议，但不经过网络
const inProcessFetch = ((input: RequestInfo | URL, init?: RequestInit) => handler(new Request(input, init))) as typeof fetch;
const source = (token: string) =>
  mcpTools<App>({ url: "https://internal.invalid/mcp", fetch: inProcessFetch, headers: () => ({ Authorization: `Bearer ${token}` }) });

const listNames = async (token: string) => {
  const s = source(token);
  const tools = await s.list({ app: TOKENS[token]!, signal: new AbortController().signal });
  await s.release?.();
  return tools;
};

describe("toMcpHandler", () => {
  it("rejects requests without a valid identity", async () => {
    const res = await handler(new Request("https://internal.invalid/mcp", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
  });

  it("filters tools per identity and maps visibility to _meta.ui.visibility", async () => {
    const visitor = await listNames("tok-visitor");
    expect(visitor.map((t) => t.name).sort()).toEqual(["favorite", "get_exhibitor", "search_exhibitors"]);
    expect(visitor.find((t) => t.name === "favorite")?.visibility).toEqual(["app"]);
    const organizer = await listNames("tok-organizer");
    expect(organizer.map((t) => t.name)).toContain("inquiry_funnel");
    // 远程工具把服务端给的 JSON Schema 原样交给模型
    expect(visitor.find((t) => t.name === "get_exhibitor")?.jsonSchemaOverride).toMatchObject({
      type: "object",
      properties: { id: { type: "string" } },
    });
  });
});

describe("exposeApprovalTools (Q12)", () => {
  const send = defineTool<z.ZodObject<Record<string, never>>, App>({
    name: "send_inquiry",
    description: "",
    input: z.object({}),
    needsApproval: true,
    execute: () => ({ content: "sent" }),
  });
  const namesFor = async (expose?: boolean | string[]) => {
    const h = toMcpHandler<App>({
      name: "t",
      version: "0",
      tools: [searchExhibitors, send] as AnyTool<App>[],
      resolveApp: () => TOKENS["tok-visitor"]!,
      ...(expose !== undefined ? { exposeApprovalTools: expose } : {}),
    });
    const s = mcpTools<App>({ url: "https://internal.invalid/mcp", fetch: ((u: RequestInfo | URL, i?: RequestInit) => h(new Request(u, i))) as typeof fetch });
    const tools = await s.list({ app: TOKENS["tok-visitor"]!, signal: new AbortController().signal });
    await s.release?.();
    return tools.map((t) => t.name).sort();
  };

  it("hides tools that need approval unless the server config exposes them", async () => {
    expect(await namesFor()).toEqual(["search_exhibitors"]);
    expect(await namesFor(true)).toEqual(["search_exhibitors", "send_inquiry"]);
    expect(await namesFor(["send_inquiry"])).toEqual(["search_exhibitors", "send_inquiry"]);
    expect(await namesFor(["other"])).toEqual(["search_exhibitors"]);
  });
});

describe("mcpTools inside run()", () => {
  it("round-trips data and cards through _meta, and maps errors without leaking internals", async () => {
    const provider = scriptedProvider([
      toolTurn([
        { id: "c1", name: "search_exhibitors", args: { query: "robots" } },
        { id: "c2", name: "get_exhibitor", args: { id: "EX-404" } },
        { id: "c3", name: "get_exhibitor", args: { id: "EX-500" } },
        { id: "c4", name: "get_exhibitor", args: { id: "bad" } },
      ]),
      textTurn("done"),
    ]);
    const r = await run<App>({
      provider,
      model: "m",
      messages: [userMessage("find robots")],
      tools: [source("tok-visitor")],
      app: TOKENS["tok-visitor"]!,
    }).result;

    expect(r.reason).toBe("completed");
    // 只把模型可见的工具发给模型（favorite 是 app-only）
    expect(provider.requests[0]!.tools?.map((t) => t.name).sort()).toEqual(["get_exhibitor", "search_exhibitors"]);
    const results = r.transcript[2]!.content as ToolResultBlock[];
    expect(results[0]).toMatchObject({
      data: { tenant: "A", query: "robots" },
      ui: { type: "cards", cards: [{ title: "Exhibitor 1", subtitle: "robots" }] },
    });
    expect(results[0]!.isError).toBeFalsy();
    expect(results[1]).toMatchObject({ isError: true, content: [{ text: "Exhibitor not found" }] });
    expect(results[2]).toMatchObject({ isError: true, content: [{ text: "Tool execution failed" }] });
    expect(JSON.stringify(results[2])).not.toContain("password");
    // 远端 server 的 schema 校验失败也变成错误结果
    expect(results[3]!.isError).toBe(true);
  });
});
