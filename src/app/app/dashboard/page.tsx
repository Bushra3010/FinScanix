import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  FileCheck,
  IndianRupee,
  Receipt,
  Timer,
  Upload,
} from "lucide-react";
import { PageHeader, StatCard, StatusBadge } from "@/components/app/page-parts";
import { BarList, FlagDonut, TrendChart } from "@/components/app/charts";
import { Can } from "@/components/app/gates";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { buttonStyles } from "@/components/ui/button";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { VarianceBadge, VariancePct } from "@/components/variance-badge";
import { requireUser } from "@/lib/auth/guard";
import { listActivity, listInvoices, listReportedInvoices } from "@/lib/db/queries";
import { MONTHLY_TREND } from "@/lib/data/org";
import { formatINR, relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const organisationId = user.organisation.id;

  const [allInvoices, reportedInvoices, activity] = await Promise.all([
    listInvoices(organisationId),
    listReportedInvoices(organisationId),
    listActivity(organisationId, 7),
  ]);

  // Roll-ups are derived from the same analysed invoices the reports use, so
  // the dashboard can never disagree with an individual report.
  const flags = reportedInvoices.reduce(
    (acc, invoice) => ({
      over: acc.over + invoice.summary.overCount,
      par: acc.par + invoice.summary.parCount,
      under: acc.under + invoice.summary.underCount,
      unmatched: acc.unmatched + invoice.summary.unmatchedCount,
    }),
    { over: 0, par: 0, under: 0, unmatched: 0 },
  );

  const recoverable = reportedInvoices.reduce((sum, i) => sum + i.summary.potentialSaving, 0);
  const billedTotal = reportedInvoices.reduce((sum, i) => sum + i.subtotal, 0);
  const benchmarkTotal = reportedInvoices.reduce((sum, i) => sum + i.summary.benchmarkTotal, 0);
  const overallVariance =
    benchmarkTotal > 0 ? ((billedTotal - benchmarkTotal) / benchmarkTotal) * 100 : 0;

  const topOverpriced = reportedInvoices.flatMap((invoice) =>
    invoice.lineItems
      .filter((line) => line.variance.flag === "over")
      .map((line) => ({ line, invoice })),
  )
    .sort((a, b) => b.line.variance.varianceAmount - a.line.variance.varianceAmount)
    .slice(0, 5);

  const vendorExposure = Object.values(
    reportedInvoices.reduce<Record<string, { label: string; value: number; docs: number }>>(
      (acc, invoice) => {
        const entry = acc[invoice.vendor] ?? { label: invoice.vendor, value: 0, docs: 0 };
        entry.value += invoice.summary.potentialSaving;
        entry.docs += 1;
        acc[invoice.vendor] = entry;
        return acc;
      },
      {},
    ),
  )
    .sort((a, b) => b.value - a.value)
    .slice(0, 5)
    .map((v) => ({
      label: v.label,
      value: v.value,
      hint: `${v.docs} document${v.docs === 1 ? "" : "s"} reviewed`,
    }));

  const recent = [...allInvoices]
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title={`Good morning, ${user.organisation.name.split(" ")[0]} team`}
        description="Variance across every document processed this cycle, and what is still waiting on a reviewer."
        actions={
          <Can permission="invoice.upload">
            <Link href="/app/invoices/new" className={buttonStyles()}>
              <Upload className="h-4 w-4" />
              Upload document
            </Link>
          </Can>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Receipt}
          label="Documents this cycle"
          value={user.organisation.subscription.documentsUsed.toLocaleString("en-IN")}
          hint="Billing cycle resets 1 Sep"
          tone="brand"
        />
        <StatCard
          icon={ArrowUpRight}
          label="Billed above benchmark"
          value={`+${overallVariance.toFixed(1)}%`}
          hint={`${formatINR(billedTotal, { compact: true })} billed vs ${formatINR(benchmarkTotal, { compact: true })} benchmark`}
          tone="over"
        />
        <StatCard
          icon={IndianRupee}
          label="Recoverable"
          value={formatINR(recoverable, { compact: true })}
          hint={`Across ${flags.over} over-priced line items`}
          tone="over"
        />
        <StatCard
          icon={Timer}
          label="Median turnaround"
          value="2m 34s"
          hint="Upload to variance report"
          tone="par"
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Variance trend</CardTitle>
              <CardDescription>
                Average variance is falling as vendors re-quote against benchmarked rates.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <TrendChart data={MONTHLY_TREND} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Line-item verdicts</CardTitle>
              <CardDescription>Across all analysed documents</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <FlagDonut
              over={flags.over}
              par={flags.par}
              under={flags.under}
              unmatched={flags.unmatched}
            />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <div>
              <CardTitle>Recent documents</CardTitle>
              <CardDescription>Latest uploads and their processing state</CardDescription>
            </div>
            <Link
              href="/app/invoices"
              className={buttonStyles({ variant: "ghost", size: "sm" })}
            >
              View all
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </CardHeader>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Document</TH>
                  <TH>Vendor</TH>
                  <TH className="text-right">Value</TH>
                  <TH className="text-right">Variance</TH>
                  <TH>Status</TH>
                </tr>
              </THead>
              <TBody>
                {recent.map((invoice) => {
                  const analysable =
                    invoice.status === "analysed" || invoice.status === "needs_review";
                  return (
                    <TR key={invoice.id}>
                      <TD>
                        <Link
                          href={`/app/invoices/${invoice.id}`}
                          className="font-medium text-foreground hover:text-brand"
                        >
                          {invoice.number === "—" ? invoice.fileName : invoice.number}
                        </Link>
                        <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                          {relativeTime(invoice.uploadedAt, new Date("2026-08-14T10:00:00+05:30"))}
                          {" · "}
                          {invoice.city.name}
                        </p>
                      </TD>
                      <TD className="text-[13px] text-muted-foreground">{invoice.vendor}</TD>
                      <TD className="tnum text-right">
                        {invoice.subtotal > 0 ? formatINR(invoice.subtotal, { compact: true }) : "—"}
                      </TD>
                      <TD className="text-right">
                        {analysable && invoice.subtotal > 0 ? (
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
                      <TD>
                        <StatusBadge status={invoice.status} />
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Activity</CardTitle>
              <CardDescription>Audit trail across the workspace</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {activity.map((event) => (
                  <li key={event.id} className="px-5 py-3">
                    <p className="text-[13px] leading-relaxed text-foreground">
                      {event.invoiceId ? (
                        <Link
                          href={`/app/invoices/${event.invoiceId}`}
                          className="hover:text-brand"
                        >
                          {event.message}
                        </Link>
                      ) : (
                        event.message
                      )}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                      {event.actor} ·{" "}
                      {relativeTime(event.at, new Date("2026-08-14T10:00:00+05:30"))}
                    </p>
                  </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Largest over-priced items</CardTitle>
              <CardDescription>Ranked by rupee variance, not percentage</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {topOverpriced.map(({ line, invoice }) => (
                <li key={line.id} className="flex items-start gap-4 px-5 py-3.5">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/app/invoices/${invoice.id}`}
                      className="line-clamp-1 text-[13px] font-medium text-foreground hover:text-brand"
                    >
                      {line.description}
                    </Link>
                    <p className="tnum mt-0.5 text-[11.5px] text-muted-foreground">
                      {invoice.number} · {invoice.vendor} · billed{" "}
                      {formatINR(line.rate, { decimals: 0 })}/{line.unit} vs benchmark{" "}
                      {formatINR(line.variance.benchmarkRate, { decimals: 0 })}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tnum text-[13px] font-semibold text-over">
                      {formatINR(line.variance.varianceAmount, { compact: true })}
                    </p>
                    <VariancePct
                      value={line.variance.variancePct}
                      flag="over"
                      className="text-[11.5px]"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Exposure by vendor</CardTitle>
              <CardDescription>Recoverable amount across reviewed documents</CardDescription>
            </div>
            <FileCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <BarList items={vendorExposure} />
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-surface px-5 py-4">
        <div>
          <p className="text-[13.5px] font-medium text-foreground">
            {reportedInvoices.filter((i) => i.status === "needs_review").length} document
            {reportedInvoices.filter((i) => i.status === "needs_review").length === 1 ? "" : "s"}{" "}
            waiting on review
          </p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            Low-confidence fields need confirming before their verdicts are final.
          </p>
        </div>
        <Link href="/app/invoices?status=needs_review" className={buttonStyles({ variant: "outline" })}>
          Review now
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </>
  );
}
