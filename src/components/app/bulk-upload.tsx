"use client";

import { useRef, useState } from "react";
import { Check, CircleAlert, Download, FileSpreadsheet, LoaderCircle, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { RATE_UPLOADS } from "@/lib/data/org";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

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

type Phase = "idle" | "validating" | "done";

export function BulkRateUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);

  function handleFile(name: string) {
    setFileName(name);
    setPhase("validating");
    setTimeout(() => setPhase("done"), 1100);
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
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Upload a rate file</CardTitle>
              <CardDescription>
                CSV or Excel. Rows are validated before anything is written — a bad row is
                reported, never silently dropped.
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={downloadTemplate}>
              <Download className="h-3.5 w-3.5" />
              Template
            </Button>
          </CardHeader>

          <CardContent>
            {phase === "idle" && (
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  const file = event.dataTransfer.files?.[0];
                  if (file) handleFile(file.name);
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
                  Drop a CSV or Excel file
                </p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Up to 10,000 rows per upload
                </p>
                <Button size="sm" className="mt-4" onClick={() => inputRef.current?.click()}>
                  <Upload className="h-3.5 w-3.5" />
                  Choose file
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) handleFile(file.name);
                  }}
                />
              </div>
            )}

            {phase === "validating" && (
              <div className="flex flex-col items-center px-6 py-12 text-center">
                <LoaderCircle className="h-6 w-6 animate-spin text-brand" />
                <p className="mt-4 text-[13.5px] font-medium text-foreground">
                  Validating {fileName}
                </p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  Checking columns, units and duplicate codes
                </p>
              </div>
            )}

            {phase === "done" && (
              <div>
                <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-sunken/50 p-4">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-par" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold text-foreground">
                      {fileName} validated
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                      248 rows parsed · 241 ready to apply · 7 rejected. In the production build
                      you would confirm here and the accepted rows would be written to the rate
                      library with a new effective date.
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-over/40 bg-over-soft/40 p-4">
                  <div className="flex items-center gap-2">
                    <CircleAlert className="h-4 w-4 shrink-0 text-over" />
                    <p className="text-[13px] font-semibold text-foreground">7 rejected rows</p>
                  </div>
                  <ul className="mt-2.5 space-y-1.5 text-[12.5px] text-muted-foreground">
                    <li>Rows 14, 27, 88 — unit &quot;sq.mt&quot; does not normalise to a known unit</li>
                    <li>Rows 41, 42 — duplicate code within the file</li>
                    <li>Row 156 — base_rate is not numeric</li>
                    <li>Row 203 — effective_from is not a valid ISO date</li>
                  </ul>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm">Apply 241 rows</Button>
                  <Button size="sm" variant="outline" onClick={() => setPhase("idle")}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

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
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Upload history</CardTitle>
            <CardDescription>Every rate change is attributable and reversible</CardDescription>
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
              {RATE_UPLOADS.map((upload) => (
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
                    <Badge tone={upload.status === "processed" ? "par" : upload.status === "failed" ? "over" : "brand"}>
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
      </Card>
    </div>
  );
}
