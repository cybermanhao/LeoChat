import type { ChatMessage } from "@ai-chatbox/shared";

const API_BASE = "/api";

interface StreamCallbacks {
  onChunk: (chunk: { content: string; index: number }) => void;
  onToolCall?: (toolCall: { id: string; name: string; arguments: unknown }) => void;
  onToolResult?: (result: { id: string; result: unknown }) => void;
  onComplete: (message: ChatMessage) => void;
  onError: (error: Error) => void;
}

export const chatApi = {
  async streamChat(
    messages: ChatMessage[],
    callbacks: StreamCallbacks,
    signal?: AbortSignal
  ): Promise<void> {
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("No response body");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("event: ")) {
            // Event type parsed but currently unused
            continue;
          }
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);

              // Handle different event types based on data structure
              if ("content" in parsed && "index" in parsed) {
                callbacks.onChunk(parsed);
              } else if ("name" in parsed && "arguments" in parsed) {
                callbacks.onToolCall?.(parsed);
              } else if ("result" in parsed && "id" in parsed) {
                callbacks.onToolResult?.(parsed);
              } else if ("role" in parsed) {
                callbacks.onComplete(parsed);
              } else if ("error" in parsed) {
                callbacks.onError(new Error(parsed.error));
              }
            } catch (e) {
              // Ignore parse errors for incomplete data
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  },

  async chat(messages: ChatMessage[]): Promise<ChatMessage> {
    const response = await fetch(`${API_BASE}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  async getMCPSessions() {
    const response = await fetch(`${API_BASE}/mcp/sessions`);
    return response.json();
  },

  async getMCPTools() {
    const response = await fetch(`${API_BASE}/mcp/tools`);
    return response.json();
  },

  async callTool(name: string, args: Record<string, unknown>) {
    const response = await fetch(`${API_BASE}/mcp/tools/${name}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    return response.json();
  },

  async getLLMConfig(): Promise<{
    availableProviders: string[];
    defaultProvider: string;
    backendConfigured: boolean;
  }> {
    const response = await fetch(`${API_BASE}/llm/config`);
    return response.json();
  },
};
