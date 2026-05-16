// apps/web/src/components/mcp/LawKnowledgeTab.tsx
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen, FileText, RefreshCw, Loader2,
  CheckCircle2, AlertCircle, Upload,
} from 'lucide-react';
import { cn, Button } from '@ai-chatbox/ui';
import { kbApi, type KbStatus } from '../../lib/kbApi';

type SyncState = 'idle' | 'syncing' | 'done' | 'error';

export function LawKnowledgeTab() {
  const [status, setStatus] = useState<KbStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [dragOver, setDragOver] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      setStatus(await kbApi.getStatus());
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  const handleSyncFlk = async () => {
    setSyncState('syncing');
    setMessage(null);
    try {
      const res = await kbApi.syncFlk();
      setMessage(res.message);
      setSyncState('done');
      setTimeout(fetchStatus, 3000);
    } catch {
      setSyncState('error');
      setMessage('同步启动失败，请检查网络连接');
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setIndexing(true);
    setMessage(null);
    let ok = 0;
    for (const file of Array.from(files)) {
      const filePath = (file as File & { path?: string }).path ?? file.name;
      try {
        const result = await kbApi.indexFile(filePath);
        if (result.success) ok++;
      } catch { /* continue */ }
    }
    setMessage(`已导入 ${ok}/${files.length} 个文件`);
    setIndexing(false);
    fetchStatus();
  };

  const isError = syncState === 'error';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-9 border-b shrink-0">
        <span className="text-xs font-medium text-muted-foreground">知识库</span>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={fetchStatus} title="刷新">
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center h-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <StatRow
              icon={<BookOpen className="h-4 w-4 text-blue-500" />}
              label="法律法规"
              count={status?.law_count ?? 0}
              action={{ label: '同步', loading: syncState === 'syncing', onClick: handleSyncFlk }}
            />
            <StatRow
              icon={<FileText className="h-4 w-4 text-green-500" />}
              label="我的文档"
              count={status?.user_doc_count ?? 0}
            />
          </>
        )}

        {message && (
          <div className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded text-xs',
            isError ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-600'
          )}>
            {isError
              ? <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
            {message}
          </div>
        )}

        <div
          className={cn(
            'border-2 border-dashed rounded-lg p-5 text-center cursor-pointer transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
            indexing && 'opacity-50 pointer-events-none'
          )}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".txt,.md"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {indexing
            ? <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
            : (
              <>
                <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1.5" />
                <p className="text-xs text-muted-foreground">拖拽文件到此处添加</p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">支持 .txt .md</p>
              </>
            )}
        </div>
      </div>
    </div>
  );
}

function StatRow({
  icon, label, count, action,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  action?: { label: string; loading?: boolean; onClick: () => void };
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-md bg-muted/20 border border-border">
      {icon}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium">{label}</span>
        <span className="text-[10px] text-muted-foreground ml-2 font-mono">
          {count.toLocaleString()} 条
        </span>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          disabled={action.loading}
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {action.loading && <Loader2 className="h-3 w-3 animate-spin" />}
          {action.label}
        </button>
      )}
    </div>
  );
}
