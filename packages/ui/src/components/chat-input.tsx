import * as React from "react";
import { SendHorizontal, Paperclip, Mic, Square, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./button";

export type SendButtonState = "idle" | "sending" | "generating";

/** 连按两次 Esc 停止生成的最大间隔（与 dsh 默认值一致） */
export const ESC_STOP_SEQUENCE_MS = 500;

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
  /** 提供时才显示附件按钮（未接功能的按钮不显示） */
  onAttach?: () => void;
  /** 提供时才显示语音按钮（输入为空时显示） */
  onVoice?: () => void;
  className?: string;
  /** 工具栏渲染在输入框下方 */
  toolbar?: React.ReactNode;
  /** 运行中按 Enter：插话，在下一个步骤边界送达（输入框第 1 期，参考 dsh / codex） */
  onSteer?: () => void;
  /** 运行中按 Ctrl/Cmd+Enter：排队，本轮结束后接着处理 */
  onQueue?: () => void;
  /** 先于输入框处理按键（例如 / 命令菜单的上下选择、回车确认）；返回 true 表示已处理 */
  interceptKey?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
}

/** 输入法组字期间（中文拼音选词等）的按键不能当作发送或停止 */
export function isImeComposing(e: React.KeyboardEvent): boolean {
  // keyCode 229 兼容部分浏览器在 compositionend 之后紧跟的那次 keydown
  return e.nativeEvent.isComposing || e.keyCode === 229;
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
      onAttach,
      onVoice,
      className,
      toolbar,
      onSteer,
      onQueue,
      interceptKey,
    },
    ref
  ) => {
    // 兼容旧的 isLoading prop
    const sendState: SendButtonState = sendStateProp ?? (isLoading ? "generating" : "idle");
    const isBusy = sendState !== "idle";

    const textareaRef = React.useRef<HTMLTextAreaElement>(null);
    const lastEscAtRef = React.useRef<number | null>(null);

    // 运行结束后清空 Esc 序列，避免跨轮次误触
    React.useEffect(() => {
      if (!isBusy) lastEscAtRef.current = null;
    }, [isBusy]);

    // Merge forwarded ref with local ref to support both callback and object refs
    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node;
        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = node;
        }
      },
      [ref]
    );

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (isImeComposing(e)) return;
      if (interceptKey?.(e)) {
        e.preventDefault();
        return;
      }

      if (e.key === "Escape") {
        if (!isBusy || !onCancel || e.repeat) return;
        const now = Date.now();
        const last = lastEscAtRef.current;
        if (last !== null && now - last <= ESC_STOP_SEQUENCE_MS) {
          e.preventDefault();
          lastEscAtRef.current = null;
          onCancel();
        } else {
          lastEscAtRef.current = now;
        }
        return;
      }
      lastEscAtRef.current = null;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!value.trim()) return;
        if (!isBusy) {
          onSend();
        } else if ((e.ctrlKey || e.metaKey) && onQueue) {
          onQueue();
        } else if (!e.ctrlKey && !e.metaKey && onSteer) {
          onSteer();
        }
        // 没有提供 onSteer / onQueue 时，运行中按 Enter 只保留草稿
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
          {onAttach && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={onAttach}
              disabled={disabled || isBusy}
            >
              <Paperclip className="h-5 w-5" />
              <span className="sr-only">Attach file</span>
            </Button>
          )}

          {/* 运行中不禁用：用户可以先写下一条消息 */}
          <textarea
            ref={setRefs}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={disabled}
            rows={1}
            className={cn(
              "flex-1 resize-none bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
              "scrollbar-thin max-h-[200px]"
            )}
          />

          {onVoice && !value && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={onVoice}
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
              title="Stop (Esc Esc)"
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
