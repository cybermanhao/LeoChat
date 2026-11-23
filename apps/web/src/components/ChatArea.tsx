import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChatInput,
  MessageActions,
  MCPQuickPanel,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  cn,
} from "@ai-chatbox/ui";
import {
  StreamingContent,
  CodeBlock,
  ActionButtonGroup,
  ActionCardGroup,
} from "@ai-chatbox/ui";
import { parseActionTags, parseCardTags } from "@ai-chatbox/shared";
import { Sparkles, Trash2, RefreshCw, Thermometer, Layers, Globe, ShieldCheck, ShieldAlert, ArrowDown } from "lucide-react";
import { useT } from "../i18n";
import { useChatStore } from "../stores/chat";
import { useMCPStore } from "../stores/mcp";
import { usePromptStore } from "../stores/prompt";
import { mcpApi } from "../lib/api";
import { assembleSystemPrompt } from "../lib/prompt-assembly";
import { executeLeoCardAction } from "../lib/card-actions";
import { ModelSelector } from "./ModelSelector";
import { SystemPromptPanel } from "./SystemPromptPanel";
import { ViewMessageItem, messageText } from "./chat/ViewMessageItem";
import { ApprovalBanner, QueuedBar } from "./chat/RunBanners";
import { GoalBar } from "./chat/GoalBar";
import { useStickToBottom } from "./chat/useStickToBottom";
import { ScheduleBar } from "./chat/ScheduleBar";
import { parseLoopCommand } from "../lib/loop-command";
import { showToast } from "../stores/toast";

/**
 * parseActionTags/parseCardTags 对整段文本做正则扫描——流式输出时，每个 token 到达
 * 都会带着目前为止累积的全部文本重新扫描一遍。不 memo 的话，随着这一轮回复变长，
 * 每个 token 的解析成本跟着变长，整轮下来是 O(n²)，跟用户是否点击过任何东西无关，
 * 纯靠多轮吐字/长回复就能把主线程堵死（对应"没有任何手动操作也卡死"的复现）。
 * 用 useMemo 把解析结果按 content 缓存，content 没变就不重新扫描。
 */
const ParsedMessageText = ({
  content,
  isStreaming,
  enableMarkdown,
  onAction,
}: {
  content: string;
  isStreaming: boolean;
  enableMarkdown: boolean;
  onAction: (actionName: string, attributes: Record<string, string>) => void;
}) => {
  const { parsedActions, cards, columns, cleanContent } = useMemo(() => {
    const { actions, cleanContent: contentWithoutActions } = parseActionTags(content);
    const { cards: parsedCards, columns: parsedColumns, cleanContent: finalContent } =
      parseCardTags(contentWithoutActions);
    return { parsedActions: actions, cards: parsedCards, columns: parsedColumns, cleanContent: finalContent };
  }, [content]);

  return (
    <div className="space-y-4">
      {cleanContent && (
        <StreamingContent
          content={cleanContent}
          isStreaming={isStreaming}
          enableMarkdown={enableMarkdown}
          renderCodeBlock={(code, language) => (
            <CodeBlock code={code} language={language} showLineNumbers />
          )}
        />
      )}
      {cards.length > 0 && (
        <ActionCardGroup cards={cards} columns={columns as 1 | 2 | 3} isStreaming={isStreaming} />
      )}
      {parsedActions.length > 0 && (
        <ActionButtonGroup
          actions={parsedActions.map((a) => ({
            name: a.name,
            label: a.attributes.label,
            attributes: a.attributes,
          }))}
          isStreaming={isStreaming}
          onAction={onAction}
        />
      )}
    </div>
  );
};

