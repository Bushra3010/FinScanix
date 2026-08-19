import { ArrowDownRight, ArrowUpRight, Equal, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { FLAG_LABEL } from "@/lib/variance";
import type { VarianceFlag } from "@/lib/types";
import { cn } from "@/lib/utils";

export function VarianceBadge({
  flag,
  unmatched,
  className,
  showIcon = true,
}: {
  flag: VarianceFlag;
  unmatched?: boolean;
  className?: string;
  showIcon?: boolean;
}) {
  if (unmatched) {
    return (
      <Badge tone="outline" className={className}>
        {showIcon && <HelpCircle className="h-3 w-3" />}
        Unmatched
      </Badge>
    );
  }

  const Icon = flag === "over" ? ArrowUpRight : flag === "under" ? ArrowDownRight : Equal;

  return (
    <Badge tone={flag} className={className}>
      {showIcon && <Icon className="h-3 w-3" />}
      {FLAG_LABEL[flag]}
    </Badge>
  );
}

/**
 * The same verdict said in procurement's words rather than the engine's.
 *
 * "Over" and "under" describe the arithmetic; a buyer deciding whether to
 * approve a line wants to know whether the price is competitive. Same flag,
 * same threshold — only the wording differs.
 */
export function HealthBadge({
  flag,
  unmatched,
  className,
}: {
  flag: VarianceFlag;
  unmatched?: boolean;
  className?: string;
}) {
  if (unmatched) {
    return (
      <Badge tone="outline" className={className}>
        No benchmark
      </Badge>
    );
  }
  const label = flag === "over" ? "High" : flag === "under" ? "Below market" : "Competitive";
  return (
    <Badge tone={flag} className={className}>
      {label}
    </Badge>
  );
}

/** Coloured, signed percentage — the most repeated figure in the product. */
export function VariancePct({
  value,
  flag,
  className,
}: {
  value: number;
  flag: VarianceFlag;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tnum font-semibold",
        flag === "over" ? "text-over" : flag === "under" ? "text-under" : "text-par",
        className,
      )}
    >
      {value > 0 ? "+" : ""}
      {value.toFixed(1)}%
    </span>
  );
}
