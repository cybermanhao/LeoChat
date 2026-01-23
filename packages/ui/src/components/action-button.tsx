import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "../lib/utils";
import { Skeleton } from "./skeleton";

const actionButtonVariants = cva(
  "action-button inline-flex items-center gap-2 rounded-md border px-4 py-2 text-sm font-medium transition-all",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary/10 text-primary hover:bg-primary/20",
        secondary:
          "border-secondary bg-secondary/10 text-secondary-foreground hover:bg-secondary/20",
        success: "border-green-500 bg-green-500/10 text-green-600 hover:bg-green-500/20",
        warning: "border-yellow-500 bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20",
        danger: "border-red-500 bg-red-500/10 text-red-600 hover:bg-red-500/20",
      },
      state: {
        idle: "",
        loading: "cursor-wait opacity-70",
        pending: "cursor-default opacity-50",
      },
    },
    defaultVariants: {
      variant: "default",
      state: "idle",
    },
  }
);

export interface ActionButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "name">,
    VariantProps<typeof actionButtonVariants> {
  actionName: string;
  label?: string;
  icon?: React.ReactNode;
  isLoading?: boolean;
  isPending?: boolean;
  onAction?: (actionName: string, attributes: Record<string, string>) => void;
  attributes?: Record<string, string>;
}

const ActionButton = React.forwardRef<HTMLButtonElement, ActionButtonProps>(
  (
    {
      className,
      variant,
      actionName,
      label,
      icon,
      isLoading = false,
      isPending = false,
      onAction,
      attributes = {},
      children,
      ...props
    },
    ref
  ) => {
    const state = isLoading ? "loading" : isPending ? "pending" : "idle";
    const displayLabel = label || actionName;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isLoading || isPending) return;
      onAction?.(actionName, attributes);
      props.onClick?.(e);
    };

    return (
      <button
        ref={ref}
        className={cn(actionButtonVariants({ variant, state, className }))}
        onClick={handleClick}
        disabled={isLoading || isPending || props.disabled}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          icon
        )}
        {children || displayLabel}
      </button>
    );
  }
);
ActionButton.displayName = "ActionButton";

/**
 * Placeholder for action buttons during streaming
 */
export interface ActionButtonSkeletonProps {
  count?: number;
  className?: string;
}

function ActionButtonSkeleton({
  count = 2,
  className,
}: ActionButtonSkeletonProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-24 rounded-md" />
      ))}
    </div>
  );
}

/**
 * Container for parsed action buttons from AI response
 */
export interface ActionButtonGroupProps {
  actions: Array<{
    name: string;
    label?: string;
    attributes?: Record<string, string>;
  }>;
  isStreaming?: boolean;
  onAction?: (actionName: string, attributes: Record<string, string>) => void;
  loadingAction?: string;
  className?: string;
}

function ActionButtonGroup({
  actions,
  isStreaming = false,
  onAction,
  loadingAction,
  className,
}: ActionButtonGroupProps) {
  if (isStreaming) {
    return <ActionButtonSkeleton count={actions.length || 2} className={className} />;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {actions.map((action, i) => (
        <ActionButton
          key={`${action.name}-${i}`}
          actionName={action.name}
          label={action.label}
          attributes={action.attributes}
          onAction={onAction}
          isLoading={loadingAction === action.name}
        />
      ))}
    </div>
  );
}

export { ActionButton, ActionButtonSkeleton, ActionButtonGroup };
