import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-parts";
import { Entitled, RequirePermission, UpgradeNotice } from "@/components/app/gates";
import { ScheduledJobs } from "@/components/app/scheduled-jobs";

export const metadata: Metadata = { title: "Scheduled jobs" };

export default function SchedulePage() {
  return (
    <>
      <PageHeader
        title="Scheduled jobs"
        description="Automated refresh of market pricing and rate-book revisions, so reports are never built on stale figures."
      />
      <RequirePermission
        permission="rates.manage"
        message="Scheduled jobs are managed by owners and admins."
      >
        <Entitled
          entitlement="scheduled_refresh"
          fallback={
            <UpgradeNotice
              entitlement="scheduled_refresh"
              description="Automated price refresh runs on Professional and above. On Starter, market prices are fetched on demand when a document is processed."
            />
          }
        >
          <ScheduledJobs />
        </Entitled>
      </RequirePermission>
    </>
  );
}
