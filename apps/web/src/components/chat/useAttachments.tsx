/**
 * 待发送的附件（重设计 P3b，按 dsh 的 ui-attachment）：选文件 / 粘贴 / 拖放后立刻上传，输入框里显示附件条，可移除、失败可重试。
 * 发送成功后清空；发送失败时保留，方便重试。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Loader2, RotateCw, X } from "lucide-react";
import { cn } from "@ai-chatbox/ui";
import { agentApi, type AttachmentMeta } from "../../lib/agent-api";

const MAX_PENDING = 10;

export interface Pending {
  key: string;
  name: string;
  /** 原始文件：上传失败时重试用 */
  file: File;
  status: "uploading" | "ready" | "error";
  meta?: AttachmentMeta;
  error?: string;
  /** 图片的本地预览（object URL） */
  preview?: string;
}

let seq = 0;

export function useAttachments() {
  const [items, setItems] = useState<Pending[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  /** 进行中的上传（settled() 用） */
  const inflight = useRef(new Map<string, Promise<void>>());
  /** 每个附件最新的状态（包括已经从输入框拿走、正在发送的） */
  const final = useRef(new Map<string, Pending>());

  // 卸载时释放预览
  useEffect(() => () => itemsRef.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)), []);

  const add = useCallback((files: File[]) => {
    const room = MAX_PENDING - itemsRef.current.length;
    for (const file of files.slice(0, Math.max(room, 0))) {
      const key = `p${++seq}`;
      const preview = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      const item: Pending = { key, name: file.name || "file", file, status: "uploading", ...(preview ? { preview } : {}) };
      itemsRef.current = [...itemsRef.current, item];
      setItems((s) => [...s, item]);
      final.current.set(key, item);
      upload(key, file);
    }
  }, []);

  /** 上传一个附件（新加或失败后重试） */
  const upload = useCallback((key: string, file: File) => {
    {
      const update = (patch: Partial<Pending>) => {
        final.current.set(key, { ...final.current.get(key)!, ...patch });
        // 同步更新 ref：settled() 在上传结束后立刻读取，不等 React 重新渲染
        itemsRef.current = itemsRef.current.map((i) => (i.key === key ? { ...i, ...patch } : i));
        setItems((s) => s.map((i) => (i.key === key ? { ...i, ...patch } : i)));
      };
      const p = agentApi.uploadAttachment(file).then(
        (meta) => update({ status: "ready", meta }),
        (e: unknown) => update({ status: "error", error: e instanceof Error ? e.message : "上传失败" }),
      );
      inflight.current.set(key, p);
      void p.finally(() => inflight.current.delete(key));
    }
  }, []);

  const retry = useCallback(
    (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (!item || item.status !== "error") return;
      const patch = { status: "uploading" as const, error: undefined };
      itemsRef.current = itemsRef.current.map((i) => (i.key === key ? { ...i, ...patch } : i));
      setItems((s) => s.map((i) => (i.key === key ? { ...i, ...patch } : i)));
      upload(key, item.file);
    },
    [upload],
  );

  const remove = useCallback((key: string) => {
    itemsRef.current = itemsRef.current.filter((i) => i.key !== key);
    setItems((s) => {
      const gone = s.find((i) => i.key === key);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return s.filter((i) => i.key !== key);
    });
  }, []);

  const clear = useCallback(() => {
    itemsRef.current = [];
    setItems((s) => {
      s.forEach((i) => i.preview && URL.revokeObjectURL(i.preview));
      return [];
    });
  }, []);

  /** 发送时先拿走全部附件（输入框里立刻清空，和文字一致）；发送失败用 restore 放回 */
  const take = useCallback((): Pending[] => {
    const all = itemsRef.current;
    itemsRef.current = [];
    setItems([]);
    return all;
  }, []);
  const restore = useCallback((taken: Pending[]) => {
    const back = taken.map((i) => final.current.get(i.key) ?? i);
    itemsRef.current = [...back, ...itemsRef.current];
    setItems((s) => [...back, ...s]);
  }, []);
  /** 发送成功后释放拿走的附件的预览 */
  const release = useCallback(
    (gone: Pending[]) =>
      gone.forEach((i) => {
        if (i.preview) URL.revokeObjectURL(i.preview);
        final.current.delete(i.key);
      }),
    [],
  );

  /** 等这些附件的上传结束；返回上传好的，以及失败的文件名 */
  const settled = useCallback(async (taken: Pending[]): Promise<{ ready: AttachmentMeta[]; failed: string[] }> => {
    await Promise.all(taken.map((i) => inflight.current.get(i.key)).filter(Boolean));
    const latest = new Map(final.current);
    const now = taken.map((i) => latest.get(i.key) ?? i);
    return {
      ready: now.flatMap((i) => (i.status === "ready" && i.meta ? [i.meta] : [])),
      failed: now.filter((i) => i.status === "error").map((i) => i.name),
    };
  }, []);

  const ready = items.flatMap((i) => (i.status === "ready" && i.meta ? [i.meta] : []));
  const uploading = items.some((i) => i.status === "uploading");
  return { items, ready, uploading, add, remove, clear, settled, take, restore, release, retry };
}

