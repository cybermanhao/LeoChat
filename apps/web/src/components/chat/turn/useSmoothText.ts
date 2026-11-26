/**
 * 流式正文的平滑显示（2026-11-25 用户选定；dsh 没有这一层，见计划 §9.1）：
 * 网络不稳时模型的输出会积压后一次性到达，页面就一段一段地跳。这里把收到的字按均匀速度逐字显示：
 * 积压越多显示越快（最多落后约 0.3 秒），积压少时每次一两个字；回答结束立刻显示全部。
 * 每秒最多更新约 30 次，避免长回答的 Markdown 被过于频繁地重新解析。
 */
import { useEffect, useRef, useState } from "react";

/** 两次显示之间的最短间隔（约 30 次/秒） */
const TICK_MS = 33;
/** 积压的字在大约这么多次更新内追平（约 0.3 秒） */
const CATCH_UP_TICKS = 10;

/** 下一次显示多少个字：每次至少前进 1 个字，积压越多步子越大 */
export function nextShownLength(shown: number, target: number): number {
  if (shown >= target) return target;
  const backlog = target - shown;
  return shown + Math.max(1, Math.ceil(backlog / CATCH_UP_TICKS));
}

export function useSmoothText(text: string, streaming: boolean): string {
  const [shown, setShown] = useState(() => (streaming ? 0 : text.length));
  const shownRef = useRef(shown);
  shownRef.current = shown;
  const textRef = useRef(text);
  textRef.current = text;

  // 结束了，或者文字被整体替换（不是在后面追加）：直接显示全部
  const replaced = shown > text.length;
  useEffect(() => {
    if (!streaming || replaced) setShown(text.length);
  }, [streaming, replaced, text.length]);

  useEffect(() => {
    if (!streaming) return;
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      if (now - last >= TICK_MS) {
        last = now;
        const target = textRef.current.length;
        if (shownRef.current < target) setShown(nextShownLength(shownRef.current, target));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [streaming]);

  return !streaming || replaced ? text : text.slice(0, shown);
}
