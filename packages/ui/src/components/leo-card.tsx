import type { LeoCard, LeoCardAction, LeoCardTone } from "@ai-chatbox/shared";
import { cn } from "../lib/utils";
import { LeoCardBlockRenderer } from "./leo-card-blocks";
import { LeoCardActionBar } from "./leo-card-action-bar";

// ---------- Tone border styles ----------

const toneBorderClasses: Record<string, string> = {
  default: "border-l-border",
  info: "border-l-blue-500",
  success: "border-l-green-500",
  warning: "border-l-yellow-500",
  error: "border-l-red-500",
};

// ---------- Component ----------

export interface LeoCardViewProps {
  card: LeoCard;
  onAction?: (action: LeoCardAction) => void;
  className?: string;
}

export function LeoCardView({ card, onAction, className }: LeoCardViewProps) {
  const tone: LeoCardTone = card.tone ?? "default";
  const borderClass = toneBorderClasses[tone] ?? toneBorderClasses.default;
  const hasBody = card.body && card.body.length > 0;
  const hasActions = card.actions && card.actions.length > 0;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-4 border-l-4",
        borderClass,
        className
      )}
    >
      {/* Title area */}
      {(card.title || card.subtitle) && (
        <div className="mb-2">
          {card.title && (
            <div className="text-sm font-medium text-foreground">
              {card.title}
            </div>
          )}
          {card.subtitle && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {card.subtitle}
            </div>
          )}
        </div>
      )}

      {/* Body blocks */}
      {hasBody && (
        <div className="space-y-2">
          {card.body!.map((block, index) => (
            <LeoCardBlockRenderer key={index} block={block} />
          ))}
        </div>
      )}

      {/* Action bar */}
      {hasActions && (
        <div className={cn(hasBody || card.title ? "mt-3" : "")}>
          <LeoCardActionBar actions={card.actions!} onAction={onAction} />
        </div>
      )}
    </div>
  );
}
