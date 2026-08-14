import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-parts";
import { AccessDenied, PlanRequired } from "@/components/app/access-denied";
import { BulkRateUpload } from "@/components/app/bulk-upload";
import { gateFor, requireUser } from "@/lib/auth/guard";
import { listRateUploads } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Bulk rate upload" };

export default async function UploadsPage() {
  const user = await requireUser();
  const gate = gateFor(user);

  const header = (
    <PageHeader
      title="Bulk rate upload"
      description="Load a rate book or your own negotiated rate card as CSV or Excel. Uploaded rates take priority over the public SoR baseline when matching."
    />
  );

  if (!gate.allows("rates.manage")) {
    return (
      <>
        {header}
        <AccessDenied message="Bulk rate upload is restricted to owners and admins." />
      </>
    );
  }

  if (!gate.entitled("bulk_upload")) {
    return (
      <>
        {header}
        <PlanRequired
          title="Bulk rate upload is not included in your plan"
          message="Loading your own rate cards in bulk is available from the Professional tier. On Starter, rates can still be added one at a time from the rate library."
        />
      </>
    );
  }

  const uploads = await listRateUploads(user.organisation.id);

  return (
    <>
      {header}
      <BulkRateUpload uploads={uploads} />
    </>
  );
}
