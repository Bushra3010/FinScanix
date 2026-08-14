import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-parts";
import { AccessDenied, PlanRequired } from "@/components/app/access-denied";
import { ScheduledJobs } from "@/components/app/scheduled-jobs";
import { gateFor, requireUser } from "@/lib/auth/guard";
import { listCronJobs } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Scheduled jobs" };

export default async function SchedulePage() {
  const user = await requireUser();
  const gate = gateFor(user);

  const header = (
    <PageHeader
      title="Scheduled jobs"
      description="Automated refresh of market pricing and rate-book revisions, so reports are never built on stale figures."
    />
  );

  if (!gate.allows("rates.manage")) {
    return (
      <>
        {header}
        <AccessDenied message="Scheduled jobs are managed by owners and admins." />
      </>
    );
  }

  if (!gate.entitled("scheduled_refresh")) {
    return (
      <>
        {header}
        <PlanRequired
          title="Scheduled price refresh is not included in your plan"
          message="Automated price refresh runs on Professional and above. On Starter, market prices are fetched on demand when a document is processed."
        />
      </>
    );
  }

  const jobs = await listCronJobs(user.organisation.id);

  return (
    <>
      {header}
      <ScheduledJobs jobs={jobs} />
    </>
  );
}
