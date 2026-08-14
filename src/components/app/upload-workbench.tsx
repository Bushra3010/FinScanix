"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Check,
  CircleAlert,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  RotateCcw,
  ScanLine,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonStyles } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label, Select } from "@/components/ui/field";
import { Progress } from "@/components/ui/misc";
import { usePrototype, useTier } from "@/components/app/prototype-context";
import { mockQualityGate } from "@/lib/adapters/mock";
import { CITIES } from "@/lib/data/reference";
import { ORGANISATION } from "@/lib/data/org";
import type { QualityReport } from "@/lib/types";
import { cn } from "@/lib/utils";

type Stage = "idle" | "uploading" | "gating" | "rejected" | "extracting" | "done";

interface Candidate {
  name: string;
  sizeKb: number;
  mimeType: string;
}

const SAMPLES: { candidate: Candidate; label: string; note: string; icon: typeof FileText }[] = [
  {
    candidate: {
      name: "shreeji-buildmart-aug-ra-bill-04.pdf",
      sizeKb: 842,
      mimeType: "application/pdf",
    },
    label: "Clean machine-generated PDF",
    note: "Passes the gate and extracts 8 line items",
    icon: FileText,
  },
  {
    candidate: { name: "IMG_20260811_160142_blur.jpg", sizeKb: 3180, mimeType: "image/jpeg" },
    label: "Blurred phone photo",
    note: "Rejected at the quality gate, no quota used",
    icon: ImageIcon,
  },
  {
    candidate: { name: "team-offsite-photo.png", sizeKb: 1420, mimeType: "image/png" },
    label: "Not a business document",
    note: "Rejected as out of scope",
    icon: ImageIcon,
  },
];

const STAGE_STEPS = [
  { id: "uploading", label: "Transferring file" },
  { id: "gating", label: "Image quality & relevance check" },
  { id: "extracting", label: "OCR extraction & table reconstruction" },
  { id: "done", label: "Matching to SoR and market prices" },
];

