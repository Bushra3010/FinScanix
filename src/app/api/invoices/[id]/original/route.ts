import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { requireUser } from "@/lib/auth/guard";
import { signedDocumentUrl, storageConfigured } from "@/lib/storage";

/**
 * Redirects to a short-lived signed URL for the uploaded original — FR-11.1.
 *
 * The object is never served through this process and the bucket stays private:
 * the signature is minted per request, for five minutes, only after the session
 * has been resolved and the document confirmed to belong to the caller's
 * organisation. A document id from another tenant is a 404, not a 403, so the
 * endpoint does not confirm that the id exists.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  const { id } = await params;

  if (!storageConfigured) {
    return NextResponse.json(
      { error: "Document storage is not configured on this deployment." },
      { status: 503 },
    );
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id, organisationId: user.organisation.id },
    select: { storageKey: true },
  });

  if (!invoice?.storageKey) {
    return NextResponse.json({ error: "No original is stored for this document." }, { status: 404 });
  }

  try {
    return NextResponse.redirect(await signedDocumentUrl(invoice.storageKey, 300));
  } catch (error) {
    console.error("Could not sign document URL", error);
    return NextResponse.json({ error: "The stored original could not be reached." }, { status: 502 });
  }
}
