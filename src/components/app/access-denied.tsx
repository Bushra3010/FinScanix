import Link from "next/link";
import { Lock } from "lucide-react";
import { buttonStyles } from "@/components/ui/button";

/**
 * Server-rendered denial.
 *
 * Deliberately a server component: pages must decide access *before* they
 * query, so restricted data never reaches the client payload. The client-side
 * gates in gates.tsx can only hide what has already been sent.
 */
export function AccessDenied({
  message,
  title = "Not available for your role",
}: {
  message: string;
  title?: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-sunken text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">{message}</p>
      <Link
        href="/app/dashboard"
        className={buttonStyles({ variant: "outline", className: "mt-5" })}
      >
        Back to dashboard
      </Link>
    </div>
  );
}

/** Same idea, for a capability the plan does not include. */
export function PlanRequired({
  message,
  title,
}: {
  message: string;
  title: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-border-strong bg-surface px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-surface-sunken text-muted-foreground">
        <Lock className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{title}</p>
      <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">{message}</p>
      <Link href="/app/settings/billing" className={buttonStyles({ className: "mt-5" })}>
        Compare plans
      </Link>
    </div>
  );
}
