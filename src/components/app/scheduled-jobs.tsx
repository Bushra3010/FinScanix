"use client";

import { useState } from "react";
import { CircleAlert, Play, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import type { CronJob } from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

export function ScheduledJobs({ jobs }: { jobs: CronJob[] }) {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(jobs.map((job) => [job.id, job.enabled])),
  );
  const [running, setRunning] = useState<string | null>(null);

  function runNow(id: string) {
    setRunning(id);
    setTimeout(() => setRunning(null), 1400);
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => {
        const on = enabled[job.id];
        return (
          <Card key={job.id}>
            <CardHeader>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{job.name}</CardTitle>
                  <Badge
                    tone={
                      job.lastStatus === "success"
                        ? "par"
                        : job.lastStatus === "partial"
                          ? "warning"
                          : "over"
                    }
                  >
                    Last run {job.lastStatus}
                  </Badge>
                  {!on && <Badge tone="outline">Paused</Badge>}
                </div>
                <CardDescription>{job.target}</CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runNow(job.id)}
                  disabled={running === job.id || !on}
                >
                  {running === job.id ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      Running
                    </>
                  ) : (
                    <>
                      <Play className="h-3.5 w-3.5" />
                      Run now
                    </>
                  )}
                </Button>

                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={`${on ? "Disable" : "Enable"} ${job.name}`}
                  onClick={() => setEnabled((prev) => ({ ...prev, [job.id]: !prev[job.id] }))}
                  className={cn(
                    "relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors",
                    on ? "border-brand bg-brand" : "border-border-strong bg-surface-sunken",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-surface shadow-sm transition-transform",
                      on ? "translate-x-5.5" : "translate-x-0.5",
                    )}
                  />
                </button>
              </div>
            </CardHeader>

            <CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Schedule" value={job.schedule} mono />
              <Detail label="Last run" value={formatDate(job.lastRun, "datetime")} />
              <Detail
                label="Next run"
                value={on ? formatDate(job.nextRun, "datetime") : "Paused"}
              />
              <Detail
                label="Items refreshed"
                value={job.itemsRefreshed > 0 ? formatNumber(job.itemsRefreshed) : "—"}
              />
            </CardContent>
          </Card>
        );
      })}

      <div className="flex gap-2.5 rounded-xl border border-border bg-surface p-4">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Hybrid update model.</span> Scheduled jobs
          keep market pricing current between manual rate uploads. A partial result means some
          sources returned no listing for an item — those items keep their previous quote and are
          re-queued on the next run rather than being dropped from reports.
        </p>
      </div>
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p className={cn("mt-1 text-[13px] text-foreground", mono && "font-mono text-[12.5px]")}>
        {value}
      </p>
    </div>
  );
}
