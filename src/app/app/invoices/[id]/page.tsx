import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  CircleAlert,
  FileText,
  LoaderCircle,
  MapPin,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { PageHeader, StatusBadge } from "@/components/app/page-parts";
import { InvoiceReport } from "@/components/app/invoice-report";
import { Can } from "@/components/app/gates";
import { Badge } from "@/components/ui/badge";
import { buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guard";
import { getInvoice } from "@/lib/db/queries";
import type { AnalysedInvoice } from "@/lib/types";
import { formatDate, formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Document" };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  // Scoped to the tenant: another organisation's document id resolves to a 404
  // rather than leaking that it exists.
  const invoice = await getInvoice(user.organisation.id, id);
  if (!invoice) notFound();

  const processing = invoice.status === "extracting" || invoice.status === "queued";
  const rejected = invoice.status === "rejected" || invoice.status === "failed";

  return (
    <>
      <Link
        href="/app/invoices"
        className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All documents
      </Link>

      <PageHeader
        title={invoice.number === "—" ? invoice.fileName : invoice.number}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {invoice.vendor}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {invoice.city.name} · index {invoice.city.indexFactor.toFixed(2)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <FileText className="h-3.5 w-3.5" />
              {invoice.fileName}
            </span>
          </span>
        }
        actions={
          <>
            <StatusBadge status={invoice.status} />
            <Badge tone="outline" className="capitalize">
              {invoice.documentType}
            </Badge>
            <Can permission="invoice.delete">
              <button
                type="button"
                className={buttonStyles({ variant: "ghost", size: "sm" })}
                title="Deletes only this document and its artifacts"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </Can>
          </>
        }
      />

      {/* Document facts */}
      <Card className="mb-6">
        <CardContent className="grid gap-x-8 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Project" value={invoice.project} />
          <Fact label="Vendor GSTIN" value={invoice.vendorGstin} mono />
          <Fact label="Uploaded" value={`${formatDate(invoice.uploadedAt, "datetime")} · ${invoice.uploadedBy}`} />
          <Fact
            label="Processed"
            value={invoice.processedAt ? formatDate(invoice.processedAt, "datetime") : "—"}
          />
          <Fact label="Pages" value={`${invoice.pageCount}`} />
          <Fact label="File size" value={`${(invoice.fileSizeKb / 1024).toFixed(2)} MB`} />
          <Fact label="Tax rate" value={`${invoice.taxPct}% GST`} />
          <Fact
            label="Gross total"
            value={invoice.total > 0 ? formatINR(invoice.total, { decimals: 0 }) : "—"}
          />
        </CardContent>
      </Card>

      {rejected ? (
        <RejectedPanel invoice={invoice} />
      ) : processing ? (
        <ProcessingPanel />
      ) : (
        <InvoiceReport invoice={invoice} />
      )}
    </>
  );
}

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={`mt-1 truncate text-[13px] text-foreground ${mono ? "font-mono text-[12.5px]" : ""}`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

function RejectedPanel({ invoice }: { invoice: AnalysedInvoice }) {
  return (
    <Card className="border-over/40">
      <CardHeader className="bg-over-soft/50">
        <div className="flex items-start gap-2.5">
          <CircleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-over" />
          <div>
            <CardTitle>Rejected at the quality gate</CardTitle>
            <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
              {invoice.quality.rejectionReason}
            </p>
          </div>
        </div>
        <Badge tone="par">No extraction quota consumed</Badge>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-[12.5px] font-medium text-foreground">
          Checks run before processing · score {(invoice.quality.score * 100).toFixed(0)}%
        </p>
        <ul className="space-y-2">
          {invoice.quality.checks.map((check) => (
            <li key={check.id} className="flex items-start gap-2.5 text-[13px]">
              {check.passed ? (
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-par" />
              ) : (
                <X className="mt-0.5 h-4 w-4 shrink-0 text-over" />
              )}
              <div>
                <span className="font-medium text-foreground">{check.label}</span>
                <span className="text-muted-foreground"> — {check.detail}</span>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
          <Can permission="invoice.upload">
            <Link href="/app/invoices/new" className={buttonStyles({ size: "sm" })}>
              <Upload className="h-3.5 w-3.5" />
              Upload a replacement
            </Link>
          </Can>
          <Link
            href="/app/invoices"
            className={buttonStyles({ variant: "outline", size: "sm" })}
          >
            Back to documents
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ProcessingPanel() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center px-6 py-16 text-center">
        <div className="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-border bg-surface-sunken">
          <FileText className="h-6 w-6 text-muted-foreground" />
          <span className="animate-scan absolute inset-x-0 top-0 h-0.5 bg-brand" />
        </div>
        <p className="mt-5 flex items-center gap-2 text-sm font-semibold text-foreground">
          <LoaderCircle className="h-4 w-4 animate-spin text-brand" />
          Extraction in progress
        </p>
        <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-muted-foreground">
          Line items, quantities and rates are being read from the document, then matched to the
          Schedule of Rates and live market pricing. This usually takes under three minutes.
        </p>
        <Link
          href="/app/invoices"
          className={buttonStyles({ variant: "outline", size: "sm", className: "mt-6" })}
        >
          Back to documents
        </Link>
      </CardContent>
    </Card>
  );
}
