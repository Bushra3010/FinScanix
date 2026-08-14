import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-parts";
import { UploadWorkbench } from "@/components/app/upload-workbench";
import { listCities } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Upload document" };

export default async function UploadPage() {
  const cities = await listCities();

  return (
    <>
      <PageHeader
        title="Upload document"
        description="Files pass an image-quality and relevance check before any extraction runs. Anything unusable is rejected with a reason and does not count against your quota."
      />
      <UploadWorkbench cities={cities} />
    </>
  );
}
