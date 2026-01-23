import { useState } from "react";
import { Plus, MessageSquare, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import {
  Button,
  ScrollArea,
  Separator,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@ai-chatbox/ui";
import { useChatStore } from "../stores/chat";
import { cn } from "@ai-chatbox/ui";

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const { conversations, currentConversationId, setCurrentConversation, createConversation, deleteConversation } =
    useChatStore();

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r bg-muted/30 transition-all duration-300",
        collapsed ? "w-14" : "w-64"
      )}
    >
      {/* New Chat Button */}
      <div className="flex items-center justify-between p-2">
        {!collapsed && (
          <Button
            variant="outline"
            className="flex-1 justify-start gap-2"
            onClick={() => createConversation()}
          >
            <Plus className="h-4 w-4" />
            New Chat
          </Button>
        )}
        {collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={() => createConversation()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">New Chat</TooltipContent>
          </Tooltip>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="ml-1"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <Separator />

      {/* Conversation List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group flex items-center rounded-md",
                currentConversationId === conv.id
                  ? "bg-accent"
                  : "hover:bg-accent/50"
              )}
            >
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="w-full"
                      onClick={() => setCurrentConversation(conv.id)}
                    >
                      <MessageSquare className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {conv.title || "Untitled"}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    className="flex-1 justify-start gap-2 overflow-hidden"
                    onClick={() => setCurrentConversation(conv.id)}
                  >
                    <MessageSquare className="h-4 w-4 shrink-0" />
                    <span className="truncate">
                      {conv.title || "Untitled Chat"}
                    </span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100"
                    onClick={() => deleteConversation(conv.id)}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* MCP Status */}
      {!collapsed && (
        <>
          <Separator />
          <div className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className="h-2 w-2 rounded-full bg-green-500" />
              <span>MCP Connected</span>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
