import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-parts";
import { UploadWorkbench } from "@/components/app/upload-workbench";

export const metadata: Metadata = { title: "Upload document" };

export default function UploadPage() {
  return (
    <>
      <PageHeader
        title="Upload document"
        description="Files pass an image-quality and relevance check before any extraction runs. Anything unusable is rejected with a reason and does not count against your quota."
      />
      <UploadWorkbench />
    </>
  );
}
