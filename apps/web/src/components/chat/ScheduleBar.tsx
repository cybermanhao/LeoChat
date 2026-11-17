/**
 * 当前会话的定时提醒（/loop）：每个提醒一枚标签，显示规则、下次时间，可删除。
 */
import { AlarmClock, X } from "lucide-react";
import { useChatStore } from "../../stores/chat";
import { describeRule } from "../../lib/loop-command";

function formatNext(t: number | null): string {
  if (t === null) return "已结束";
  const d = new Date(t);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  return sameDay ? `今天 ${time}` : `${d.getMonth() + 1}月${d.getDate()}日 ${time}`;
}

export function ScheduleBar() {
  const schedules = useChatStore((s) => s.schedules);
  const deleteSchedule = useChatStore((s) => s.deleteSchedule);
  if (!schedules.length) return null;
  return (
    <div className="flex-shrink-0 border-t border-border bg-card px-4 py-1.5" data-testid="schedule-bar">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-1.5">
        <AlarmClock className="h-3.5 w-3.5 text-muted-foreground" />
        {schedules.map((s) => (
          <span
            key={s.id}
            className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground"
            title={`${s.prompt}\n下次：${formatNext(s.nextAt)}（${s.timeZone}）`}
          >
            <span className="text-primary">{describeRule(s.rule)}</span>
            <span className="max-w-[14rem] truncate">{s.title}</span>
            <span className="text-muted-foreground">· {formatNext(s.nextAt)}</span>
            <button
              className="ml-0.5 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={() => void deleteSchedule(s.id)}
              aria-label={`删除提醒 ${s.title}`}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
    </div>
  );
}
