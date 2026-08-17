"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requireEntitlement, requirePermission } from "@/lib/auth/guard";
import { nextRunAfter } from "./cron";
import { runJob, type JobResult } from "./run";

export interface JobActionState {
  error?: string;
  result?: JobResult;
}

/** Runs one job immediately. The schedule is unaffected beyond the recomputed next run. */
export async function runJobNowAction(formData: FormData): Promise<JobActionState> {
  const user = await requirePermission("rates.manage");
  await requireEntitlement("scheduled_refresh");

  const id = String(formData.get("id") ?? "");
  const job = await prisma.cronJob.findFirst({
    where: { id, organisationId: user.organisation.id },
    select: { id: true, organisationId: true, name: true, schedule: true, kind: true },
  });
  if (!job) return { error: "That job is not in your organisation." };

  const result = await runJob(job);
  revalidatePath("/app/admin/schedule");
  return { result };
}

export async function toggleJobAction(formData: FormData): Promise<JobActionState> {
  const user = await requirePermission("rates.manage");
  await requireEntitlement("scheduled_refresh");

  const id = String(formData.get("id") ?? "");
  const enabled = String(formData.get("enabled") ?? "") === "true";

  const job = await prisma.cronJob.findFirst({
    where: { id, organisationId: user.organisation.id },
  });
  if (!job) return { error: "That job is not in your organisation." };

  // Re-enabling recomputes the next run from now, so a job paused for a month
  // does not immediately fire for every occurrence it missed.
  let nextRun = job.nextRun;
  if (enabled) {
    try {
      nextRun = nextRunAfter(job.schedule);
    } catch {
      return { error: `"${job.schedule}" is not a valid schedule.` };
    }
  }

  await prisma.cronJob.update({ where: { id: job.id }, data: { enabled, nextRun } });

  await prisma.activityEvent.create({
    data: {
      organisationId: user.organisation.id,
      kind: "rate_update",
      actor: user.name,
      message: `${enabled ? "Enabled" : "Paused"} scheduled job “${job.name}”`,
    },
  });

  revalidatePath("/app/admin/schedule");
  return {};
}
