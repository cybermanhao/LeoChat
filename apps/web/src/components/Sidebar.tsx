import { Plus, MessageSquare, Trash2 } from "lucide-react";
import { Button, Separator } from "@ai-chatbox/ui";
import { useChatStore } from "../stores/chat";
import { cn } from "@ai-chatbox/ui";
import { useT } from "../i18n";
import {
  LeftDrawer,
  LeftDrawerHeader,
  LeftDrawerContent,
  LeftDrawerFooter,
} from "./layout";

export function Sidebar() {
  const { t } = useT();
  const { conversations, currentConversationId, setCurrentConversation, createConversation, deleteConversation } =
    useChatStore();

  return (
    <LeftDrawer>
      {/* Header with New Chat Button */}
      <LeftDrawerHeader
        title={t("nav.chat")}
        actions={
          <Button
            variant="ghost"
            size="icon"
            onClick={() => createConversation()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        }
      />

      {/* Conversation List */}
      <LeftDrawerContent>
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
            </div>
          ))}
        </div>
      </LeftDrawerContent>

      {/* MCP Status */}
      <LeftDrawerFooter>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span>MCP Connected</span>
        </div>
      </LeftDrawerFooter>
    </LeftDrawer>
  );
}
