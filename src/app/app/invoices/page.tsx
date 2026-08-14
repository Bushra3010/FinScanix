import type { Metadata } from "next";
import Link from "next/link";
import { Filter, Receipt, Upload } from "lucide-react";
import { PageHeader, StatusBadge } from "@/components/app/page-parts";
import { Can } from "@/components/app/gates";
import { Card } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { VariancePct } from "@/components/variance-badge";
import { requireUser } from "@/lib/auth/guard";
import { listInvoices } from "@/lib/db/queries";
import type { InvoiceStatus } from "@/lib/types";
import { cn, formatDate, formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Documents" };

const FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "analysed", label: "Analysed" },
  { value: "needs_review", label: "Needs review" },
  { value: "extracting", label: "Processing" },
  { value: "rejected", label: "Rejected" },
];

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const active = FILTERS.some((f) => f.value === status) ? status! : "all";

  const user = await requireUser();
  const allInvoices = await listInvoices(user.organisation.id);

  const invoices = allInvoices.filter(
    (invoice) => active === "all" || invoice.status === (active as InvoiceStatus),
  );

  const counts = FILTERS.reduce<Record<string, number>>((acc, filter) => {
    acc[filter.value] =
      filter.value === "all"
        ? allInvoices.length
        : allInvoices.filter((i) => i.status === filter.value).length;
    return acc;
  }, {});

  return (
    <>
      <PageHeader
        title="Documents"
        description="Every invoice and quotation uploaded to this workspace, with its verification state."
        actions={
          <Can permission="invoice.upload">
            <Link href="/app/invoices/new" className={buttonStyles()}>
              <Upload className="h-4 w-4" />
              Upload document
            </Link>
          </Can>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {FILTERS.map((filter) => (
          <Link
            key={filter.value}
            href={filter.value === "all" ? "/app/invoices" : `/app/invoices?status=${filter.value}`}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] transition-colors",
              active === filter.value
                ? "border-brand bg-brand-soft font-medium text-brand-soft-foreground"
                : "border-border bg-surface text-muted-foreground hover:text-foreground",
            )}
          >
            {filter.label}
            <span className="tnum text-[11.5px] opacity-70">{counts[filter.value]}</span>
          </Link>
        ))}
      </div>

      <Card>
        {invoices.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title="No documents in this view"
            description="Change the filter, or upload a vendor invoice or quotation to get started."
            action={
              <Link href="/app/invoices/new" className={buttonStyles({ size: "sm" })}>
                Upload document
              </Link>
            }
          />
        ) : (
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Document</TH>
                  <TH>Vendor</TH>
                  <TH>Project</TH>
                  <TH>City</TH>
                  <TH className="text-right">Net value</TH>
                  <TH className="text-right">Variance</TH>
                  <TH className="text-right">Recoverable</TH>
                  <TH>Status</TH>
                  <TH>Uploaded</TH>
                </tr>
              </THead>
              <TBody>
                {invoices.map((invoice) => {
                  const scored =
                    (invoice.status === "analysed" || invoice.status === "needs_review") &&
                    invoice.subtotal > 0;

                  return (
                    <TR key={invoice.id}>
                      <TD>
                        <Link
                          href={`/app/invoices/${invoice.id}`}
                          className="font-medium text-foreground hover:text-brand"
                        >
                          {invoice.number === "—" ? invoice.fileName : invoice.number}
                        </Link>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground capitalize">
                          {invoice.documentType} · {invoice.pageCount} page
                          {invoice.pageCount === 1 ? "" : "s"}
                        </p>
                      </TD>
                      <TD className="text-[13px] text-muted-foreground">{invoice.vendor}</TD>
                      <TD className="max-w-56 truncate text-[13px] text-muted-foreground">
                        {invoice.project}
                      </TD>
                      <TD className="text-[13px] text-muted-foreground">
                        {invoice.city.name}
                        <span className="tnum ml-1 text-[11.5px] opacity-70">
                          ×{invoice.city.indexFactor.toFixed(2)}
                        </span>
                      </TD>
                      <TD className="tnum text-right">
                        {invoice.subtotal > 0 ? formatINR(invoice.subtotal, { compact: true }) : "—"}
                      </TD>
                      <TD className="text-right">
                        {scored ? (
                          <VariancePct
                            value={invoice.summary.variancePct}
                            flag={
                              invoice.summary.variancePct > 7
                                ? "over"
                                : invoice.summary.variancePct < -7
                                  ? "under"
                                  : "par"
                            }
                          />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD className="tnum text-right">
                        {scored && invoice.summary.potentialSaving > 0 ? (
                          <span className="font-medium text-over">
                            {formatINR(invoice.summary.potentialSaving, { compact: true })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TD>
                      <TD>
                        <StatusBadge status={invoice.status} />
                      </TD>
                      <TD className="text-[12.5px] whitespace-nowrap text-muted-foreground">
                        {formatDate(invoice.uploadedAt)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <p className="mt-3 text-[12px] text-muted-foreground">
        Showing {invoices.length} of {allInvoices.length} documents. Rejected uploads do not
        consume extraction quota.
      </p>
    </>
  );
}
