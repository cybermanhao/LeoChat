import OpenAI from "openai";
import type { ChatMessage, ToolCall } from "@ai-chatbox/shared";
import { generateId } from "@ai-chatbox/shared";
import { API_ENDPOINTS, DEFAULT_MODELS } from "@ai-chatbox/shared";

export interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
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
  onChunk: (chunk: { content: string; index: number }) => Promise<void>;
  onToolCall: (toolCall: ToolCall) => Promise<void>;
  onComplete: (message: ChatMessage) => Promise<void>;
  onError: (error: Error) => Promise<void>;
}

export class OpenRouterService {
  private client: OpenAI;
  private defaultModel: string;

  constructor(apiKey?: string) {
    this.client = new OpenAI({
      apiKey: apiKey || process.env.OPENROUTER_API_KEY || "",
      baseURL: API_ENDPOINTS.OPENROUTER,
      defaultHeaders: {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "AI Chatbox MCP",
      },
    });
    this.defaultModel = DEFAULT_MODELS.CHAT;
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
    const response = await this.client.chat.completions.create({
      model: request.model || this.defaultModel,
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
    const stream = await this.client.chat.completions.create({
      model: request.model || this.defaultModel,
      messages: this.toOpenAIMessages(request.messages),
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens,
      tools: request.tools,
      stream: true,
    });

    let content = "";
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
              // Accumulate arguments string
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
          // Parse and emit tool calls
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
        timestamp: Date.now(),
        metadata: {
          model: request.model || this.defaultModel,
          toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
        },
      });
    } catch (error) {
      await callbacks.onError(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Set API key at runtime
   */
  setApiKey(apiKey: string): void {
    this.client = new OpenAI({
      apiKey,
      baseURL: API_ENDPOINTS.OPENROUTER,
      defaultHeaders: {
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "AI Chatbox MCP",
      },
    });
  }

  /**
   * Set default model
   */
  setDefaultModel(model: string): void {
    this.defaultModel = model;
  }
}
