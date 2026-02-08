import type {
  ChatMessage,
  ToolCall,
  MCPTool,
  LLMConfig,
  LLMProvider,
  ModelAdapter,
} from "@ai-chatbox/shared";

/**
 * 模型适配器实例类型
 */
export interface ModelAdapterInstance extends ModelAdapter {}

/**
 * OpenRouter / OpenAI 适配器
 */
class OpenAIAdapter implements ModelAdapterInstance {
  getBaseURL(config: LLMConfig): string {
    if (config.provider === "openrouter") {
      return config.baseURL || "https://openrouter.ai/api/v1";
    }
    return config.baseURL || "https://api.openai.com/v1";
  }

  buildHeaders(config: LLMConfig): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
    };

    if (config.provider === "openrouter") {
      headers["HTTP-Referer"] = config.headers?.["HTTP-Referer"] || "https://leochat.app";
      headers["X-Title"] = config.headers?.["X-Title"] || "LeoChat";
    }

    return { ...headers, ...config.headers };
  }

  convertTools(tools: MCPTool[], _model: string): unknown {
    return tools.map(tool => ({
      type: "function",
      function: {
        name: tool.name,
        description: tool.description || "",
        parameters: tool.inputSchema,
      },
    }));
  }

  buildRequestBody(
    messages: ChatMessage[],
    tools: unknown,
    config: LLMConfig
  ): unknown {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: messages.map(m => this.convertMessage(m)),
      temperature: config.temperature ?? 0.7,
    };

    if (config.maxTokens) {
      body.max_tokens = config.maxTokens;
    }

    if (tools && Array.isArray(tools) && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = "auto";
    }

    return body;
  }

  private convertMessage(msg: ChatMessage): Record<string, unknown> {
    const result: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
    };

    if (msg.role === "tool" && msg.tool_call_id) {
      result.tool_call_id = msg.tool_call_id;
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      result.tool_calls = msg.tool_calls.map(tc => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));
    }

    return result;
  }

  parseStreamChunk(chunk: string, _model: string): {
    content_delta?: string;
    reasoning_delta?: string;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      name?: string;
      arguments_delta?: string;
    }>;
    finish_reason?: string;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  } {
    try {
      const parsed = JSON.parse(chunk);
      const delta = parsed.choices?.[0]?.delta;
      const finish_reason = parsed.choices?.[0]?.finish_reason;

      const result: {
        content_delta?: string;
        reasoning_delta?: string;
        tool_calls?: Array<{
          index?: number;
          id?: string;
          name?: string;
          arguments_delta?: string;
        }>;
        finish_reason?: string;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      } = {};

      if (delta?.content) {
        result.content_delta = delta.content;
      }

      // 处理推理内容（o1/DeepSeek 等模型）
      if (delta?.reasoning_content) {
        result.reasoning_delta = delta.reasoning_content;
      }

      // 处理工具调用
      if (delta?.tool_calls) {
        result.tool_calls = delta.tool_calls.map((tc: { index?: number; id?: string; function?: { name?: string; arguments?: string } }) => ({
          index: tc.index,
          id: tc.id,
          name: tc.function?.name,
          arguments_delta: tc.function?.arguments,
        }));
      }

      if (finish_reason) {
        result.finish_reason = finish_reason;
      }

      // 提取 usage（通常在最后一个 chunk 中）
      if (parsed.usage) {
        result.usage = {
          prompt_tokens: parsed.usage.prompt_tokens,
          completion_tokens: parsed.usage.completion_tokens,
        };
      }

      return result;
    } catch {
      return {};
    }
  }

  parseToolCalls(_message: unknown, _model: string): ToolCall[] {
    return [];
  }

  supportsReasoning(model: string): boolean {
    return model.includes("o1") ||
           model.includes("deepseek") ||
           model.includes("qwq");
  }
}

/**
 * Anthropic Claude 适配器
 */
