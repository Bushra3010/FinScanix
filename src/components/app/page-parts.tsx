import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { InvoiceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5",
        className,
      )}
    >
      <div className="min-w-0">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
        {description && (
          <div className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted-foreground">
            {description}
          </div>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: ReactNode;
  tone?: "neutral" | "over" | "par" | "under" | "brand";
}) {
  const iconTone = {
    neutral: "bg-muted text-muted-foreground",
    over: "bg-over-soft text-over",
    par: "bg-par-soft text-par",
    under: "bg-under-soft text-under",
    brand: "bg-brand-soft text-brand",
  }[tone];

  return (
    <div className="rounded-xl border border-border bg-surface p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[12.5px] font-medium text-muted-foreground">{label}</p>
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", iconTone)}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <p className="tnum mt-3 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      {hint && <div className="mt-1 text-[12px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

const STATUS_META: Record<InvoiceStatus, { label: string; tone: BadgeTone }> = {
  analysed: { label: "Analysed", tone: "par" },
  needs_review: { label: "Needs review", tone: "warning" },
  extracting: { label: "Extracting", tone: "brand" },
  queued: { label: "Queued", tone: "neutral" },
  rejected: { label: "Rejected", tone: "over" },
  failed: { label: "Failed", tone: "over" },
};

export function StatusBadge({ status }: { status: InvoiceStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} dot={status === "extracting"}>
      {meta.label}
    </Badge>
  );
}
