import { TaskLoop, MCPClient } from "@ai-chatbox/mcp-core";
import type {
  MCPServerConfig,
  MCPTool,
  ToolCall,
  ChatMessage,
} from "@ai-chatbox/shared";
import { buildSystemPrompt } from "./context";
import { filterHistory, replayableToInternal } from "./history";
import { loadConfig } from "./config";
import { listSkills, skillToContextSlot } from "./skill";
import type {
  AgentResult,
  AinvokeOptions,
  ContextSlot,
  LLMConfig,
  SkillMeta,
  SdkMCPServerConfig,
  ToolCallRecord,
} from "./types";

type ToolCallHook = (toolCall: ToolCall) => ToolCall;
type ToolCalledHook = (toolCallId: string, result: unknown) => unknown;

/**
 * LeoChat Agent SDK 高层 API。
 *
 * 用法：
 * ```ts
 * const agent = new LeoAgent();
 * agent.loadConfig("./mcp.json");
 * const result = await agent.ainvoke("帮我查一下耳机库存");
 * console.log(result.text);
 * ```
 */
export class LeoAgent {
  private llmConfig?: LLMConfig;
  private systemPromptBase: string = "";
  private mcpServerConfigs: Array<{ name: string; config: SdkMCPServerConfig }> = [];
  private mcpClients: MCPClient[] = [];
  private skillsDir?: string;
  private cachedSkills?: SkillMeta[];
  private toolCallHooks: ToolCallHook[] = [];
  private toolCalledHooks: ToolCalledHook[] = [];
  private connected = false;

  // ─── 配置 API ────────────────────────────────────────────────────

  /**
   * 从 JSON 文件加载配置（兼容 Claude Desktop 格式）。
   * 支持 ${ENV_VAR} 占位符自动展开。
   */
  loadConfig(configPath: string): this {
    const config = loadConfig(configPath);
    if (config.defaultLLM) {
      this.llmConfig = config.defaultLLM;
    }
    if (config.systemPrompt) {
      this.systemPromptBase = config.systemPrompt;
    }
    if (config.mcpServers) {
      for (const [name, serverConfig] of Object.entries(config.mcpServers)) {
        this.mcpServerConfigs.push({ name, config: serverConfig });
      }
    }
    return this;
  }

  /** 设置 LLM 配置（覆盖 loadConfig 中的 defaultLLM） */
  setLLM(config: LLMConfig): this {
    this.llmConfig = config;
    return this;
  }

  /** 覆盖模型名称（保留其他 LLM 配置不变） */
  setModel(model: string): this {
    if (this.llmConfig) {
      this.llmConfig = { ...this.llmConfig, model };
    } else {
      // 没有现有配置时，创建最小配置（provider/apiKey 需从配置文件或环境变量获取）
      this.llmConfig = { provider: "openrouter" as any, model, apiKey: "" };
    }
    return this;
  }

  /** 设置基础 system prompt */
  setSystemPrompt(prompt: string): this {
    this.systemPromptBase = prompt;
    return this;
  }

  /** 添加 MCP server */
  addMCPServer(name: string, config: SdkMCPServerConfig): this {
    this.mcpServerConfigs.push({ name, config });
    this.connected = false; // 强制重连
    return this;
  }

  /**
   * 加载 skill 目录。
   * 调用后可通过 ainvoke({ skill: "name" }) 显式激活某个 skill，
   * 或通过 agent.listSkills() 查看可用 skill 列表。
   */
  loadSkills(dir: string): this {
    this.skillsDir = dir;
    this.cachedSkills = undefined; // 清除缓存
    return this;
  }

  /** 注册工具调用前拦截钩子（可修改参数）。对应 TaskLoop.registerOnToolCall。 */
  onToolCall(handler: ToolCallHook): this {
    this.toolCallHooks.push(handler);
    return this;
  }

  /** 注册工具调用后拦截钩子（可修改结果）。对应 TaskLoop.registerOnToolCalled。 */
  onToolCalled(handler: ToolCalledHook): this {
    this.toolCalledHooks.push(handler);
    return this;
  }

  // ─── 查询 API ────────────────────────────────────────────────────

  /** 列出已加载目录中的所有 skill 元数据（不加载正文）。 */
  listSkills(): SkillMeta[] {
    if (!this.skillsDir) return [];
    if (!this.cachedSkills) {
      this.cachedSkills = listSkills(this.skillsDir);
    }
    return this.cachedSkills;
  }

  // ─── 执行 API ────────────────────────────────────────────────────

  /**
   * 执行一次 agent 调用。
   *
   * @param input 用户消息（字符串）或带历史/skill 的对象
   */
  async ainvoke(input: string | AinvokeOptions): Promise<AgentResult> {
    if (!this.llmConfig) {
      throw new Error(
        "[leochat-sdk] LLM not configured. Call setLLM() or loadConfig() first."
      );
    }

    const userMessage = typeof input === "string" ? input : input.messages;
    const history = typeof input === "object" ? input.history : undefined;
    const skillName = typeof input === "object" ? input.skill : undefined;

    // 1. 连接 MCP servers（懒连接，首次或新增 server 后重连）
    const allTools = await this.ensureConnected();

    // 2. 构建 system prompt（base + skill slots）
    const slots: ContextSlot[] = [];
    if (skillName) {
      const skill = this.listSkills().find((s) => s.name === skillName);
      if (!skill) {
        throw new Error(`[leochat-sdk] Skill "${skillName}" not found. Available: ${this.listSkills().map(s => s.name).join(", ")}`);
      }
      slots.push(skillToContextSlot(skill.dir));
    }
    const systemPrompt = buildSystemPrompt(this.systemPromptBase, slots);

    // 3. 构建历史（把 ReplayableMessage 转回内部格式）
    const internalHistory: ChatMessage[] = history
      ? replayableToInternal(history)
      : [];

    // 4. 创建 TaskLoop
    const loop = new TaskLoop({
      chatId: `sdk-${Date.now()}`,
      llmConfig: this.llmConfig,
      mcpTools: allTools,
      history: internalHistory,
      systemPrompt: systemPrompt || undefined,
      onToolCall: (name, args) => this.dispatchToolCall(name, args),
      useBackendProxy: false, // SDK 上下文禁用后端代理
    });

    // 5. 注册用户的钩子
    for (const hook of this.toolCallHooks) {
      loop.registerOnToolCall(hook);
    }
    for (const hook of this.toolCalledHooks) {
      loop.registerOnToolCalled(hook);
    }

    // 6. 执行并收集结果
    return this.runLoop(loop, userMessage);
  }