export function ChatArea() {
  const { t } = useT();
  const navigate = useNavigate();
  // 贴底滚动：贴底时跟随内容增长（每帧最多一次、不用动画），用户上滚就不再跟随
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } = useStickToBottom();
  const currentConversationId = useChatStore((s) => s.currentConversationId);
  const view = useChatStore((s) => s.view);
  const inbox = useChatStore((s) => s.inbox);
  const input = useChatStore((s) => s.input);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const setInput = useChatStore((s) => s.setInput);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const startGoal = useChatStore((s) => s.startGoal);
  const createSchedule = useChatStore((s) => s.createSchedule);
  const hasSchedules = useChatStore((s) => s.schedules.length > 0);
  const hasGoal = useChatStore((s) => s.goal !== null);
  const cancelGeneration = useChatStore((s) => s.cancelGeneration);
  const clearCurrentConversation = useChatStore((s) => s.clearCurrentConversation);
  const currentProvider = useChatStore((s) => s.currentProvider);
  const currentModel = useChatStore((s) => s.currentModel);
  const setCurrentModel = useChatStore((s) => s.setCurrentModel);
  const enableMarkdown = useChatStore((s) => s.enableMarkdown);
  const setEnableMarkdown = useChatStore((s) => s.setEnableMarkdown);
  const maxEpochs = useChatStore((s) => s.maxEpochs);
  const setMaxEpochs = useChatStore((s) => s.setMaxEpochs);
  const unlimitedEpochs = useChatStore((s) => s.unlimitedEpochs);
  const setUnlimitedEpochs = useChatStore((s) => s.setUnlimitedEpochs);
  const queueFollowUp = useChatStore((s) => s.queueFollowUp);
  const webSearch = useChatStore((s) => s.webSearch);
  const setWebSearch = useChatStore((s) => s.setWebSearch);
  const permission = useChatStore((s) => s.permission);
  const setPermission = useChatStore((s) => s.setPermission);
  const executeAction = useChatStore((s) => s.executeAction);
  const uiMode = useChatStore((s) => s.uiMode);
  const temperature = useChatStore((s) => s.temperature);
  const setTemperature = useChatStore((s) => s.setTemperature);
  const contextLevel = useChatStore((s) => s.contextLevel);
  const setContextLevel = useChatStore((s) => s.setContextLevel);

  // 直接计算 messages，确保响应式更新
  const messages = view.messages;
  // 等待审批的工具调用（由 core 的视图状态推导，不再单独维护队列）
  const awaitingApproval = useMemo(
    () => messages.flatMap((m) => m.parts).filter((p) => p.type === "tool" && p.state === "awaiting-approval"),
    [messages],
  );

  // 滚动到底部
  // 切换会话：直接到底部（不用动画）
  useEffect(() => {
    scrollToBottom();
  }, [currentConversationId, scrollToBottom]);

  // 新的用户消息（自己发的、插话、提醒、目标轮次）：回到底部并恢复跟随
  const lastMessage = messages[messages.length - 1];
  useEffect(() => {
    if (lastMessage?.role === "user") scrollToBottom();
  }, [lastMessage?.id, lastMessage?.role, scrollToBottom]);

  // MCP Store
  const mcpSources = useMCPStore((s) => s.sources);
  const mcpServerStates = useMCPStore((s) => s.serverStates);
  const mcpConnectingServerIds = useMCPStore((s) => s.connectingServerIds);
  const mcpEnabledServerIds = useMCPStore((s) => s.enabledServerIds);
  const toggleMCPServer = useMCPStore((s) => s.toggleServer);
  const disabledToolIds = useMCPStore((s) => s.disabledToolIds);

  // Chat Store - MCP Tools
  const setMCPTools = useChatStore((s) => s.setMCPTools);

  // 将 connectingServerIds Set 转换为 Record<string, boolean>
  const mcpIsConnecting = useMemo(() => {
    const record: Record<string, boolean> = {};
    mcpConnectingServerIds.forEach(id => {
      record[id] = true;
    });
    return record;
  }, [mcpConnectingServerIds]);

  // 同步 MCP 工具到 Chat Store（过滤禁用的工具）。运行时只把这份列表里的工具交给模型，
  // 所以服务器连上、工具列表到达（serverStates 变化）时也要重新同步，否则会一直是空的
  // 使用 getState() 避免订阅方法导致的 stale closure
  useEffect(() => {
    const enabledTools = useMCPStore.getState().getEnabledTools();
    setMCPTools(enabledTools);
  }, [disabledToolIds, mcpEnabledServerIds, mcpServerStates, setMCPTools]);

  // 对话框状态
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);

  // Temperature Popover
  const [tempPopoverOpen, setTempPopoverOpen] = useState(false);
  const tempPopoverRef = useRef<HTMLDivElement>(null);

  // Context Window Popover
  const [ctxPopoverOpen, setCtxPopoverOpen] = useState(false);
  const ctxPopoverRef = useRef<HTMLDivElement>(null);

  // Max Epochs Popover
  const [epochsPopoverOpen, setEpochsPopoverOpen] = useState(false);
  const epochsPopoverRef = useRef<HTMLDivElement>(null);

  // Prompt store
  const activePrompt = usePromptStore((s) => s.activePrompt);
  const customPrompts = usePromptStore((s) => s.customPrompts);
  const mcpPromptCache = usePromptStore((s) => s.mcpPromptCache);
  const cachePromptContent = usePromptStore((s) => s.cachePromptContent);
  const systemPrompt = usePromptStore((s) => s.systemPrompt);
  const attachedMcpPrompts = usePromptStore((s) => s.attachedMcpPrompts);
  const promptVersion = usePromptStore((s) => s.promptVersion);
  const attachMcpPrompt = usePromptStore((s) => s.attachMcpPrompt);

  // 自动拉取已连接 MCP 服务器的提示词（无必填参数的）
  useEffect(() => {
    const aborted = new Set<string>();
    for (const source of mcpSources) {
      for (const server of source.servers) {
        const state = mcpServerStates[server.id];
        if (!state?.prompts?.length) continue;
        for (const p of state.prompts) {
          // 跳过有必填参数的提示词
          if (p.arguments?.some((a) => a.required)) continue;
          const key = `${server.id}:${p.name}`;
          if (mcpPromptCache[key]) continue; // 已缓存，跳过
          mcpApi
            .getPrompt(server.id, p.name)
            .then((raw) => {
              if (aborted.has(key)) return;
              const result = raw as { messages?: Array<{ content: string | { text: string } }> };
              const parts: string[] = [];
              if (result.messages?.length) {
                for (const m of result.messages) {
                  const c = m.content;
                  const text = typeof c === "string" ? c : (c as { text: string }).text ?? "";
                  if (text) parts.push(text);
                }
              }
              const content = parts.join("\n");
              if (content) cachePromptContent(server.id, p.name, content);
            })
            .catch((e) => {
              if (!aborted.has(key)) {
                console.error("Failed to auto-fetch MCP prompt", e);
              }
            });
        }
      }
    }
    return () => {
      for (const source of mcpSources) {
        for (const server of source.servers) {
          const state = mcpServerStates[server.id];
          if (!state?.prompts?.length) continue;
          for (const p of state.prompts) {
            if (p.arguments?.some((a) => a.required)) continue;
            aborted.add(`${server.id}:${p.name}`);
          }
        }
      }
    };
  }, [mcpSources, mcpServerStates, mcpPromptCache, cachePromptContent]);

  // 迁移逻辑：promptVersion === 0 时自动附加所有已缓存的无参 MCP 提示词
  useEffect(() => {
    if (promptVersion !== 0) return;
    // 等待至少有一个 MCP 提示词被缓存后再迁移
    const cachedKeys = Object.keys(mcpPromptCache);
    if (cachedKeys.length === 0) {
      // 检查是否有任何可缓存的无参提示词——如果没有，直接迁移
      let hasNoArgPrompts = false;
      for (const source of mcpSources) {
        for (const server of source.servers) {
          const state = mcpServerStates[server.id];
          if (!state?.prompts?.length) continue;
          for (const p of state.prompts) {
            if (!p.arguments?.some((a: { required?: boolean }) => a.required)) {
              hasNoArgPrompts = true;
            }
          }
        }
      }
      if (!hasNoArgPrompts) {
        // 没有无参 MCP 提示词，直接设置版本号
        usePromptStore.setState({ promptVersion: 1 });
      }
      return;
    }

    // 自动附加所有已缓存的无参 MCP 提示词
    for (const key of cachedKeys) {
      const [serverId, ...rest] = key.split(":");
      const promptName = rest.join(":");
      attachMcpPrompt(serverId, promptName);
    }
    usePromptStore.setState({ promptVersion: 1 });
  }, [promptVersion, mcpPromptCache, mcpSources, mcpServerStates, attachMcpPrompt]);

  // 组合最终 system prompt：系统提示 + 已附加的 MCP 模板 + 激活的自定义提示词
  const assembledPrompt = useMemo(() => {
    return assembleSystemPrompt({
      systemPrompt,
      attachedMcpPrompts,
      mcpPromptCache,
      activePrompt,
      customPrompts,
    });
  }, [systemPrompt, attachedMcpPrompts, mcpPromptCache, activePrompt, customPrompts]);

  // 监听 send_message ui-command 事件（用于卡片交互式游戏等）
  useEffect(() => {
    const handleSendMessage = (e: Event) => {
      const { text } = (e as CustomEvent<{ text: string }>).detail;
      if (text && !isGenerating) {
        sendMessage(text, assembledPrompt);
      }
    };
    window.addEventListener("ui-command:send-message", handleSendMessage);
    return () => window.removeEventListener("ui-command:send-message", handleSendMessage);
  }, [isGenerating, sendMessage, assembledPrompt]);

  // 点击外部关闭 Temperature Popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tempPopoverRef.current && !tempPopoverRef.current.contains(event.target as Node)) {
        setTempPopoverOpen(false);
      }
    };
    if (tempPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [tempPopoverOpen]);

  // 点击外部关闭 Context Window Popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ctxPopoverRef.current && !ctxPopoverRef.current.contains(event.target as Node)) {
        setCtxPopoverOpen(false);
      }
    };
    if (ctxPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [ctxPopoverOpen]);

  // 点击外部关闭 Max Epochs Popover
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (epochsPopoverRef.current && !epochsPopoverRef.current.contains(event.target as Node)) {
        setEpochsPopoverOpen(false);
      }
    };
    if (epochsPopoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [epochsPopoverOpen]);

  const handleModelSelect = useCallback(
    (modelId: string) => {
      setCurrentModel(modelId);
    },
    [setCurrentModel]
  );

  const handleClearChat = useCallback(() => {
    if (confirm(t("chat.confirmClear"))) {
      clearCurrentConversation();
    }
  }, [clearCurrentConversation]);

  // 运行中：Enter 插话，Ctrl/Cmd+Enter 排队
  const handleSteer = () => {
    if (input.trim()) sendMessage(input, assembledPrompt);
  };
  const handleQueue = () => {
    if (input.trim()) queueFollowUp(input, assembledPrompt);
  };

  const handleSend = () => {
    if (input.trim() && !isGenerating) {
      // 在用户手势中请求通知权限（首次），之后静默跳过
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission();
      }
      // /goal <目标>：创建目标并开始自动推进（harness 第一期）
      const goalCmd = /^\/goal(?:\s+([\s\S]*))?$/.exec(input.trim());
      if (goalCmd) {
        const objective = goalCmd[1]?.trim();
        if (objective) void startGoal(objective, assembledPrompt ? { systemPrompt: assembledPrompt } : {});
        return;
      }
      // /loop <间隔或时间> <内容>：定时提醒（harness 第二期）
      const loop = parseLoopCommand(input);
      if (loop) {
        if (!loop.ok) showToast(loop.error, "destructive");
        else void createSchedule(loop.prompt, loop.rule, assembledPrompt || undefined);
        return;
      }
      sendMessage(input, assembledPrompt);
    }
  };

  // 工具栏按钮样式
  const toolbarButtonClass = "h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground";

  const toolbar = (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1 flex-wrap py-1">
        {/* MCP 服务 */}
        <MCPQuickPanel
          sources={mcpSources}
          serverStates={mcpServerStates}
          isConnecting={mcpIsConnecting}
          mcpServerCount={mcpEnabledServerIds.length}
          onToggleServer={toggleMCPServer}
          onServerClick={(serverId) => {
            navigate(`/settings/mcp/servers/${serverId}/edit`);
          }}
          onSettingsClick={() => navigate("/settings/mcp/servers")}
          onAddServer={() => navigate("/settings/mcp/servers/add")}
        />

        {/* 模型选择 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className={toolbarButtonClass}
              onClick={() => setModelSelectorOpen(true)}
            >
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">
                {currentProvider}/{currentModel.includes("/") ? currentModel.split("/").pop() : currentModel}
              </span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {t("settings.model.selectModel")}
          </TooltipContent>
        </Tooltip>

        {/* 联网搜索：DeepSeek 原生能力，其它提供商不可用 */}
        {currentProvider === "deepseek" && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={webSearch}
                className={cn(toolbarButtonClass, webSearch && "bg-primary/10 text-primary hover:text-primary")}
                onClick={() => setWebSearch(!webSearch)}
              >
                <Globe className="h-4 w-4" />
                <span className="hidden sm:inline">联网</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {webSearch ? "联网搜索已开启" : "开启联网搜索"}
            </TooltipContent>
          </Tooltip>
        )}

        {/* 权限预设（dsh 的 permission-presets，暂无沙箱）：询问 / 完全信任 */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={permission === "full"}
              className={cn(toolbarButtonClass, permission === "full" && "bg-accent text-accent-foreground")}
              onClick={() => {
                if (permission === "full") setPermission("ask");
                else if (window.confirm("完全信任：bash 等需要审批的工具将不再询问、直接执行，目标的自动轮次也会执行它们。确定开启？")) setPermission("full");
              }}
            >
              {permission === "full" ? <ShieldAlert className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
              <span className="hidden sm:inline">{permission === "full" ? "完全信任" : "询问"}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {permission === "full" ? "需要审批的工具直接执行（点击改回询问）" : "需要审批的工具先问你；目标的自动轮次会拒绝它们"}
          </TooltipContent>
        </Tooltip>

        {/* 系统提示（仅专业模式） */}
        {uiMode === 'professional' && <SystemPromptPanel />}

        {/* Temperature 按钮（仅专业模式） */}
        {uiMode === 'professional' && (
          <div ref={tempPopoverRef} className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(toolbarButtonClass, tempPopoverOpen && "bg-muted text-foreground")}
                  onClick={() => setTempPopoverOpen(!tempPopoverOpen)}
                >
                  <Thermometer className="h-4 w-4" />
                  <span className="hidden sm:inline">{temperature.toFixed(1)}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {t("chat.temperature")}
              </TooltipContent>
            </Tooltip>
            {tempPopoverOpen && (
              <div className="bg-card border border-border rounded-lg shadow-lg p-3 absolute bottom-full mb-1 z-50 w-48">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-foreground font-medium">{t("chat.temperature")}</span>
                  <span className="text-xs text-muted-foreground">{temperature.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => setTemperature(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">0</span>
                  <span className="text-[10px] text-muted-foreground">2</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Context Window 按钮（仅专业模式） */}
        {uiMode === 'professional' && (
          <div ref={ctxPopoverRef} className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(toolbarButtonClass, ctxPopoverOpen && "bg-muted text-foreground")}
                  onClick={() => setCtxPopoverOpen(!ctxPopoverOpen)}
                >
                  <Layers className="h-4 w-4" />
                  <span className="hidden sm:inline">{contextLevel === 10 ? "∞" : contextLevel}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {t("chat.contextWindow")}
              </TooltipContent>
            </Tooltip>
            {ctxPopoverOpen && (
              <div className="bg-card border border-border rounded-lg shadow-lg p-3 absolute bottom-full mb-1 z-50 w-48">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-foreground font-medium">{t("chat.contextWindow")}</span>
                  <span className="text-xs text-muted-foreground">{contextLevel === 10 ? "∞" : contextLevel}</span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={10}
                  step={1}
                  value={contextLevel}
                  onChange={(e) => setContextLevel(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">1</span>
                  <span className="text-[10px] text-muted-foreground">∞</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 最大循环轮数（仅专业模式） */}
        {uiMode === 'professional' && (
          <div ref={epochsPopoverRef} className="relative">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(toolbarButtonClass, epochsPopoverOpen && "bg-muted text-foreground")}
                  onClick={() => setEpochsPopoverOpen(!epochsPopoverOpen)}
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="hidden sm:inline">{unlimitedEpochs ? "∞" : maxEpochs}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                {t("chat.maxEpochs")}
              </TooltipContent>
            </Tooltip>
            {epochsPopoverOpen && (
              <div className="bg-card border border-border rounded-lg shadow-lg p-3 absolute bottom-full mb-1 z-50 w-52">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-foreground font-medium">{t("chat.maxEpochs")}</span>
                  <span className="text-xs text-muted-foreground">
                    {unlimitedEpochs ? "∞" : maxEpochs}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={50}
                  step={1}
                  value={maxEpochs}
                  disabled={unlimitedEpochs}
                  onChange={(e) => setMaxEpochs(Number(e.target.value))}
                  className="w-full accent-primary disabled:opacity-40"
                />
                <div className="flex justify-between mt-1 mb-3">
                  <span className="text-[10px] text-muted-foreground">1</span>
                  <span className="text-[10px] text-muted-foreground">50</span>
                </div>
                <button
                  type="button"
                  onClick={() => setUnlimitedEpochs(!unlimitedEpochs)}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 rounded-md text-xs transition-colors",
                    unlimitedEpochs
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-muted-foreground"
                  )}
                >
                  <span>无限制</span>
                  <span className="font-mono text-sm">∞</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* 清空对话 */}
        {messages.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={toolbarButtonClass}
                onClick={handleClearChat}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">{t("chat.clear")}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs">
              {t("chat.clearConversation")}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );

  const inputElement = (
    <ChatInput
      value={input}
      onChange={setInput}
      onSend={handleSend}
      onCancel={cancelGeneration}
      isLoading={isGenerating}
      onSteer={handleSteer}
      onQueue={handleQueue}
      placeholder={assembledPrompt ? t("chat.placeholderWithPrompt") : t("chat.placeholderDefault")}
      toolbar={toolbar}
    />
  );

  // 空状态：居中显示欢迎信息和输入框（仅在没有消息且不在生成中时显示）
  // 空白欢迎页：没有消息、没在生成，也没有定时提醒或目标（否则需要显示对应的状态条）
  if (messages.length === 0 && !isGenerating && !hasSchedules && !hasGoal) {
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-hidden p-4">
        <div className="w-full max-w-2xl space-y-8">
          {/* 欢迎信息 */}
          <div className="text-center">
            <h1 className="text-3xl font-semibold tracking-tight">
              {t("chat.welcome")}
            </h1>
            <p className="mt-3 text-muted-foreground">
              {t("chat.welcomeDescription")}
            </p>
          </div>

          {/* 输入框 */}
          <div className="w-full">{inputElement}</div>

          {/* 快捷提示 */}
          <div
            className="flex flex-wrap justify-center gap-2"
            style={{ marginTop: '32px' }}
          >
            {[
              t("chat.suggestions.code"),
              t("chat.suggestions.explain"),
              t("chat.suggestions.translate"),
              t("chat.suggestions.summarize"),
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setInput(suggestion)}
                className="rounded-full border bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {/* Dialogs */}
        <ModelSelector
          open={modelSelectorOpen}
          onOpenChange={setModelSelectorOpen}
          currentModel={currentModel}
          currentProvider={currentProvider}
          onSelect={handleModelSelect}
        />
      </div>
    );
  }

  // 有消息或正在生成：传统布局 - 输入框固定底部，消息区可滚动
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Messages - 可滚动区域 */}
      <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        className="h-full overflow-y-auto p-4 scrollbar-thin [overflow-anchor:none]"
        data-testid="chat-scroll"
      >
        <div ref={contentRef} className="mx-auto max-w-3xl space-y-4">
          {messages.map((message, index) => {
            const streaming = isGenerating && index === messages.length - 1 && message.role === "assistant";
            return (
              <ViewMessageItem
                key={message.id}
                message={message}
                isStreaming={streaming}
                onCardAction={executeLeoCardAction}
                actions={
                  message.role === "assistant" ? (
                    <MessageActions
                      content={messageText(message)}
                      enableMarkdown={enableMarkdown}
                      onMarkdownToggle={() => setEnableMarkdown(!enableMarkdown)}
                    />
                  ) : undefined
                }
                renderText={(text, partStreaming) => (
                  <ParsedMessageText
                    content={text}
                    isStreaming={streaming && partStreaming}
                    enableMarkdown={enableMarkdown}
                    onAction={executeAction}
                  />
                )}
              />
            );
          })}
          {view.error && !isGenerating && (
            <p className="text-center text-xs text-muted-foreground">本次回复出错（{view.error.kind}），可以重新发送。</p>
          )}
        </div>
      </div>
      {/* 用户上滚后不再跟随；点这里回到底部并恢复跟随 */}
      {!isAtBottom && (
        <button
          type="button"
          onClick={() => scrollToBottom(true)}
          className="absolute bottom-3 left-1/2 inline-flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground shadow-md transition-colors hover:bg-accent hover:text-foreground"
        >
          <ArrowDown className="h-3 w-3" />
          {isGenerating ? "回到底部（正在生成）" : "回到底部"}
        </button>
      )}
      </div>

      {/* 排队中的插话 / 后续消息 */}
      <QueuedBar inbox={inbox} />

      {/* 等待审批的工具调用，每个一条 */}
      {awaitingApproval.map((p) => (p.type === "tool" ? <ApprovalBanner key={p.callId} part={p} /> : null))}

      {/* 定时提醒（/loop） */}
      <ScheduleBar />

      {/* 目标（/goal）状态条 */}
      <GoalBar {...(assembledPrompt ? { systemPrompt: assembledPrompt } : {})} />

      {/* Input Area - 固定在底部 */}
      <div className="flex-shrink-0 border-t p-4">
        <div className="mx-auto max-w-3xl">{inputElement}</div>
      </div>

      {/* Dialogs */}
      <ModelSelector
        open={modelSelectorOpen}
        onOpenChange={setModelSelectorOpen}
        currentModel={currentModel}
        currentProvider={currentProvider}
        onSelect={handleModelSelect}
      />
    </div>
  );
}
