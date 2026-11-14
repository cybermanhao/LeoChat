/**
 * 工具定义（设计文档 §3）。参数统一用 zod v4 定义（D11）。
 */
import { z } from "zod";
import type { ImageBlock, TextBlock } from "./blocks";
import type { JsonSchema, ToolDef } from "./provider";
import type { UiHint } from "./ui/types";

export interface ToolOutput {
  /** 给模型看的内容。省略时由 data 做 JSON.stringify 得到 */
  content?: Array<TextBlock | ImageBlock> | string;
  data?: unknown;
  ui?: UiHint;
  isError?: boolean;
}

export interface ToolContext<Ctx = unknown> {
  runId: string;
  callId: string;
  signal: AbortSignal;
  /** 应用传进来的按请求上下文：身份、租户、Workers bindings 等 */
  app: Ctx;
  /** 发出应用自定义事件（custom 事件），例如博客的 command */
  emit(name: string, data: unknown): void;
  /** 报告执行进度（C6），产生 tool_progress 事件 */
  update(progress: unknown): void;
}

export type ToolVisibility = "model" | "app";

export interface Tool<S extends z.ZodType = z.ZodType, Ctx = unknown> {
  name: string;
  description: string;
  /** 校验和类型推导都以它为准 */
  input: S;
  /** 只给远程工具用（mcp-kit）：直接发给模型的原始 JSON Schema，此时 input 一般为 z.unknown() */
  jsonSchemaOverride?: JsonSchema;
  /** 与 MCP Apps 对齐。'app' 表示只有界面能调用，不会发给模型。默认 ['model'] */
  visibility?: ToolVisibility[];
  /** 由工具自己决定这次调用要不要审批；返回字符串时，这个字符串就是审批理由 */
  needsApproval?:
    | boolean
    | ((input: z.infer<S>, ctx: ToolContext<Ctx>) => boolean | string | Promise<boolean | string>);
  /** 执行模式（C5）。默认 'parallel'；同一批调用里只要有一个 sequential，整批就串行 */
  executionMode?: "parallel" | "sequential";
  execute(input: z.infer<S>, ctx: ToolContext<Ctx>): ToolOutput | Promise<ToolOutput>;
}

/** 任意工具（用于集合类型）。execute 的入参在运行时由 input schema 校验 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyTool<Ctx = unknown> = Tool<any, Ctx>;

/** 写工具的辅助函数，负责类型推导 */
export function defineTool<S extends z.ZodType, Ctx = unknown>(tool: Tool<S, Ctx>): Tool<S, Ctx> {
  return tool;
}

/** 工具来源：静态数组、MCP server，以后还可以是 skills 等 */
export interface ToolSource<Ctx = unknown> {
  list(ctx: { app: Ctx; signal: AbortSignal }): Promise<AnyTool<Ctx>[]>;
}

export function isToolSource<Ctx>(x: AnyTool<Ctx> | ToolSource<Ctx>): x is ToolSource<Ctx> {
  return typeof (x as ToolSource<Ctx>).list === "function" && !("execute" in x);
}

/** 抛出这个错误表示业务错误：消息会给模型看，isError 为 true，不算系统故障 */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

export function isModelVisible(tool: AnyTool<unknown>): boolean {
  return (tool.visibility ?? ["model"]).includes("model");
}

/** 生成发给模型的工具定义 */
export function toToolDef(tool: AnyTool<unknown>): ToolDef {
  let inputSchema: JsonSchema;
  if (tool.jsonSchemaOverride) {
    inputSchema = tool.jsonSchemaOverride;
  } else {
    const { $schema: _ignored, ...rest } = z.toJSONSchema(tool.input) as JsonSchema;
    inputSchema = rest;
  }
  return { name: tool.name, description: tool.description, inputSchema };
}

export type ValidationResult = { ok: true; value: unknown } | { ok: false; error: string };

/** 按工具的 zod schema 校验参数；失败时给出可以直接给模型看的错误说明 */
export function validateToolInput(tool: AnyTool<unknown>, input: unknown): ValidationResult {
  const r = tool.input.safeParse(input);
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: z.prettifyError(r.error) };
}

/** 把 ToolOutput.content 归一成块数组；省略时由 data 序列化得到 */
export function normalizeToolContent(out: ToolOutput): Array<TextBlock | ImageBlock> {
  if (typeof out.content === "string") return [{ type: "text", text: out.content }];
  if (Array.isArray(out.content)) return out.content;
  if (out.data === undefined) return [{ type: "text", text: "" }];
  return [{ type: "text", text: typeof out.data === "string" ? out.data : JSON.stringify(out.data) }];
}
