import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-parts";
import { Entitled, RequirePermission, UpgradeNotice } from "@/components/app/gates";
import { BulkRateUpload } from "@/components/app/bulk-upload";

export const metadata: Metadata = { title: "Bulk rate upload" };

export default function UploadsPage() {
  return (
    <>
      <PageHeader
        title="Bulk rate upload"
        description="Load a rate book or your own negotiated rate card as CSV or Excel. Uploaded rates take priority over the public SoR baseline when matching."
      />
      <RequirePermission
        permission="rates.manage"
        message="Bulk rate upload is restricted to owners and admins."
      >
        <Entitled
          entitlement="bulk_upload"
          fallback={
            <UpgradeNotice
              entitlement="bulk_upload"
              description="Loading your own rate cards in bulk is available from the Professional tier. On Starter, rates can still be added one at a time from the rate library."
            />
          }
        >
          <BulkRateUpload />
        </Entitled>
      </RequirePermission>
    </>
  );
}
