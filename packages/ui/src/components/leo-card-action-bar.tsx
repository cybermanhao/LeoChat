import type { LeoCardAction } from "@ai-chatbox/shared";
import { cn } from "../lib/utils";

// ---------- Action button kind styles ----------

const kindClasses: Record<string, string> = {
  primary: "bg-primary text-primary-foreground hover:bg-primary/90",
  secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  danger: "bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-400",
};

const defaultKindClass =
  "bg-muted text-foreground hover:bg-accent";

// ---------- Component ----------

export interface LeoCardActionBarProps {
  actions: LeoCardAction[];
  onAction?: (action: LeoCardAction) => void;
}

export function LeoCardActionBar({ actions, onAction }: LeoCardActionBarProps) {
  if (!actions || actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className={cn(
            "inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            kindClasses[action.kind ?? ""] ?? defaultKindClass
          )}
          onClick={() => onAction?.(action)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
