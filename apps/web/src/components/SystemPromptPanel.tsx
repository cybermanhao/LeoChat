import { useState, useCallback, useMemo } from "react";
import {
  MessageSquareText,
  Check,
  CheckCircle2,
  Plus,
  Pencil,
  Trash2,
  X,
  Server,
  User,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { Button, Popover, PopoverContent, PopoverTrigger, cn } from "@ai-chatbox/ui";
import { usePromptStore } from "../stores/prompt";
import { useMCPStore } from "../stores/mcp";

// ---- MCP 提示词信息（含是否有必填参数） ----
interface McpPromptInfo {
  serverId: string;
  serverName: string;
  name: string;
  description?: string;
  hasRequiredArgs: boolean;
}

// ---- 内联编辑表单 ----
interface EditFormProps {
  initialName?: string;
  initialContent?: string;
  onSave: (name: string, content: string) => void;
  onCancel: () => void;
}

function EditForm({ initialName = "", initialContent = "", onSave, onCancel }: EditFormProps) {
  const [name, setName] = useState(initialName);
  const [content, setContent] = useState(initialContent);

  const handleSave = () => {
    const trimmedName = name.trim();
    const trimmedContent = content.trim();
    if (!trimmedName || !trimmedContent) return;
    onSave(trimmedName, trimmedContent);
  };

  return (
    <div className="p-3 space-y-2 border-t bg-muted/20">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="提示词名称"
        className="w-full rounded border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/20"
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="提示词内容..."
        rows={5}
        className="w-full resize-none rounded border bg-background px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed"
      />
      <div className="flex justify-end gap-1.5">
        <button
          className="px-3 py-1 rounded text-xs text-muted-foreground hover:bg-muted transition-colors"
          onClick={onCancel}
        >
          取消
        </button>
        <button
          className="px-3 py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          onClick={handleSave}
          disabled={!name.trim() || !content.trim()}
        >
          保存
        </button>
      </div>
    </div>
  );
}

// ---- 主组件 ----
export function SystemPromptPanel() {
  const [open, setOpen] = useState(false);
  const [mcpSectionOpen, setMcpSectionOpen] = useState(true);
  const [customSectionOpen, setCustomSectionOpen] = useState(true);

  // "adding" = 新建表单展开, string = 正在编辑的 custom id
  const [editingId, setEditingId] = useState<"adding" | string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const {
    customPrompts,
    activePrompt,
    mcpPromptCache,
    addCustomPrompt,
    updateCustomPrompt,
    deleteCustomPrompt,
    setActiveCustomPrompt,
    clearActivePrompt,
  } = usePromptStore();

  // 从 MCP Store 获取 prompts
  const mcpSources = useMCPStore((s) => s.sources);
  const mcpServerStates = useMCPStore((s) => s.serverStates);

  // 构建 MCP 提示词列表（含必填参数标记）
  const mcpPrompts = useMemo<McpPromptInfo[]>(() => {
    const list: McpPromptInfo[] = [];
    for (const source of mcpSources) {
      for (const server of source.servers) {
        const state = mcpServerStates[server.id];
        if (state?.prompts?.length) {
          for (const p of state.prompts) {
            list.push({
              serverId: server.id,
              serverName: server.name,
              name: p.name,
              description: p.description,
              hasRequiredArgs: !!p.arguments?.some((a) => a.required),
            });
          }
        }
      }
    }
    return list;
  }, [mcpSources, mcpServerStates]);

  // 已自动包含的 MCP 提示词数量（已缓存且来自当前连接服务器）
  const activeMcpCount = useMemo(() => {
    return mcpPrompts.filter(
      (p) => !p.hasRequiredArgs && !!mcpPromptCache[`${p.serverId}:${p.name}`]
    ).length;
  }, [mcpPrompts, mcpPromptCache]);

  const handleSelectCustom = useCallback(
    (id: string) => {
      setActiveCustomPrompt(id);
      setOpen(false);
    },
    [setActiveCustomPrompt]
  );

  const handleClear = useCallback(() => {
    clearActivePrompt();
    setOpen(false);
  }, [clearActivePrompt]);

  const handleAddSave = (name: string, content: string) => {
    const id = addCustomPrompt(name, content);
    setEditingId(null);
    setActiveCustomPrompt(id);
    setOpen(false);
  };

  const handleEditSave = (id: string, name: string, content: string) => {
    updateCustomPrompt(id, name, content);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    if (confirmDeleteId === id) {
      deleteCustomPrompt(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  // 当前激活的名称（用于触发器按钮展示）
  const activeName = useMemo(() => {
    const customName =
      activePrompt?.type === "custom"
        ? customPrompts.find((p) => p.id === activePrompt.id)?.name ?? null
        : null;
    if (customName && activeMcpCount > 0) return `${customName} +MCP`;
    if (activeMcpCount > 0) return `MCP ×${activeMcpCount}`;
    return customName;
  }, [activePrompt, customPrompts, activeMcpCount]);

  const isActive = !!activePrompt || activeMcpCount > 0;

  // ---- 触发器按钮 ----
  const trigger = (
    <Button
      type="button"
      variant={isActive ? "secondary" : "ghost"}
      size="sm"
      className={cn(
        "h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground hover:text-foreground",
        isActive && "bg-secondary text-foreground"
      )}
    >
      <MessageSquareText className="h-4 w-4" />
      <span className="hidden sm:inline truncate max-w-[120px]">
        {activeName ?? "系统提示"}
      </span>
    </Button>
  );

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditingId(null); }}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={8}
        className="w-80 p-0 bg-card border shadow-lg"
      >
        {/* Header */}
        <div className="flex items-center justify-between h-10 px-3 border-b">
          <div className="flex items-center gap-1.5">
            <MessageSquareText className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">系统提示词</span>
          </div>
          {/* 仅在有激活的自定义提示词时显示清除按钮 */}
          {activePrompt?.type === "custom" && (
            <button
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
              onClick={handleClear}
            >
              <X className="h-3 w-3" />
              清除
            </button>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto">

          {/* ---- MCP 提供的 Prompt（自动包含） ---- */}
          <div>
            <button
              className="flex items-center gap-1.5 w-full h-7 px-3 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
              onClick={() => setMcpSectionOpen((v) => !v)}
            >
              {mcpSectionOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Server className="h-3 w-3" />
              MCP 提供（自动）
              {activeMcpCount > 0 && (
                <span className="ml-1 text-[10px] text-green-600 font-medium">
                  {activeMcpCount} 已激活
                </span>
              )}
              <span className="ml-auto text-[10px]">{mcpPrompts.length}</span>
            </button>

            {mcpSectionOpen && (
              <div>
                {mcpPrompts.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground px-8 py-2">
                    连接 MCP 服务器以加载提示词
                  </p>
                ) : (
                  mcpPrompts.map((prompt) => {
                    const key = `${prompt.serverId}:${prompt.name}`;
                    const isCached = !!mcpPromptCache[key];
                    const isLoading = !prompt.hasRequiredArgs && !isCached;

                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 px-3 py-2"
                      >
                        <div className="w-4 h-4 flex items-center justify-center shrink-0">
                          {prompt.hasRequiredArgs ? (
                            <span className="h-3 w-3 rounded-full border border-muted-foreground/40 block" />
                          ) : isCached ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <span className="h-3 w-3 rounded-full border border-muted-foreground/40 block animate-pulse" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{prompt.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {prompt.serverName}
                            {prompt.description && ` · ${prompt.description}`}
                          </div>
                        </div>
                        {prompt.hasRequiredArgs ? (
                          <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                            需要参数
                          </span>
                        ) : isCached ? (
                          <span className="text-[9px] text-green-600 font-medium bg-green-500/10 px-1.5 py-0.5 rounded shrink-0">
                            自动
                          </span>
                        ) : isLoading ? (
                          <span className="text-[9px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded shrink-0">
                            加载中
                          </span>
                        ) : null}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="border-t" />

          {/* ---- 我的提示词 ---- */}
          <div>
            <div className="flex items-center w-full h-7 px-3">
              <button
                className="flex items-center gap-1.5 flex-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setCustomSectionOpen((v) => !v)}
              >
                {customSectionOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                <User className="h-3 w-3" />
                我的提示词
                <span className="ml-1 text-[10px]">{customPrompts.length}</span>
              </button>
              <button
                className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                onClick={() => { setCustomSectionOpen(true); setEditingId("adding"); }}
                title="新建提示词"
              >
                <Plus className="h-3 w-3" />
                新建
              </button>
            </div>

            {customSectionOpen && (
              <div>
                {customPrompts.length === 0 && editingId !== "adding" && (
                  <p className="text-[11px] text-muted-foreground px-8 py-2">
                    点击"新建"添加自定义提示词
                  </p>
                )}

                {customPrompts.map((prompt) => {
                  const isSelected =
                    activePrompt?.type === "custom" && activePrompt.id === prompt.id;
                  const isEditing = editingId === prompt.id;
                  const isConfirmDelete = confirmDeleteId === prompt.id;

                  if (isEditing) {
                    return (
                      <EditForm
                        key={prompt.id}
                        initialName={prompt.name}
                        initialContent={prompt.content}
                        onSave={(name, content) => handleEditSave(prompt.id, name, content)}
                        onCancel={() => setEditingId(null)}
                      />
                    );
                  }

                  return (
                    <div
                      key={prompt.id}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 group transition-colors",
                        isSelected ? "bg-primary/10" : "hover:bg-muted/50"
                      )}
                    >
                      <button
                        className="w-4 h-4 flex items-center justify-center shrink-0"
                        onClick={() => handleSelectCustom(prompt.id)}
                      >
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                      </button>
                      <button
                        className="flex-1 min-w-0 text-left"
                        onClick={() => handleSelectCustom(prompt.id)}
                      >
                        <div className={cn("text-xs font-medium truncate", isSelected && "text-primary")}>
                          {prompt.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {prompt.content.slice(0, 60)}{prompt.content.length > 60 ? "…" : ""}
                        </div>
                      </button>
                      {/* 操作按钮 */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          className="p-1 rounded hover:bg-muted transition-colors"
                          onClick={() => setEditingId(prompt.id)}
                          title="编辑"
                        >
                          <Pencil className="h-3 w-3 text-muted-foreground" />
                        </button>
                        <button
                          className={cn(
                            "p-1 rounded transition-colors",
                            isConfirmDelete
                              ? "bg-red-500/10 text-red-500"
                              : "hover:bg-muted text-muted-foreground"
                          )}
                          onClick={() => handleDelete(prompt.id)}
                          title={isConfirmDelete ? "再次点击确认删除" : "删除"}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* 新建表单 */}
                {editingId === "adding" && (
                  <EditForm
                    onSave={handleAddSave}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
