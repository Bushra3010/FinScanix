"use client";

import { useState, useTransition } from "react";
import { Check, CircleAlert, LoaderCircle, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { testProviderAction, type ProviderTest } from "@/lib/adapters/verify";
import { cn } from "@/lib/utils";

/**
 * Runs a real call against one provider and shows exactly what came back.
 *
 * Deliberately on demand rather than on page load: these are billed calls to
 * third parties, and rendering an admin page should not spend money.
 */
export function ProviderTestButton({ providerKey }: { providerKey: string }) {
  const [result, setResult] = useState<ProviderTest | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="border-t border-border pt-3">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => {
          setResult(null);
          const data = new FormData();
          data.set("key", providerKey);
          start(async () => setResult(await testProviderAction(data)));
        }}
      >
        {pending ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Zap className="h-3.5 w-3.5" />
        )}
        {pending ? "Testing…" : "Test connection"}
      </Button>

      {result && (
        <div
          className={cn(
            "mt-2.5 flex items-start gap-2 rounded-lg border px-3 py-2",
            result.ok
              ? "border-par/40 bg-par-soft/40"
              : result.live
                ? "border-over/40 bg-over-soft/40"
                : "border-warning/40 bg-warning-soft/40",
          )}
        >
          {result.ok ? (
            <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-par" />
          ) : (
            <CircleAlert
              className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", result.live ? "text-over" : "text-warning")}
            />
          )}
          <p className="text-[12px] leading-relaxed text-foreground">{result.detail}</p>
        </div>
      )}
    </div>
  );
}
