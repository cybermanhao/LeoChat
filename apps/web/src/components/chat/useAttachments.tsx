/**
 * 待发送的附件（重设计 P3b）：选文件 / 粘贴 / 拖放后立刻上传，输入框顶部显示一排卡片，可移除。
 * 发送成功后清空；发送失败时保留，方便重试。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, X, AlertCircle } from "lucide-react";
import { agentApi, type AttachmentMeta } from "../../lib/agent-api";

const MAX_PENDING = 10;

interface Pending {
  key: string;
  name: string;
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
      const item: Pending = { key, name: file.name || "file", status: "uploading", ...(preview ? { preview } : {}) };
      itemsRef.current = [...itemsRef.current, item];
      setItems((s) => [...s, item]);
      final.current.set(key, item);
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
  return { items, ready, uploading, add, remove, clear, settled, take, restore, release };
}

/** 输入框顶部的一排附件卡片 */
export function AttachmentChips({ items, onRemove }: { items: Pending[]; onRemove: (key: string) => void }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pb-1" data-testid="pending-attachments">
      {items.map((i) => (
        <div
          key={i.key}
          className="group/att relative flex max-w-[14rem] items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground"
          title={i.error ?? i.name}
        >
          {i.preview ? (
            <img src={i.preview} alt="" className="h-6 w-6 shrink-0 rounded object-cover" />
          ) : (
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{i.name}</span>
          {i.status === "uploading" && <Loader2 className="h-3 w-3 shrink-0 animate-spin text-muted-foreground" />}
          {i.status === "error" && <AlertCircle className="h-3 w-3 shrink-0 text-destructive" />}
          <button
            type="button"
            onClick={() => onRemove(i.key)}
            aria-label={`移除附件 ${i.name}`}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
