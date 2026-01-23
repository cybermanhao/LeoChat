import * as React from "react";
import { cn } from "../lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "code" | "mermaid" | "table" | "image";
}

function Skeleton({ className, variant = "default", ...props }: SkeletonProps) {
  const variantClasses = {
    default: "h-4 w-full",
    code: "h-32 w-full rounded-md",
    mermaid: "h-48 w-full rounded-md",
    table: "h-40 w-full rounded-md",
    image: "h-48 w-64 rounded-md",
  };

  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  );
}

export interface CodeBlockSkeletonProps
  extends React.HTMLAttributes<HTMLDivElement> {
  language?: string;
}

function CodeBlockSkeleton({
  className,
  language,
  ...props
}: CodeBlockSkeletonProps) {
  return (
    <div
      className={cn(
        "relative rounded-lg border bg-muted/50 p-4",
        className
      )}
      {...props}
    >
      {language && (
        <div className="absolute right-2 top-2 text-xs text-muted-foreground">
          {language}
        </div>
      )}
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </div>
  );
}

function MermaidSkeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border bg-muted/50 p-8",
        className
      )}
      {...props}
    >
      <div className="flex flex-col items-center space-y-4">
        <div className="flex space-x-4">
          <Skeleton className="h-12 w-24 rounded-md" />
          <Skeleton className="h-12 w-24 rounded-md" />
        </div>
        <Skeleton className="h-8 w-16" />
        <div className="flex space-x-4">
          <Skeleton className="h-12 w-24 rounded-md" />
          <Skeleton className="h-12 w-24 rounded-md" />
          <Skeleton className="h-12 w-24 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function TableSkeleton({
  className,
  rows = 4,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { rows?: number }) {
  return (
    <div
      className={cn("rounded-lg border bg-muted/50 p-4", className)}
      {...props}
    >
      {/* Header */}
      <div className="mb-4 flex space-x-4 border-b pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
      {/* Rows */}
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex space-x-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

function ImageSkeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border bg-muted/50",
        className
      )}
      {...props}
    >
      <svg
        className="h-12 w-12 text-muted-foreground/50"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"
        />
      </svg>
    </div>
  );
}

export { Skeleton, CodeBlockSkeleton, MermaidSkeleton, TableSkeleton, ImageSkeleton };
