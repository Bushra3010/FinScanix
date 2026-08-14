import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "brand"
  | "over"
  | "under"
  | "par"
  | "warning"
  | "outline";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  brand: "bg-brand-soft text-brand-soft-foreground border-transparent",
  over: "bg-over-soft text-over-foreground border-transparent",
  under: "bg-under-soft text-under-foreground border-transparent",
  par: "bg-par-soft text-par-foreground border-transparent",
  warning: "bg-warning-soft text-warning border-transparent",
  outline: "bg-transparent text-muted-foreground border-border-strong",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  dot?: boolean;
}

export function Badge({ tone = "neutral", dot, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11.5px] font-medium whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
