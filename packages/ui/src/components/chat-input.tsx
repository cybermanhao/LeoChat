import * as React from "react";
import { SendHorizontal, Paperclip, Mic, Square, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export type SendButtonState = "idle" | "sending" | "generating";

export interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onCancel?: () => void;
  /** @deprecated Use sendState instead */
  isLoading?: boolean;
  /** 发送按钮状态: idle=发送图标, sending=转圈, generating=停止图标 */
  sendState?: SendButtonState;
  placeholder?: string;
  disabled?: boolean;
  showAttachment?: boolean;
  showVoice?: boolean;
  className?: string;
  /** 工具栏渲染在输入框下方 */
  toolbar?: React.ReactNode;
}

const ChatInput = React.forwardRef<HTMLTextAreaElement, ChatInputProps>(
  (
    {
      value,
      onChange,
      onSend,
      onCancel,
      isLoading = false,
      sendState: sendStateProp,
      placeholder = "Type a message...",
      disabled = false,
      showAttachment = true,
      showVoice = false,
      className,
      toolbar,
    },
    ref
  ) => {
    // 兼容旧的 isLoading prop
    const sendState: SendButtonState = sendStateProp ?? (isLoading ? "generating" : "idle");
    const isBusy = sendState !== "idle";

    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const combinedRef = ref || textareaRef;

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isBusy && value.trim()) {
          onSend();
        }
      }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      // Auto-resize textarea
      const textarea = e.target;
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    };

    return (
      <div className={cn("flex flex-col", className)}>
        {/* 输入区域 */}
        <div
          className={cn(
            "flex items-end gap-2 rounded-lg border bg-background p-2",
            toolbar && "rounded-b-none border-b-0"
          )}
        >
          {showAttachment && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={disabled || isBusy}
            >
              <Paperclip className="h-5 w-5" />
              <span className="sr-only">Attach file</span>
            </Button>
          )}

          <textarea
            ref={combinedRef as React.RefObject<HTMLTextAreaElement>}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled || isBusy}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
              "scrollbar-thin max-h-[200px]"
            )}
          />

          {showVoice && !value && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={disabled || isBusy}
            >
              <Mic className="h-5 w-5" />
              <span className="sr-only">Voice input</span>
            </Button>
          )}

          {/* 发送按钮：三种状态 */}
          {sendState === "sending" ? (
            // 发送中：显示转圈
            <Button
              type="button"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled
            >
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="sr-only">Sending...</span>
            </Button>
          ) : sendState === "generating" ? (
            // 生成中：显示停止按钮
            <Button
              type="button"
              variant="destructive"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={onCancel}
            >
              <Square className="h-4 w-4" />
              <span className="sr-only">Stop generating</span>
            </Button>
          ) : (
            // 空闲：显示发送按钮
            <Button
              type="button"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={onSend}
              disabled={disabled || !value.trim()}
            >
              <SendHorizontal className="h-5 w-5" />
              <span className="sr-only">Send message</span>
            </Button>
          )}
        </div>

        {/* 工具栏 */}
        {toolbar && (
          <div className="rounded-b-lg border border-t-0 bg-muted/30 px-2">
            {toolbar}
          </div>
        )}
      </div>
    );
  }
);
ChatInput.displayName = "ChatInput";

export { ChatInput };
