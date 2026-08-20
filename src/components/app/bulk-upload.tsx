"use client";

import { useActionState, useRef, useState } from "react";
import { Check, CircleAlert, Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { importRatesAction, type RateActionState } from "@/lib/rates/actions";
import type { RateUpload } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

const REQUIRED_COLUMNS = [
  { name: "code", note: "Unique rate code, e.g. DSR 13.1.2" },
  { name: "description", note: "Full item description used for matching" },
  { name: "unit", note: "cum, sqm, kg, each, point…" },
  { name: "base_rate", note: "Delhi baseline rate in ₹, numeric" },
  { name: "source", note: "Rate book and edition" },
  { name: "chapter", note: "Grouping used in the library" },
  { name: "effective_from", note: "ISO date, e.g. 2024-04-01" },
];

const TEMPLATE_CSV = `code,description,unit,base_rate,source,chapter,effective_from
DSR 13.1.2,"12 mm cement plaster of mix 1:6 (1 cement : 6 fine sand) on rough side of walls",sqm,248,CPWD DSR 2023,13 — Finishing,2023-10-01
MAT-CEM 1.1,"Ordinary Portland Cement 53 grade conforming to IS 12269, supplied at site in 50 kg bags",bag,405,CPWD Market Rate Schedule 2024,Materials — Cement,2024-04-01
`;

export function BulkRateUpload({ uploads }: { uploads: RateUpload[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState<RateActionState, FormData>(
    importRatesAction,
    {},
  );
  const [picked, setPicked] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function take(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setPicked(file.name);
    if (inputRef.current && files !== inputRef.current.files) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      inputRef.current.files = transfer.files;
    }
  }

  function downloadTemplate() {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "finscanix-rate-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <form action={formAction}>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Upload a rate file</CardTitle>
                <CardDescription>
                  CSV or Excel (.xlsx). Every row is validated before anything is written —
                  a bad row is reported by line number, never silently dropped.
                </CardDescription>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={downloadTemplate}>
                <Download className="h-3.5 w-3.5" />
                Template
              </Button>
            </CardHeader>

            <CardContent className="space-y-4">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  take(event.dataTransfer.files);
                }}
                className={cn(
                  "flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors",
                  dragging
                    ? "border-brand bg-brand-soft/40"
                    : "border-border-strong bg-surface-sunken/40",
                )}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <p className="mt-4 text-[14px] font-semibold text-foreground">
                  {picked ?? "Drop a CSV or Excel file"}
                </p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Up to 5 MB — roughly 40,000 rows
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-4"
                  onClick={() => inputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Choose file
                </Button>
                <input
                  ref={inputRef}
                  name="file"
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(event) => take(event.target.files)}
                />
              </div>

              {state.error && (
                <div className="flex items-start gap-2.5 rounded-xl border border-over/40 bg-over-soft/50 p-4">
                  <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-over" />
                  <p className="text-[13px] leading-relaxed text-foreground">{state.error}</p>
                </div>
              )}

              {state.summary && (
                <div
                  className={cn(
                    "rounded-xl border p-4",
                    state.ok ? "border-par/40 bg-par-soft/40" : "border-over/40 bg-over-soft/40",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {state.ok ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-par" />
                    ) : (
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-over" />
                    )}
                    <div>
                      <p className="text-[13.5px] font-semibold text-foreground">
                        {state.summary.accepted} of {state.summary.total} rows applied
                      </p>
                      {state.summary.rejected > 0 && (
                        <p className="mt-1 text-[13px] text-muted-foreground">
                          {state.summary.rejected} row
                          {state.summary.rejected === 1 ? "" : "s"} rejected:
                        </p>
                      )}
                    </div>
                  </div>
                  {state.summary.problems.length > 0 && (
                    <ul className="mt-2.5 space-y-1 pl-7 text-[12.5px] text-muted-foreground">
                      {state.summary.problems.map((problem) => (
                        <li key={problem}>{problem}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <Button type="submit" disabled={!picked || pending}>
                {pending ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" />
                    Validating and applying…
                  </>
                ) : (
                  "Import rates"
                )}
              </Button>
            </CardContent>
          </Card>
        </form>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Required columns</CardTitle>
              <CardDescription>Header names are case-insensitive</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {REQUIRED_COLUMNS.map((column) => (
                <li key={column.name} className="px-5 py-2.5">
                  <p className="font-mono text-[12.5px] text-foreground">{column.name}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">{column.note}</p>
                </li>
              ))}
            </ul>
            <p className="border-t border-border px-5 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
              Rows are matched on <code className="font-mono">code</code>: re-importing a
              corrected file updates those rates rather than duplicating them. Your rates take
              priority over the shared CPWD book when a code collides.
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Upload history</CardTitle>
            <CardDescription>Every rate change is attributable</CardDescription>
          </div>
        </CardHeader>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>File</TH>
                <TH>Uploaded by</TH>
                <TH className="text-right">Rows</TH>
                <TH className="text-right">Accepted</TH>
                <TH className="text-right">Rejected</TH>
                <TH>Status</TH>
                <TH>Date</TH>
              </tr>
            </THead>
            <TBody>
              {uploads.map((upload) => (
                <TR key={upload.id}>
                  <TD>
                    <p className="text-[13px] font-medium text-foreground">{upload.fileName}</p>
                    {upload.note && (
                      <p className="mt-0.5 text-[11.5px] text-muted-foreground">{upload.note}</p>
                    )}
                  </TD>
                  <TD className="text-[13px] text-muted-foreground">{upload.uploadedBy}</TD>
                  <TD className="tnum text-right text-[13px]">{upload.rowsTotal}</TD>
                  <TD className="tnum text-right text-[13px] text-par">{upload.rowsAccepted}</TD>
                  <TD className="tnum text-right text-[13px]">
                    {upload.rowsRejected > 0 ? (
                      <span className="text-over">{upload.rowsRejected}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TD>
                  <TD>
                    <Badge
                      tone={
                        upload.status === "processed"
                          ? "par"
                          : upload.status === "failed"
                            ? "over"
                            : "brand"
                      }
                    >
                      {upload.status}
                    </Badge>
                  </TD>
                  <TD className="text-[12.5px] whitespace-nowrap text-muted-foreground">
                    {formatDate(upload.uploadedAt)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
        {uploads.length === 0 && (
          <p className="px-5 py-10 text-center text-[13px] text-muted-foreground">
            No rate files imported yet.
          </p>
        )}
      </Card>
    </div>
  );
}
