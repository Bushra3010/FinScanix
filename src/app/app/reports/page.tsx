import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileText } from "lucide-react";
import { PageHeader } from "@/components/app/page-parts";
import { ReportBuilder } from "@/components/app/report-builder";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { VariancePct } from "@/components/variance-badge";
import { REPORTED_INVOICES } from "@/lib/data/invoices";
import { formatDate, formatINR } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

const GENERATED = [
  {
    id: "rep-08",
    name: "Sector 62 Commercial Tower — August RA bills",
    scope: "Project · 3 documents",
    format: "PDF",
    by: "Ananya Iyer",
    at: "2026-08-13T10:22:00+05:30",
    sizeKb: 486,
  },
  {
    id: "rep-07",
    name: "Nirman Traders — quotation audit QTN-1179",
    scope: "Single document",
    format: "PDF",
    by: "Ananya Iyer",
    at: "2026-08-12T16:05:00+05:30",
    sizeKb: 214,
  },
  {
    id: "rep-06",
    name: "Vendor exposure summary — Q2 FY26",
    scope: "Period · 47 documents",
    format: "Excel",
    by: "Mohammad Asif",
    at: "2026-08-05T09:14:00+05:30",
    sizeKb: 1180,
  },
  {
    id: "rep-05",
    name: "Airport Cargo Terminal — steel & cement review",
    scope: "Vendor · 2 documents",
    format: "Excel",
    by: "Priya Nair",
    at: "2026-08-01T14:48:00+05:30",
    sizeKb: 742,
  },
];

export default function ReportsPage() {
  const byProject = Object.values(
    REPORTED_INVOICES.reduce<
      Record<
        string,
        {
          project: string;
          docs: number;
          billed: number;
          benchmark: number;
          recoverable: number;
          over: number;
        }
      >
    >((acc, invoice) => {
      const entry =
        acc[invoice.project] ??
        { project: invoice.project, docs: 0, billed: 0, benchmark: 0, recoverable: 0, over: 0 };
      entry.docs += 1;
      entry.billed += invoice.subtotal;
      entry.benchmark += invoice.summary.benchmarkTotal;
      entry.recoverable += invoice.summary.potentialSaving;
      entry.over += invoice.summary.overCount;
      acc[invoice.project] = entry;
      return acc;
    }, {}),
  ).sort((a, b) => b.recoverable - a.recoverable);

  return (
    <>
      <PageHeader
        title="Reports"
        description="Generate audit-ready packs from analysed documents, or review what has already been exported."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_1.6fr]">
        <ReportBuilder />

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Portfolio variance by project</CardTitle>
                <CardDescription>
                  Billed value against blended benchmark across analysed documents
                </CardDescription>
              </div>
            </CardHeader>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Project</TH>
                    <TH className="text-right">Docs</TH>
                    <TH className="text-right">Billed</TH>
                    <TH className="text-right">Benchmark</TH>
                    <TH className="text-right">Variance</TH>
                    <TH className="text-right">Recoverable</TH>
                  </tr>
                </THead>
                <TBody>
                  {byProject.map((row) => {
                    const pct =
                      row.benchmark > 0 ? ((row.billed - row.benchmark) / row.benchmark) * 100 : 0;
                    return (
                      <TR key={row.project}>
                        <TD className="max-w-64">
                          <p className="truncate text-[13px] font-medium text-foreground">
                            {row.project}
                          </p>
                          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                            {row.over} over-priced line item{row.over === 1 ? "" : "s"}
                          </p>
                        </TD>
                        <TD className="tnum text-right text-[13px]">{row.docs}</TD>
                        <TD className="tnum text-right text-[13px] whitespace-nowrap">
                          {formatINR(row.billed, { compact: true })}
                        </TD>
                        <TD className="tnum text-right text-[13px] whitespace-nowrap text-muted-foreground">
                          {formatINR(row.benchmark, { compact: true })}
                        </TD>
                        <TD className="text-right whitespace-nowrap">
                          <VariancePct
                            value={pct}
                            flag={pct > 7 ? "over" : pct < -7 ? "under" : "par"}
                          />
                        </TD>
                        <TD className="tnum text-right text-[13px] font-medium whitespace-nowrap text-over">
                          {formatINR(row.recoverable, { compact: true })}
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
                <CardTitle>Generated reports</CardTitle>
                <CardDescription>
                  Retained alongside the documents they were built from
                </CardDescription>
              </div>
            </CardHeader>
            <TableWrap>
              <Table>
                <THead>
                  <tr>
                    <TH>Report</TH>
                    <TH>Format</TH>
                    <TH>Generated by</TH>
                    <TH className="text-right">Size</TH>
                    <TH className="w-10" />
                  </tr>
                </THead>
                <TBody>
                  {GENERATED.map((report) => (
                    <TR key={report.id}>
                      <TD>
                        <div className="flex items-start gap-2.5">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-foreground">
                              {report.name}
                            </p>
                            <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                              {report.scope} · {formatDate(report.at, "datetime")}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        <Badge tone={report.format === "Excel" ? "par" : "neutral"}>
                          {report.format}
                        </Badge>
                      </TD>
                      <TD className="text-[13px] text-muted-foreground">{report.by}</TD>
                      <TD className="tnum text-right text-[13px] text-muted-foreground">
                        {(report.sizeKb / 1024).toFixed(2)} MB
                      </TD>
                      <TD>
                        <button
                          type="button"
                          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`Download ${report.name}`}
                        >
                          <Download className="h-3.5 w-3.5" />
                        </button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </TableWrap>
          </Card>

          <p className="text-[12px] leading-relaxed text-muted-foreground">
            Reports are reproducible: because the variance engine is deterministic, regenerating a
            report from the same document and reference data returns identical figures. See a{" "}
            <Link href="/app/invoices/inv-0842" className="text-brand hover:underline">
              worked example
            </Link>
            .
          </p>
        </div>
      </div>
    </>
  );
}
