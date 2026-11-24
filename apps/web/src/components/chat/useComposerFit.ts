/**
 * 输入框下方控件的排布（按 dsh 的 ui-conversation）：先按完整文字排；排不下一行时，只把模型控件换成图标
 * （compact = true）；连图标都放不下时允许换行。尺寸或内容变化后重新测量。
 */
import { useLayoutEffect, useRef, useState } from "react";

/** 一行里的子元素是否都在同一行（看 offsetTop） */
function fitsOneLine(row: HTMLElement): boolean {
  const kids = Array.from(row.children) as HTMLElement[];
  if (kids.length < 2) return true;
  const top = kids[0]!.offsetTop;
  return kids.every((k) => Math.abs(k.offsetTop - top) < 4);
}

export function useComposerFit(contentKey: string) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const lastWidth = useRef<number | null>(null);
  /** 需要重新测量（内容、宽度或节点变了）；流式输出时每个字都会重新渲染，平时不测，避免强制排版 */
  const dirty = useRef(true);
  /** 标记需要测量后强制重新渲染一次（compact 本来就是 false 时 setCompact(false) 不会触发渲染） */
  const [, bump] = useState(0);

  // 内容变了（模型名、权限……）：回到完整文字重新量
  useLayoutEffect(() => {
    dirty.current = true;
    setCompact(false);
  }, [contentKey]);

  // 完整文字排不下 → 切成图标（useLayoutEffect：在绘制前完成，不闪）
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row || compact || !dirty.current) return;
    dirty.current = false;
    if (!fitsOneLine(row)) setCompact(true);
  });

  // 宽度变化：回到完整文字重新量（只看宽度，避免切换本身引起的高度变化反复触发）。
  // 欢迎页和对话页的工具栏是不同的节点：每次渲染检查，节点变了才重新监听
  const observer = useRef<{ el: HTMLElement; ro: ResizeObserver } | null>(null);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (observer.current?.el === row || typeof ResizeObserver === "undefined") return;
    observer.current?.ro.disconnect();
    observer.current = null;
    lastWidth.current = null;
    dirty.current = true;
    if (!row) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry!.contentRect.width);
      if (lastWidth.current !== null && w !== lastWidth.current) {
        dirty.current = true;
        setCompact(false);
        bump((n) => n + 1);
      }
      lastWidth.current = w;
    });
    ro.observe(row);
    observer.current = { el: row, ro };
    bump((n) => n + 1); // 新节点：量一次
  });
  useLayoutEffect(() => () => observer.current?.ro.disconnect(), []);

  return { rowRef, compact };
}
