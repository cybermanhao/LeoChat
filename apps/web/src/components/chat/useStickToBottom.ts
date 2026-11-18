/**
 * 聊天区"贴底"滚动：
 * - 贴底时，内容变高（流式输出、工具结果展开）就直接跳到底部，每帧最多一次，不用 smooth 动画
 *   （以前每个 token 都触发一次 smooth 滚动，动画互相打断，看起来一抽一抽的）
 * - 用户向上滚动就停止跟随，回到底部附近（或点"回到底部"）再继续
 * - 区分用户滚动和程序滚动：程序只会往下滚，所以"滚动位置变小"一定是用户；内容变高不改变滚动位置，不会误判
 * 用回调 ref：消息区不是一直渲染（空会话显示欢迎页），元素出现 / 更换时自动挂上监听
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** 距底部多少像素以内算"在底部" */
export const STICK_THRESHOLD_PX = 80;

/** 纯函数：根据一次滚动事件更新是否贴底（便于测试） */
export function nextStick(
  state: { stuck: boolean; lastTop: number },
  el: { scrollTop: number; scrollHeight: number; clientHeight: number },
): boolean {
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  if (distance <= STICK_THRESHOLD_PX) return true;
  if (el.scrollTop < state.lastTop - 1) return false; // 向上滚：用户在看前面的内容
  return state.stuck;
}

export function useStickToBottom() {
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null);
  const stuck = useRef(true);
  const lastTop = useRef(0);
  const frame = useRef<number | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const jump = useCallback(() => {
    if (!scrollEl) return;
    scrollEl.scrollTop = scrollEl.scrollHeight;
    lastTop.current = scrollEl.scrollTop;
  }, [scrollEl]);

  // 用户滚动：更新是否贴底
  useEffect(() => {
    if (!scrollEl) return;
    lastTop.current = scrollEl.scrollTop;
    const onScroll = () => {
      const next = nextStick({ stuck: stuck.current, lastTop: lastTop.current }, scrollEl);
      lastTop.current = scrollEl.scrollTop;
      if (next !== stuck.current) {
        stuck.current = next;
        setIsAtBottom(next);
      }
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => scrollEl.removeEventListener("scroll", onScroll);
  }, [scrollEl]);

  // 内容变高：贴底时下一帧跟到底部（同一帧内多次变化只滚一次）
  useEffect(() => {
    if (!contentEl || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (frame.current !== null) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        if (stuck.current) jump();
      });
    });
    ro.observe(contentEl);
    return () => {
      ro.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [contentEl, jump]);

  /** 回到底部并恢复跟随；smooth 用于用户点击"回到底部" */
  const scrollToBottom = useCallback(
    (smooth = false) => {
      stuck.current = true;
      setIsAtBottom(true);
      if (!scrollEl) return;
      if (smooth) scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: "smooth" });
      else jump();
    },
    [scrollEl, jump],
  );

  return { scrollRef: setScrollEl, contentRef: setContentEl, isAtBottom, scrollToBottom };
}
