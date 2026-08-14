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