/** "PDF · 12 KB"：大写扩展名加大小（dsh 的文件卡片） */
export function fileCaption(name: string, bytes?: number): string {
  const ext = /\.([a-z0-9]{1,8})$/i.exec(name)?.[1]?.toUpperCase() ?? "FILE";
  if (bytes === undefined) return ext;
  const size = bytes < 1024 ? `${bytes} B` : bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${ext} · ${size}`;
}

/**
 * 待发送附件条（按 dsh 的 ui-attachment）：按选择顺序排成一条不换行的横条，条目高 64px：
 * 图片是 64px 方形缩略图，文件是 240px 宽的卡片（图标、文件名、大写扩展名和大小）。
 * 溢出时两端有翻页箭头、滚动条隐藏，新加的条目滚到可见；上传中转圈，失败可重试；
 * 移除按钮悬停或聚焦时出现，触屏上一直显示。
 */
export function AttachmentRail({
  items,
  onRemove,
  onRetry,
}: {
  items: Pending[];
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const count = items.length;

  const updateEdges = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);
  // 新加的条目滚到可见（在条的末尾）
  const prevCount = useRef(count);
  useEffect(() => {
    const el = railRef.current;
    if (el && count > prevCount.current) el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
    prevCount.current = count;
    updateEdges();
  }, [count, updateEdges]);

  if (!count) return null;
  const page = (dir: -1 | 1) => railRef.current?.scrollBy({ left: dir * (railRef.current.clientWidth - 64), behavior: "smooth" });
  const arrow = "absolute top-1/2 z-10 -translate-y-1/2 rounded-full border border-border bg-card p-1 text-muted-foreground shadow hover:text-foreground";

  return (
    <div className="relative pb-1.5" data-testid="pending-attachments">
      {edges.left && (
        <button type="button" className={cn(arrow, "left-0")} onClick={() => page(-1)} aria-label="向前翻">
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}
      <div ref={railRef} onScroll={updateEdges} className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((i) => (
          <div
            key={i.key}
            className={cn(
              "group/att relative h-16 shrink-0 overflow-hidden border border-border bg-muted",
              i.preview ? "w-16 rounded-lg" : "flex w-60 items-center gap-2.5 rounded-2xl px-3",
            )}
            title={i.error ?? i.name}
            data-status={i.status}
          >
            {i.preview ? (
              <img src={i.preview} alt={i.name} className="h-full w-full object-cover" />
            ) : (
              <>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary/80 to-primary text-primary-foreground">
                  {i.status === "uploading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium text-foreground">{i.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{fileCaption(i.name, i.meta?.bytes ?? i.file.size)}</span>
                </span>
              </>
            )}
            {i.preview && i.status === "uploading" && (
              <span className="absolute inset-0 flex items-center justify-center bg-background/50">
                <Loader2 className="h-4 w-4 animate-spin text-foreground" />
              </span>
            )}
            {i.status === "error" && (
              <button
                type="button"
                onClick={() => onRetry(i.key)}
                aria-label={`重试上传 ${i.name}`}
                className="absolute inset-0 flex items-center justify-center gap-1 bg-background/80 text-xs text-destructive"
              >
                <RotateCw className="h-3.5 w-3.5" />
                重试
              </button>
            )}
            <button
              type="button"
              onClick={() => onRemove(i.key)}
              aria-label={`移除附件 ${i.name}`}
              className="absolute right-1 top-1 z-10 rounded-full bg-card/90 p-0.5 text-muted-foreground opacity-0 shadow transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/att:opacity-100 [@media(hover:none)]:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      {edges.right && (
        <button type="button" className={cn(arrow, "right-0")} onClick={() => page(1)} aria-label="向后翻">
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
