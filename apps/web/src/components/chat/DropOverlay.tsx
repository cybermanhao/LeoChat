/**
 * 拖放附件（按 dsh 的 ui-attachment）：拖着文件经过窗口时显示铺满窗口的提示（插图、标题、大小限制），
 * 松开就加到待发送附件里。监听挂在 document 上，整个窗口都能放。
 */
import { useEffect, useRef, useState } from "react";
import { FileUp } from "lucide-react";

const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

export function DropOverlay({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [active, setActive] = useState(false);
  const depth = useRef(0);
  const onFilesRef = useRef(onFiles);
  onFilesRef.current = onFiles;

  useEffect(() => {
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current += 1;
      setActive(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault(); // 允许放下
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setActive(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length) onFilesRef.current(files);
    };
    document.addEventListener("dragenter", enter);
    document.addEventListener("dragleave", leave);
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("dragenter", enter);
      document.removeEventListener("dragleave", leave);
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
    };
  }, []);

  if (!active) return null;
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/80 backdrop-blur-sm"
      data-testid="drop-overlay"
      role="status"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/60 bg-card px-12 py-10 text-center">
        <FileUp className="h-10 w-10 text-primary" />
        <p className="text-base font-medium text-foreground">松开即可添加附件</p>
        <p className="text-xs text-muted-foreground">图片最大 20 MB，其它文件最大 50 MB；一条消息最多 10 个</p>
      </div>
    </div>
  );
}
