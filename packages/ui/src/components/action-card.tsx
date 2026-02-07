import { ExternalLink } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * Card data interface
 */
export interface ActionCardData {
  title?: string;
  description?: string;
  image?: string;
  link?: string;
  linkText?: string;
}

/**
 * Single ActionCard component - left image, right info layout
 */
export interface ActionCardProps extends ActionCardData {
  onClick?: () => void;
  className?: string;
}

export function ActionCard({
  title,
  description,
  image,
  link,
  linkText = "查看详情",
  onClick,
  className,
}: ActionCardProps) {
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (link) {
      window.open(link, "_blank", "noopener,noreferrer");
    }
  };

  const isClickable = onClick || link;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors",
        isClickable && "cursor-pointer hover:bg-accent/50",
        className
      )}
      onClick={isClickable ? handleClick : undefined}
    >
      {/* Left: Image */}
      {image && (
        <div className="shrink-0">
          <img
            src={image}
            alt={title || "card image"}
            className="h-20 w-20 rounded-lg object-cover"
            onError={(e) => {
              // Hide broken images
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
      )}

      {/* Right: Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {title && (
          <h4 className="font-medium leading-tight line-clamp-2">{title}</h4>
        )}
        {description && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {description}
          </p>
        )}
        {link && (
          <div className="mt-1 flex items-center gap-1 text-xs text-primary">
            <ExternalLink className="h-3 w-3" />
            <span>{linkText}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * ActionCardGroup component - renders multiple cards in grid layout
 */
export interface ActionCardGroupProps {
  cards: ActionCardData[];
  columns?: 1 | 2 | 3;
  isStreaming?: boolean;
  className?: string;
}

export function ActionCardGroup({
  cards,
  columns = 2,
  isStreaming = false,
  className,
}: ActionCardGroupProps) {
  if (cards.length === 0) return null;

  // Streaming state: show skeleton
  if (isStreaming) {
    return (
      <div
        className={cn(
          "grid gap-3",
          columns === 1 && "grid-cols-1",
          columns === 2 && "grid-cols-1 sm:grid-cols-2",
          columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
          className
        )}
      >
        {[1, 2].map((i) => (
          <div
            key={i}
            className="flex items-start gap-3 rounded-lg border bg-card p-3"
          >
            <div className="h-20 w-20 shrink-0 animate-pulse rounded-lg bg-muted" />
            <div className="flex flex-1 flex-col gap-2">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Single card: full width
  if (cards.length === 1) {
    return (
      <div className={className}>
        <ActionCard {...cards[0]} />
      </div>
    );
  }

  // Multiple cards: grid layout
  return (
    <div
      className={cn(
        "grid gap-3",
        columns === 1 && "grid-cols-1",
        columns === 2 && "grid-cols-1 sm:grid-cols-2",
        columns === 3 && "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
        className
      )}
    >
      {cards.map((card, index) => (
        <ActionCard key={index} {...card} />
      ))}
    </div>
  );
}
