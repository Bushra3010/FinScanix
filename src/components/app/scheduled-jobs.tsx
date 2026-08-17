"use client";

import { useState, useTransition } from "react";
import { CircleAlert, Play, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { runJobNowAction, toggleJobAction, type JobActionState } from "@/lib/jobs/actions";
import type { CronJob } from "@/lib/types";
import { cn, formatDate, formatNumber } from "@/lib/utils";

export function ScheduledJobs({ jobs }: { jobs: CronJob[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Record<string, JobActionState>>({});
  const [, startTransition] = useTransition();

  function call(id: string, action: (data: FormData) => Promise<JobActionState>, data: FormData) {
    setBusy(id);
    startTransition(async () => {
      const state = await action(data);
      setOutcome((prev) => ({ ...prev, [id]: state }));
      setBusy(null);
    });
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => {
        const running = busy === job.id;
        const state = outcome[job.id];

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
                  {!job.enabled && <Badge tone="outline">Paused</Badge>}
                </div>
                <CardDescription>{job.target}</CardDescription>
                {job.scope.length > 0 && (
                  <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                    Matches line items or rate chapters containing:{" "}
                    <span className="font-mono text-foreground">{job.scope.join(", ")}</span>
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={running || !job.enabled}
                  onClick={() => {
                    const data = new FormData();
                    data.set("id", job.id);
                    call(job.id, runJobNowAction, data);
                  }}
                >
                  {running ? (
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
                  aria-checked={job.enabled}
                  aria-label={`${job.enabled ? "Disable" : "Enable"} ${job.name}`}
                  disabled={running}
                  onClick={() => {
                    const data = new FormData();
                    data.set("id", job.id);
                    data.set("enabled", String(!job.enabled));
                    call(job.id, toggleJobAction, data);
                  }}
                  className={cn(
                    "relative h-6 w-11 shrink-0 cursor-pointer rounded-full border transition-colors disabled:opacity-50",
                    job.enabled
                      ? "border-brand bg-brand"
                      : "border-border-strong bg-surface-sunken",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4.5 w-4.5 rounded-full bg-surface shadow-sm transition-transform",
                      job.enabled ? "translate-x-5.5" : "translate-x-0.5",
                    )}
                  />
                </button>
              </div>
            </CardHeader>

            <CardContent className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="Schedule" value={`${job.schedule}  IST`} mono />
              <Detail label="Last run" value={formatDate(job.lastRun, "datetime")} />
              <Detail
                label="Next run"
                value={job.enabled ? formatDate(job.nextRun, "datetime") : "Paused"}
              />
              <Detail
                label="Items refreshed"
                value={job.itemsRefreshed > 0 ? formatNumber(job.itemsRefreshed) : "—"}
              />
            </CardContent>

            {(state?.error || state?.result) && (
              <div
                className={cn(
                  "mx-5 mb-5 rounded-lg border px-3 py-2",
                  state.error || state.result?.status === "failed"
                    ? "border-over/40 bg-over-soft/50"
                    : state.result?.status === "partial"
                      ? "border-warning/40 bg-warning-soft/50"
                      : "border-par/40 bg-par-soft/50",
                )}
              >
                <p className="text-[12.5px] leading-relaxed text-foreground">
                  {state.error ?? state.result?.detail}
                </p>
              </div>
            )}
          </Card>
        );
      })}

      <div className="flex gap-2.5 rounded-xl border border-border bg-surface p-4">
        <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-[12.5px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">Hybrid update model.</span> Scheduled jobs
          keep market pricing current between manual rate uploads. A partial result means some
          sources returned no listing for an item — those items keep their previous quote and are
          re-queued on the next run rather than being dropped from reports. Schedules are read in
          IST and fired by an external scheduler calling <code className="font-mono">/api/cron</code>;
          without that timer configured, only <em>Run now</em> executes a job.
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
