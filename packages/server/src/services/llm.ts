import OpenAI from "openai";
import type { ChatMessage, ToolCall } from "@ai-chatbox/shared";
import { generateId, API_ENDPOINTS, DEFAULT_MODELS } from "@ai-chatbox/shared";

export type LLMProvider = "deepseek" | "openrouter" | "openai" | "moonshot";

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  provider?: LLMProvider;
  temperature?: number;
  maxTokens?: number;
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
}

export interface StreamCallbacks {
  onChunk: (chunk: { content: string; reasoning?: string; index: number }) => Promise<void>;
  onToolCall: (toolCall: ToolCall) => Promise<void>;
  onComplete: (message: ChatMessage) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}

/**
 * 通用 LLM 服务，支持多个提供商
 */
export class LLMService {
  private clients: Map<LLMProvider, OpenAI> = new Map();
  private defaultProvider: LLMProvider = "deepseek";

  constructor() {
    this.initializeClients();
  }

  /**
   * 初始化所有可用的客户端
   */
  private initializeClients(): void {
    // DeepSeek
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (deepseekKey) {
      this.clients.set("deepseek", new OpenAI({
        apiKey: deepseekKey,
        baseURL: API_ENDPOINTS.DEEPSEEK,
      }));
      console.log("[LLM] DeepSeek client initialized");
    }

    // OpenRouter
    const openrouterKey = process.env.OPENROUTER_API_KEY;
    if (openrouterKey) {
      this.clients.set("openrouter", new OpenAI({
        apiKey: openrouterKey,
        baseURL: API_ENDPOINTS.OPENROUTER,
        defaultHeaders: {
          "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
          "X-Title": "LeoChat",
        },
      }));
      console.log("[LLM] OpenRouter client initialized");
    }

    // OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      this.clients.set("openai", new OpenAI({
        apiKey: openaiKey,
        baseURL: API_ENDPOINTS.OPENAI,
      }));
      console.log("[LLM] OpenAI client initialized");
    }

    // Moonshot
    const moonshotKey = process.env.MOONSHOT_API_KEY;
    if (moonshotKey) {
      this.clients.set("moonshot", new OpenAI({
        apiKey: moonshotKey,
        baseURL: API_ENDPOINTS.MOONSHOT,
      }));
      console.log("[LLM] Moonshot client initialized");
    }

    // 确定默认提供商
    if (this.clients.has("deepseek")) {
      this.defaultProvider = "deepseek";
    } else if (this.clients.has("openrouter")) {
      this.defaultProvider = "openrouter";
    } else if (this.clients.has("openai")) {
      this.defaultProvider = "openai";
    } else if (this.clients.has("moonshot")) {
      this.defaultProvider = "moonshot";
    }

    console.log(`[LLM] Default provider: ${this.defaultProvider}`);
  }

  /**
   * 动态设置 API Key（从前端 UI 配置）
   */
  setApiKey(provider: LLMProvider, apiKey: string): void {
    if (!apiKey) return;

    const baseURLs: Record<LLMProvider, string> = {
      deepseek: API_ENDPOINTS.DEEPSEEK,
      openrouter: API_ENDPOINTS.OPENROUTER,
      openai: API_ENDPOINTS.OPENAI,
      moonshot: API_ENDPOINTS.MOONSHOT,
    };

    const options: ConstructorParameters<typeof OpenAI>[0] = {
      apiKey,
      baseURL: baseURLs[provider],
    };

    if (provider === "openrouter") {
      options.defaultHeaders = {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "LeoChat",
      };
    }

    this.clients.set(provider, new OpenAI(options));
    console.log(`[LLM] ${provider} client configured via UI`);

    // 更新默认提供商（如果之前没有任何 client）
    if (this.clients.size === 1) {
      this.defaultProvider = provider;
    }
  }

  /**
   * 获取可用的提供商列表
   */
  getAvailableProviders(): LLMProvider[] {
    return Array.from(this.clients.keys());
  }

  /**
   * 获取默认提供商
   */
  getDefaultProvider(): LLMProvider {
    return this.defaultProvider;
  }

  /**
   * 根据模型名称推断提供商
   */
  private inferProvider(model: string): LLMProvider {
    if (model.startsWith("deepseek")) {
      return "deepseek";
    }
    if (model.includes("/")) {
      // OpenRouter 模型格式: provider/model
      return "openrouter";
    }
    if (model.startsWith("gpt-")) {
      return "openai";
    }
    if (model.startsWith("moonshot-")) {
      return "moonshot";
    }
    return this.defaultProvider;
  }

  /**
   * 获取客户端
   */
  private getClient(provider?: LLMProvider, model?: string): OpenAI {
    const resolvedProvider = provider || (model ? this.inferProvider(model) : this.defaultProvider);
    const client = this.clients.get(resolvedProvider);

    if (!client) {
      // 回退到任何可用的客户端
      const fallbackClient = this.clients.values().next().value;
      if (!fallbackClient) {
        throw new Error("No LLM API key configured. Please set DEEPSEEK_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY");
      }
      return fallbackClient;
    }

    return client;
  }

  /**
   * Convert internal message format to OpenAI format
   */
  private toOpenAIMessages(
    messages: ChatMessage[]
  ): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map((msg): OpenAI.Chat.ChatCompletionMessageParam => {
      if (msg.role === "tool") {
        return {
          role: "tool",
          content: msg.content,
          tool_call_id: msg.tool_call_id || "",
        };
      }
      if (msg.role === "assistant" && msg.tool_calls?.length) {
        return {
          role: "assistant",
          content: msg.content || null,
          tool_calls: msg.tool_calls.map(tc => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }
      return {
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content,
      };
    });
  }

  /**
   * Non-streaming chat completion
   */
  async chat(request: ChatRequest): Promise<ChatMessage> {
    const client = this.getClient(request.provider, request.model);
    const model = request.model || DEFAULT_MODELS.CHAT;

    const response = await client.chat.completions.create({
      model,
      messages: this.toOpenAIMessages(request.messages),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      tools: request.tools,
      stream: false,
    });

    const choice = response.choices[0];
    return {
      id: generateId(),
      role: "assistant",
      content: choice.message.content || "",
      timestamp: Date.now(),
      metadata: {
        model: response.model,
        tokens: {
          input: response.usage?.prompt_tokens || 0,
          output: response.usage?.completion_tokens || 0,
        },
      },
    };
  }

  /**
   * Streaming chat completion
   */
  async streamChat(
    request: ChatRequest,
    callbacks: StreamCallbacks
  ): Promise<void> {
    const client = this.getClient(request.provider, request.model);
    const model = request.model || DEFAULT_MODELS.CHAT;

    const stream = await client.chat.completions.create({
      model,
      messages: this.toOpenAIMessages(request.messages),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      tools: request.tools,
      stream: true,
    });

    let content = "";
    let reasoning = "";
    let chunkIndex = 0;
    const toolCalls: Map<number, { id: string; name: string; arguments: string | Record<string, unknown>; status: ToolCall["status"] }> = new Map();

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (!delta) continue;

        // Handle content
        if (delta.content) {
          content += delta.content;
          await callbacks.onChunk({
            content: delta.content,
            index: chunkIndex++,
          });
        }

        // Handle reasoning content (DeepSeek R1)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reasoningContent = (delta as any).reasoning_content;
        if (reasoningContent) {
          reasoning += reasoningContent;
          await callbacks.onChunk({
            content: "",
            reasoning: reasoningContent,
            index: chunkIndex++,
          });
        }

        // Handle tool calls
        if (delta.tool_calls) {
          for (const toolCallDelta of delta.tool_calls) {
            const index = toolCallDelta.index;

            if (!toolCalls.has(index)) {
              toolCalls.set(index, {
                id: toolCallDelta.id || generateId(),
                name: toolCallDelta.function?.name || "",
                arguments: {},
                status: "pending",
              });
            }

            const toolCall = toolCalls.get(index)!;

            if (toolCallDelta.function?.name) {
              toolCall.name = toolCallDelta.function.name;
            }

            if (toolCallDelta.function?.arguments) {
              const currentArgs =
                typeof toolCall.arguments === "string"
                  ? toolCall.arguments
                  : "";
              toolCall.arguments = currentArgs + toolCallDelta.function.arguments;
            }
          }
        }

        // Check for finish reason
        const finishReason = chunk.choices[0]?.finish_reason;
        if (finishReason === "tool_calls") {
          for (const tc of toolCalls.values()) {
            let parsedArgs: Record<string, unknown>;
            try {
              parsedArgs =
                typeof tc.arguments === "string"
                  ? JSON.parse(tc.arguments)
                  : tc.arguments;
            } catch {
              parsedArgs = { raw: tc.arguments };
            }
            const toolCall: ToolCall = {
              id: tc.id,
              name: tc.name,
              arguments: parsedArgs,
              status: tc.status,
            };
            await callbacks.onToolCall(toolCall);
          }
        }
      }

      // Convert toolCalls to proper ToolCall format
      const finalToolCalls: ToolCall[] = [];
      for (const tc of toolCalls.values()) {
        let parsedArgs: Record<string, unknown>;
        if (typeof tc.arguments === "string") {
          try {
            parsedArgs = JSON.parse(tc.arguments);
          } catch {
            parsedArgs = { raw: tc.arguments };
          }
        } else {
          parsedArgs = tc.arguments;
        }
        finalToolCalls.push({
          id: tc.id,
          name: tc.name,
          arguments: parsedArgs,
          status: tc.status,
        });
      }

      // Complete
      await callbacks.onComplete({
        id: generateId(),
        role: "assistant",
        content,
        reasoning_content: reasoning || undefined,
        timestamp: Date.now(),
        metadata: {
          model,
          toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
        },
      });
    } catch (error) {
      await callbacks.onError(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }
}