export function UploadWorkbench() {
  const { cityId, setCityId } = usePrototype();
  const tier = useTier();
  const inputRef = useRef<HTMLInputElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [report, setReport] = useState<QualityReport | null>(null);
  const [dragging, setDragging] = useState(false);

  const used = ORGANISATION.subscription.documentsUsed;
  const quota = tier.documentQuota;
  const quotaPct = quota ? (used / quota) * 100 : 0;
  const quotaExhausted = quota !== null && used >= quota;

  async function run(next: Candidate) {
    setCandidate(next);
    setReport(null);
    setStage("uploading");

    await wait(600);
    setStage("gating");

    const result = await mockQualityGate.assess({
      fileName: next.name,
      sizeKb: next.sizeKb,
      mimeType: next.mimeType,
    });
    await wait(700);
    setReport(result);

    if (!result.passed) {
      setStage("rejected");
      return;
    }

    setStage("extracting");
    await wait(1100);
    setStage("done");
  }

  function reset() {
    setStage("idle");
    setCandidate(null);
    setReport(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    void run({
      name: file.name,
      sizeKb: Math.round(file.size / 1024),
      mimeType: file.type || "application/octet-stream",
    });
  }

  const busy = stage === "uploading" || stage === "gating" || stage === "extracting";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
      <div>
        {stage === "idle" && (
          <Card>
            <CardContent className="p-0">
              <div
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragging(false);
                  handleFiles(event.dataTransfer.files);
                }}
                className={cn(
                  "m-4 flex flex-col items-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
                  dragging ? "border-brand bg-brand-soft/40" : "border-border-strong bg-surface-sunken/40",
                  quotaExhausted && "pointer-events-none opacity-50",
                )}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
                  <Upload className="h-5 w-5" />
                </div>
                <p className="mt-4 text-[15px] font-semibold text-foreground">
                  Drop a vendor invoice or quotation here
                </p>
                <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                  PDF or image, up to 25 MB. Multi-page documents are read as one document and
                  count once against your quota.
                </p>
                <Button className="mt-5" onClick={() => inputRef.current?.click()}>
                  Choose file
                </Button>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  onChange={(event) => handleFiles(event.target.files)}
                />
              </div>

              <div className="border-t border-border px-5 py-4">
                <p className="text-[12.5px] font-medium text-foreground">
                  No file handy? Run a sample through the pipeline.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {SAMPLES.map((sample) => (
                    <button
                      key={sample.candidate.name}
                      type="button"
                      onClick={() => void run(sample.candidate)}
                      className="cursor-pointer rounded-lg border border-border bg-background p-3 text-left transition-colors hover:border-border-strong"
                    >
                      <sample.icon className="h-4 w-4 text-muted-foreground" />
                      <p className="mt-2 text-[12.5px] font-medium text-foreground">
                        {sample.label}
                      </p>
                      <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
                        {sample.note}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {stage !== "idle" && candidate && (
          <Card>
            <CardHeader>
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
                  {candidate.mimeType === "application/pdf" ? (
                    <FileText className="h-4 w-4" />
                  ) : (
                    <ImageIcon className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0">
                  <CardTitle className="truncate">{candidate.name}</CardTitle>
                  <CardDescription>
                    {(candidate.sizeKb / 1024).toFixed(2)} MB · {candidate.mimeType}
                  </CardDescription>
                </div>
              </div>
              <button
                type="button"
                onClick={reset}
                className="cursor-pointer rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
                aria-label="Cancel"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>

            <CardContent>
              <ol className="space-y-3">
                {STAGE_STEPS.map((step) => {
                  const order = STAGE_STEPS.findIndex((s) => s.id === step.id);
                  const currentOrder = STAGE_STEPS.findIndex((s) => s.id === stage);
                  const failed = stage === "rejected" && step.id === "gating";
                  const skipped = stage === "rejected" && order > 1;
                  const complete =
                    (stage === "done" && !skipped) ||
                    (currentOrder > order && !failed) ||
                    (stage === "rejected" && order < 1);
                  const activeStep = stage === step.id;

                  return (
                    <li key={step.id} className="flex items-center gap-3">
                      <span
                        className={cn(
                          "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px]",
                          failed
                            ? "border-over bg-over-soft text-over"
                            : complete
                              ? "border-par bg-par-soft text-par"
                              : activeStep
                                ? "border-brand bg-brand-soft text-brand"
                                : "border-border text-muted-foreground",
                          skipped && "opacity-40",
                        )}
                      >
                        {failed ? (
                          <X className="h-3 w-3" />
                        ) : complete ? (
                          <Check className="h-3 w-3" />
                        ) : activeStep ? (
                          <LoaderCircle className="h-3 w-3 animate-spin" />
                        ) : (
                          order + 1
                        )}
                      </span>
                      <span
                        className={cn(
                          "text-[13.5px]",
                          skipped
                            ? "text-muted-foreground/50 line-through"
                            : complete || activeStep || failed
                              ? "text-foreground"
                              : "text-muted-foreground",
                        )}
                      >
                        {step.label}
                      </span>
                    </li>
                  );
                })}
              </ol>

              {busy && <Progress value={stage === "uploading" ? 25 : stage === "gating" ? 55 : 85} className="mt-5" />}

              {/* Quality gate outcome — FR-1.2 */}
              {report && (
                <div
                  className={cn(
                    "mt-5 rounded-xl border p-4",
                    report.passed ? "border-border bg-surface-sunken/50" : "border-over/40 bg-over-soft/50",
                  )}
                >
                  <div className="flex items-start gap-2.5">
                    {report.passed ? (
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-par" />
                    ) : (
                      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-over" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-semibold text-foreground">
                        {report.passed
                          ? `Quality gate passed · score ${(report.score * 100).toFixed(0)}%`
                          : "Rejected before processing"}
                      </p>
                      {report.rejectionReason && (
                        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                          {report.rejectionReason}
                        </p>
                      )}
                    </div>
                  </div>

                  <ul className="mt-3.5 space-y-1.5 border-t border-border pt-3.5">
                    {report.checks.map((check) => (
                      <li key={check.id} className="flex items-start gap-2 text-[12.5px]">
                        {check.passed ? (
                          <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-par" />
                        ) : (
                          <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-over" />
                        )}
                        <span className="font-medium text-foreground">{check.label}</span>
                        <span className="text-muted-foreground">— {check.detail}</span>
                      </li>
                    ))}
                  </ul>

                  {!report.passed && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={reset}>
                        <RotateCcw className="h-3.5 w-3.5" />
                        Try another file
                      </Button>
                      <Badge tone="par">No quota consumed</Badge>
                    </div>
                  )}
                </div>
              )}

              {stage === "done" && (
                <div className="mt-5 rounded-xl border border-border bg-surface-sunken/50 p-4">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    <div>
                      <p className="text-[13.5px] font-semibold text-foreground">
                        8 line items extracted · 7 matched to a SoR baseline
                      </p>
                      <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">
                        One lump-sum line could not be matched and is reported as unmatched.
                        Review the extracted fields, then the variance report is ready.
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link href="/app/invoices/inv-0842" className={buttonStyles({ size: "sm" })}>
                      Open variance report
                    </Link>
                    <Button size="sm" variant="outline" onClick={reset}>
                      Upload another
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Side panel */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Document settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="upload-city">Project city</Label>
              <Select
                id="upload-city"
                value={cityId}
                onChange={(event) => setCityId(event.target.value)}
              >
                {CITIES.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}, {city.state} — index {city.indexFactor.toFixed(2)}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                Sets the cost index applied to SoR base rates and filters market quotes to this
                location.
              </p>
            </div>

            <div>
              <Label htmlFor="upload-type">Document type</Label>
              <Select id="upload-type" defaultValue="invoice">
                <option value="invoice">Tax invoice / RA bill</option>
                <option value="quotation">Quotation / estimate</option>
                <option value="work_order">Work order</option>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This cycle</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline justify-between">
              <p className="tnum text-2xl font-semibold text-foreground">
                {used.toLocaleString("en-IN")}
              </p>
              <p className="tnum text-[13px] text-muted-foreground">
                of {quota ? quota.toLocaleString("en-IN") : "unlimited"}
              </p>
            </div>
            {quota && (
              <Progress
                value={quotaPct}
                tone={quotaPct > 90 ? "over" : quotaPct > 75 ? "warning" : "brand"}
                className="mt-3"
              />
            )}
            <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
              {tier.name} plan. Quota is enforced server-side — rejected files are never counted.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-muted-foreground" />
              <CardTitle>Getting a clean read</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
              {[
                "Upload the original PDF where you have it — an embedded text layer extracts far more accurately than any photo.",
                "Photographing a page? Lay it flat, fill the frame, avoid shadow across the table.",
                "Scan at 300 DPI or above. Below that, rate columns start dropping digits.",
                "Keep every page of a multi-page bill in one file so totals reconcile.",
              ].map((tip) => (
                <li key={tip} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                  {tip}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