class AnthropicAdapter implements ModelAdapterInstance {
  getBaseURL(config: LLMConfig): string {
    return config.baseURL || "https://api.anthropic.com/v1";
  }

  buildHeaders(config: LLMConfig): Record<string, string> {
    return {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      ...config.headers,
    };
  }

  convertTools(tools: MCPTool[], _model: string): unknown {
    // Claude 使用 input_schema 而非 parameters
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description || "",
      input_schema: tool.inputSchema,
    }));
  }

  buildRequestBody(
    messages: ChatMessage[],
    tools: unknown,
    config: LLMConfig
  ): unknown {
    // 分离 system 消息
    const systemMessages = messages.filter(m => m.role === "system");
    const otherMessages = messages.filter(m => m.role !== "system");

    const body: Record<string, unknown> = {
      model: config.model,
      messages: otherMessages.map(m => this.convertMessage(m)),
      max_tokens: config.maxTokens || 4096,
    };

    if (systemMessages.length > 0) {
      body.system = systemMessages.map(m => m.content).join("\n\n");
    }

    if (config.temperature !== undefined) {
      body.temperature = config.temperature;
    }

    if (tools && Array.isArray(tools) && tools.length > 0) {
      body.tools = tools;
    }

    return body;
  }

  private convertMessage(msg: ChatMessage): Record<string, unknown> {
    if (msg.role === "tool") {
      return {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.tool_call_id,
            content: msg.content,
          },
        ],
      };
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        role: "assistant",
        content: [
          ...(msg.content ? [{ type: "text", text: msg.content }] : []),
          ...msg.tool_calls.map(tc => ({
            type: "tool_use",
            id: tc.id,
            name: tc.name,
            input: tc.arguments,
          })),
        ],
      };
    }

    return {
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    };
  }

  parseStreamChunk(chunk: string, _model: string): {
    content_delta?: string;
    reasoning_delta?: string;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      name?: string;
      arguments_delta?: string;
    }>;
    finish_reason?: string;
  } {
    try {
      const parsed = JSON.parse(chunk);
      const result: {
        content_delta?: string;
        reasoning_delta?: string;
        tool_calls?: Array<{
          index?: number;
          id?: string;
          name?: string;
          arguments_delta?: string;
        }>;
        finish_reason?: string;
      } = {};

      // Claude 的事件格式
      if (parsed.type === "content_block_delta") {
        if (parsed.delta?.type === "text_delta") {
          result.content_delta = parsed.delta.text;
        } else if (parsed.delta?.type === "input_json_delta") {
          // 工具调用参数增量
          result.tool_calls = [{
            index: parsed.index,
            arguments_delta: parsed.delta.partial_json,
          }];
        }
      } else if (parsed.type === "content_block_start") {
        if (parsed.content_block?.type === "tool_use") {
          result.tool_calls = [{
            index: parsed.index,
            id: parsed.content_block.id,
            name: parsed.content_block.name,
          }];
        }
      } else if (parsed.type === "message_stop") {
        result.finish_reason = "stop";
      } else if (parsed.type === "message_delta") {
        if (parsed.delta?.stop_reason === "tool_use") {
          result.finish_reason = "tool_calls";
        } else if (parsed.delta?.stop_reason) {
          result.finish_reason = parsed.delta.stop_reason;
        }
      }

      return result;
    } catch {
      return {};
    }
  }

  parseToolCalls(_message: unknown, _model: string): ToolCall[] {
    return [];
  }

  supportsReasoning(_model: string): boolean {
    return false;
  }
}

/**
 * Google Gemini 适配器
 */
class GeminiAdapter implements ModelAdapterInstance {
  getBaseURL(config: LLMConfig): string {
    return config.baseURL || "https://generativelanguage.googleapis.com/v1beta";
  }

  buildHeaders(config: LLMConfig): Record<string, string> {
    return {
      "x-goog-api-key": config.apiKey,
      ...config.headers,
    };
  }

