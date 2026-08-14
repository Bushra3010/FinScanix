import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Progress({
  value,
  tone = "brand",
  className,
  size = "md",
}: {
  value: number;
  tone?: "brand" | "over" | "par" | "under" | "warning";
  className?: string;
  size?: "sm" | "md";
}) {
  const toneClass = {
    brand: "bg-brand",
    over: "bg-over",
    par: "bg-par",
    under: "bg-under",
    warning: "bg-warning",
  }[tone];
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full bg-surface-sunken",
        size === "sm" ? "h-1.5" : "h-2",
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-all duration-500", toneClass)}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-sunken text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && (
        <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse-soft rounded-md bg-surface-sunken", className)}
      {...props}
    />
  );
}

export function Divider({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("h-px w-full bg-border", className)} {...props} />;
}

/** Small labelled figure used across detail panels. */
export function Metric({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "over" | "under" | "par" | "default";
  className?: string;
}) {
  const toneClass =
    tone === "over"
      ? "text-over"
      : tone === "under"
        ? "text-under"
        : tone === "par"
          ? "text-par"
          : "text-foreground";
  return (
    <div className={className}>
      <p className="text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className={cn("tnum mt-1 text-lg font-semibold", toneClass)}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
