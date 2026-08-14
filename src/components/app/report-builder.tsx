"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Download, FileSpreadsheet, LoaderCircle, Lock } from "lucide-react";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/field";
import { usePrototype } from "@/components/app/prototype-context";
import { REPORTED_INVOICES } from "@/lib/data/invoices";

const INCLUDES = [
  { id: "evidence", label: "SoR reference and city index per line", default: true },
  { id: "quotes", label: "Market quotes with source and timestamp", default: true },
  { id: "unmatched", label: "Unmatched line items", default: true },
  { id: "corrections", label: "Correction history and reviewer", default: false },
  { id: "method", label: "Methodology and engine configuration", default: true },
];

export function ReportBuilder() {
  const { allows, entitled } = usePrototype();
  const [format, setFormat] = useState<"pdf" | "excel">("pdf");
  const [state, setState] = useState<"idle" | "working" | "ready">("idle");

  const projects = Array.from(new Set(REPORTED_INVOICES.map((i) => i.project)));
  const vendors = Array.from(new Set(REPORTED_INVOICES.map((i) => i.vendor)));
  const excelLocked = !entitled("export_excel");
  const canExport = allows("report.export");

  function generate() {
    setState("working");
    setTimeout(() => setState("ready"), 1200);
  }

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Build a report</CardTitle>
          <CardDescription>
            Roll several documents into one audit pack, or export a single variance report.
          </CardDescription>
        </div>
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
      </CardHeader>

      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="report-scope">Scope</Label>
          <Select id="report-scope" defaultValue="project">
            <option value="project">By project</option>
            <option value="vendor">By vendor</option>
            <option value="period">By billing period</option>
            <option value="single">Single document</option>
          </Select>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="report-project">Project</Label>
            <Select id="report-project" defaultValue={projects[0]}>
              <option value="all">All projects</option>
              {projects.map((project) => (
                <option key={project} value={project}>
                  {project}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="report-vendor">Vendor</Label>
            <Select id="report-vendor" defaultValue="all">
              <option value="all">All vendors</option>
              {vendors.map((vendor) => (
                <option key={vendor} value={vendor}>
                  {vendor}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="report-from">From</Label>
            <input
              id="report-from"
              type="date"
              defaultValue="2026-08-01"
              className="h-9.5 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground focus:border-brand focus:outline-none"
            />
          </div>
          <div>
            <Label htmlFor="report-to">To</Label>
            <input
              id="report-to"
              type="date"
              defaultValue="2026-08-14"
              className="h-9.5 w-full rounded-lg border border-border-strong bg-surface px-3 text-sm text-foreground focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        <div>
          <Label>Include</Label>
          <div className="space-y-2">
            {INCLUDES.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-start gap-2.5 text-[13px] text-muted-foreground"
              >
                <input
                  type="checkbox"
                  defaultChecked={item.default}
                  className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border-strong accent-[var(--brand)]"
                />
                {item.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <Label>Format</Label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setFormat("pdf")}
              className={`flex-1 cursor-pointer rounded-lg border px-3 py-2 text-[13px] transition-colors ${
                format === "pdf"
                  ? "border-brand bg-brand-soft font-medium text-brand-soft-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              PDF
            </button>
            <button
              type="button"
              disabled={excelLocked}
              onClick={() => setFormat("excel")}
              className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                format === "excel"
                  ? "border-brand bg-brand-soft font-medium text-brand-soft-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground"
              }`}
            >
              {excelLocked && <Lock className="h-3.5 w-3.5" />}
              Excel
            </button>
          </div>
          {excelLocked && (
            <p className="mt-1.5 text-[11.5px] text-muted-foreground">
              Excel export is available from the Professional tier.{" "}
              <Link href="/app/settings/billing" className="text-brand hover:underline">
                Compare plans
              </Link>
            </p>
          )}
        </div>

        {canExport ? (
          <Button className="w-full" onClick={generate} disabled={state === "working"}>
            {state === "working" ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Generate report
              </>
            )}
          </Button>
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-border bg-surface-sunken px-3.5 py-2.5 text-[12.5px] text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            Your role does not permit exporting reports.
          </p>
        )}

        {state === "ready" && (
          <div className="flex items-start gap-2.5 rounded-lg border border-par/40 bg-par-soft/50 p-3.5">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-par" />
            <div>
              <p className="text-[13px] font-medium text-foreground">
                Report generated as {format === "pdf" ? "PDF" : "Excel"}
              </p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                In the production build this streams the file. The prototype stops here — the
                export pipeline is not wired up.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ExportButtons() {
  const { allows, entitled } = usePrototype();
  if (!allows("report.export")) return null;

  return (
    <>
      <button type="button" className={buttonStyles({ variant: "outline", size: "sm" })}>
        <Download className="h-3.5 w-3.5" />
        PDF
      </button>
      {entitled("export_excel") && (
        <button type="button" className={buttonStyles({ variant: "outline", size: "sm" })}>
          <Download className="h-3.5 w-3.5" />
          Excel
        </button>
      )}
    </>
  );
}
