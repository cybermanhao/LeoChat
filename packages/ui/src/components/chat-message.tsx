import * as React from "react";
import { cn } from "../lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "./avatar";
import type { ChatMessage as ChatMessageType } from "@ai-chatbox/shared";

export interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
  children?: React.ReactNode;
}

const ChatMessage = React.forwardRef<HTMLDivElement, ChatMessageProps>(
  ({ message, isStreaming, children }, ref) => {
    const isUser = message.role === "user";
    const isAssistant = message.role === "assistant";

    return (
      <div
        ref={ref}
        className={cn(
          "group flex gap-3 py-4",
          isUser && "flex-row-reverse"
        )}
      >
        <Avatar className="h-8 w-8 shrink-0">
          {isUser ? (
            <>
              <AvatarImage src="/user-avatar.png" alt="User" />
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                U
              </AvatarFallback>
            </>
          ) : (
            <>
              <AvatarImage src="/ai-avatar.png" alt="AI" />
              <AvatarFallback className="bg-secondary text-secondary-foreground text-xs">
                AI
              </AvatarFallback>
            </>
          )}
        </Avatar>

        <div
          className={cn(
            "flex max-w-[80%] flex-col gap-1",
            isUser && "items-end"
          )}
        >
          <div
            className={cn(
              "rounded-lg px-4 py-2",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
              isStreaming && isAssistant && "streaming-cursor"
            )}
          >
            {children || (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                {message.content}
              </div>
            )}
          </div>

          {message.metadata?.tokens && (
            <span className="text-xs text-muted-foreground">
              {message.metadata.tokens.output} tokens
            </span>
          )}
        </div>
      </div>
    );
  }
);
ChatMessage.displayName = "ChatMessage";

export { ChatMessage };