  convertTools(tools: MCPTool[], _model: string): unknown {
    return {
      functionDeclarations: tools.map(tool => ({
        name: tool.name,
        description: tool.description || "",
        parameters: tool.inputSchema,
      })),
    };
  }

  buildRequestBody(
    messages: ChatMessage[],
    tools: unknown,
    config: LLMConfig
  ): unknown {
    // Gemini 使用 contents 格式
    const contents = messages
      .filter(m => m.role !== "system")
      .map(m => this.convertMessage(m));

    const systemInstruction = messages
      .filter(m => m.role === "system")
      .map(m => m.content)
      .join("\n\n");

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: config.temperature ?? 0.7,
        maxOutputTokens: config.maxTokens,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    if (tools) {
      body.tools = [tools];
    }

    return body;
  }

  private convertMessage(msg: ChatMessage): Record<string, unknown> {
    const role = msg.role === "assistant" ? "model" : "user";

    if (msg.role === "tool") {
      return {
        role: "function",
        parts: [{
          functionResponse: {
            name: msg.tool_call_id, // Gemini 使用函数名
            response: { result: msg.content },
          },
        }],
      };
    }

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      return {
        role: "model",
        parts: [
          ...(msg.content ? [{ text: msg.content }] : []),
          ...msg.tool_calls.map(tc => ({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          })),
        ],
      };
    }

    return {
      role,
      parts: [{ text: msg.content }],
    };
  }

  parseStreamChunk(chunk: string, _model: string): {
    content_delta?: string;
    reasoning_delta?: string;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      name?: string;
      arguments_delta?: string;
    }>;
    finish_reason?: string;
  } {
    try {
      const parsed = JSON.parse(chunk);
      const result: {
        content_delta?: string;
        reasoning_delta?: string;
        tool_calls?: Array<{
          index?: number;
          id?: string;
          name?: string;
          arguments_delta?: string;
        }>;
        finish_reason?: string;
      } = {};

      const candidate = parsed.candidates?.[0];
      if (candidate?.content?.parts) {
        for (const part of candidate.content.parts) {
          if (part.text) {
            result.content_delta = part.text;
          }
          if (part.functionCall) {
            result.tool_calls = [{
              index: 0,
              id: `fc_${Date.now()}`,
              name: part.functionCall.name,
              arguments_delta: JSON.stringify(part.functionCall.args),
            }];
          }
        }
      }

      if (candidate?.finishReason) {
        result.finish_reason = candidate.finishReason === "STOP" ? "stop" : candidate.finishReason;
      }

      return result;
    } catch {
      return {};
    }
  }

  parseToolCalls(_message: unknown, _model: string): ToolCall[] {
    return [];
  }

  supportsReasoning(model: string): boolean {
    return model.includes("thinking") || model.includes("2.0-flash-thinking");
  }
}

/**
 * DeepSeek 适配器（基于 OpenAI 格式）
 */
class DeepSeekAdapter extends OpenAIAdapter {
  getBaseURL(config: LLMConfig): string {
    return config.baseURL || "https://api.deepseek.com/v1";
  }

  supportsReasoning(model: string): boolean {
    return model.includes("reasoner") || model.includes("r1");
  }
}

/**
 * 创建模型适配器
 */
export function createModelAdapter(provider: LLMProvider): ModelAdapterInstance {
  switch (provider) {
    case "openrouter":
    case "openai":
      return new OpenAIAdapter();
    case "anthropic":
      return new AnthropicAdapter();
    case "google":
      return new GeminiAdapter();
    case "deepseek":
      return new DeepSeekAdapter();
    case "custom":
    default:
      // 默认使用 OpenAI 兼容格式
      return new OpenAIAdapter();
  }
}

/**
 * 获取支持的提供商列表
 */
export function getSupportedProviders(): LLMProvider[] {
  return ["openrouter", "openai", "anthropic", "google", "deepseek", "custom"];
}
