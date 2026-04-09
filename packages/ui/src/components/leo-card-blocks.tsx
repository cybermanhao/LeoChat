import type {
  LeoCardBlock,
  LeoCardTextBlock,
  LeoCardFieldsBlock,
  LeoCardImageBlock,
  LeoCardImagesBlock,
  LeoCardProgressBlock,
  LeoCardBadgeBlock,
} from "@ai-chatbox/shared";
import { cn } from "../lib/utils";

// ---------- Individual block renderers ----------

function TextBlockView({ block }: { block: LeoCardTextBlock }) {
  // For markdown format, render as-is for now (markdown support will be wired later)
  return (
    <div className="text-sm text-foreground whitespace-pre-wrap">
      {block.text}
    </div>
  );
}

function FieldsBlockView({ block }: { block: LeoCardFieldsBlock }) {
  if (!block.fields || block.fields.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {block.fields.map((field, index) => (
        <div key={index} className="min-w-0">
          <div className="text-xs text-muted-foreground truncate">
            {field.label}
          </div>
          <div className="text-sm text-foreground break-words">
            {field.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function ImageBlockView({ block }: { block: LeoCardImageBlock }) {
  if (!block.image?.url) return null;

  return (
    <div>
      <img
        src={block.image.url}
        alt={block.image.alt || ""}
        className="max-w-full rounded-md"
        onError={(e) => {
          (e.target as HTMLImageElement).style.display = "none";
        }}
      />
    </div>
  );
}

function ImagesBlockView({ block }: { block: LeoCardImagesBlock }) {
  if (!block.images || block.images.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {block.images.map((img, index) => (
        <img
          key={index}
          src={img.url}
          alt={img.alt || ""}
          className="w-full rounded-md object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      ))}
    </div>
  );
}

function ProgressBlockView({ block }: { block: LeoCardProgressBlock }) {
  const { value, max = 100, label } = block.progress;
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">
            {Math.round(percentage)}%
          </span>
        </div>
      )}
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

const badgeToneClasses: Record<string, string> = {
  default: "bg-muted text-foreground",
  info: "bg-primary/10 text-primary",
  success: "bg-green-500/10 text-green-600 dark:text-green-400",
  warning: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  error: "bg-red-500/10 text-red-600 dark:text-red-400",
};

function BadgeBlockView({ block }: { block: LeoCardBadgeBlock }) {
  const tone = block.badge.tone || "default";
  const toneClass = badgeToneClasses[tone] || badgeToneClasses.default;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        toneClass
      )}
    >
      {block.badge.text}
    </span>
  );
}

function DividerBlockView() {
  return <hr className="border-border" />;
}

// ---------- Main block renderer ----------

export interface LeoCardBlockRendererProps {
  block: LeoCardBlock;
}

export function LeoCardBlockRenderer({ block }: LeoCardBlockRendererProps) {
  switch (block.type) {
    case "text":
      return <TextBlockView block={block} />;
    case "fields":
      return <FieldsBlockView block={block} />;
    case "image":
      return <ImageBlockView block={block} />;
    case "images":
      return <ImagesBlockView block={block} />;
    case "progress":
      return <ProgressBlockView block={block} />;
    case "badge":
      return <BadgeBlockView block={block} />;
    case "divider":
      return <DividerBlockView />;
    default:
      // Unknown block types are silently skipped
      return null;
  }
}