  /**
   * 检查所有已配置的 MCP server 连接状态。
   * 返回每个 server 的连接结果（名称、状态、工具数、错误信息）。
   */
  async checkConnections(): Promise<Array<{
    name: string;
    status: "connected" | "error";
    tools: number;
    error?: string;
  }>> {
    const results: Array<{
      name: string;
      status: "connected" | "error";
      tools: number;
      error?: string;
    }> = [];

    // 强制重连以获取最新状态
    this.connected = false;

    for (const { name, config } of this.mcpServerConfigs) {
      const serverConfig: MCPServerConfig = {
        id: name,
        name,
        transport: config.transport ?? (config.url ? "streamable-http" : "stdio"),
        command: config.command,
        args: config.args,
        cwd: config.cwd,
        url: config.url,
        env: config.env,
      };
      const client = new MCPClient({ config: serverConfig });
      try {
        await client.connect();
        results.push({
          name,
          status: "connected",
          tools: client.availableTools.length,
        });
        await client.disconnect().catch(() => {});
      } catch (e) {
        results.push({
          name,
          status: "error",
          tools: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return results;
  }

  /** 获取当前 LLM 配置（用于诊断） */
  getLLMConfig(): LLMConfig | undefined {
    return this.llmConfig;
  }

  /** 断开所有 MCP 连接 */
  async disconnect(): Promise<void> {
    await Promise.all(this.mcpClients.map((c) => c.disconnect()));
    this.mcpClients = [];
    this.connected = false;
  }

  // ─── 内部实现 ─────────────────────────────────────────────────────

  private async ensureConnected(): Promise<MCPTool[]> {
    if (this.connected && this.mcpClients.length > 0) {
      return this.mcpClients.flatMap((c) => c.availableTools);
    }

    // 断开旧连接
    if (this.mcpClients.length > 0) {
      await Promise.all(this.mcpClients.map((c) => c.disconnect().catch(() => {})));
      this.mcpClients = [];
    }

    // 连接新 server
    const clients = this.mcpServerConfigs.map(({ name, config }) => {
      const serverConfig: MCPServerConfig = {
        id: name,
        name,
        transport: config.transport ?? (config.url ? "streamable-http" : "stdio"),
        command: config.command,
        args: config.args,
        cwd: config.cwd,
        url: config.url,
        env: config.env,
      };
      return new MCPClient({ config: serverConfig });
    });

    await Promise.allSettled(
      clients.map((client) =>
        client.connect().catch((e) => {
          console.warn(`[leochat-sdk] Failed to connect MCP server "${client.serverName}": ${e.message}`);
        })
      )
    );

    this.mcpClients = clients;
    this.connected = true;

    return clients.flatMap((c) => c.availableTools);
  }

  /** 找到持有该工具的 MCP client 并执行调用 */
  private async dispatchToolCall(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    for (const client of this.mcpClients) {
      const hasTool = client.availableTools.some((t) => t.name === name);
      if (hasTool) {
        return client.callTool(name, args);
      }
    }
    throw new Error(`[leochat-sdk] No MCP server has tool "${name}"`);
  }

  /** 运行 TaskLoop，收集事件，返回 AgentResult */
  private runLoop(loop: TaskLoop, userMessage: string): Promise<AgentResult> {
    return new Promise((resolve, reject) => {
      let text = "";
      const toolCallMap = new Map<string, ToolCallRecord>();
      let usage = { input: 0, output: 0 };

      const unsubscribe = loop.subscribe((event) => {
        switch (event.type) {
          case "update":
            if (event.delta.content_delta) {
              text += event.delta.content_delta;
            }
            break;

          case "toolcall":
            toolCallMap.set(event.toolCall.id, {
              id: event.toolCall.id,
              name: event.toolCall.name,
              arguments: event.toolCall.arguments as Record<string, unknown>,
            });
            break;

          case "toolresult":
            if (toolCallMap.has(event.toolCallId)) {
              const record = toolCallMap.get(event.toolCallId)!;
              record.result = event.result;
              record.duration = event.duration;
              if (event.error) record.error = event.error;
            }
            break;

          case "done":
            unsubscribe();
            if (event.totalTokens) {
              usage = {
                input: event.totalTokens.input,
                output: event.totalTokens.output,
              };
            }
            const history = filterHistory(event.internalMessages ?? []);
            resolve({
              text,
              toolCalls: Array.from(toolCallMap.values()),
              usage,
              history,
            });
            break;

          case "error":
            unsubscribe();
            reject(event.error);
            break;
        }
      });

      loop.start(userMessage).catch((e) => {
        unsubscribe();
        reject(e);
      });
    });
  }
}
