"use client";

import { useActionState, useRef, useState } from "react";
import {
  Check,
  CircleAlert,
  FileText,
  LoaderCircle,
  ScanLine,
  Upload,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { Progress } from "@/components/ui/misc";
import { useSession, useTier } from "@/components/app/session-context";
import { uploadDocumentAction, type UploadState } from "@/lib/invoices/actions";
import type { City } from "@/lib/types";
import { cn } from "@/lib/utils";

export function UploadWorkbench({ cities }: { cities: City[] }) {
  const { user, cityId, setCityId } = useSession();
  const tier = useTier();
  const inputRef = useRef<HTMLInputElement>(null);

  const [state, formAction, pending] = useActionState<UploadState, FormData>(
    uploadDocumentAction,
    {},
  );
  const [picked, setPicked] = useState<{ name: string; sizeKb: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const used = user.organisation.subscription.documentsUsed;
  const quota = tier.documentQuota;
  const quotaPct = quota ? (used / quota) * 100 : 0;
  const exhausted = quota !== null && used >= quota;

  function take(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setPicked({ name: file.name, sizeKb: Math.round(file.size / 1024) });
    if (inputRef.current && files !== inputRef.current.files) {
      const transfer = new DataTransfer();
      transfer.items.add(file);
      inputRef.current.files = transfer.files;
    }
  }

  return (
    <form action={formAction} className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
      <div className="space-y-4">
        <Card>
          <CardContent className="p-4">
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
                exhausted && "pointer-events-none opacity-50",
              )}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
                {picked ? <FileText className="h-5 w-5" /> : <Upload className="h-5 w-5" />}
              </div>

              {picked ? (
                <>
                  <p className="mt-4 text-[15px] font-semibold text-foreground">{picked.name}</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">
                    {(picked.sizeKb / 1024).toFixed(2)} MB · ready to process
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPicked(null);
                      if (inputRef.current) inputRef.current.value = "";
                    }}
                    className="mt-3 inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                    Choose a different file
                  </button>
                </>
              ) : (
                <>
                  <p className="mt-4 text-[15px] font-semibold text-foreground">
                    Drop a vendor invoice or quotation here
                  </p>
                  <p className="mt-1.5 max-w-sm text-[13px] leading-relaxed text-muted-foreground">
                    PDF or image, up to 25 MB. Multi-page documents count once against your
                    quota.
                  </p>
                  <Button
                    type="button"
                    className="mt-5"
                    onClick={() => inputRef.current?.click()}
                  >
                    Choose file
                  </Button>
                </>
              )}

              <input
                ref={inputRef}
                name="file"
                type="file"
                accept=".pdf,image/*"
                className="hidden"
                onChange={(event) => take(event.target.files)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Quota / permission refusal */}
        {state.error && (
          <div className="flex items-start gap-2.5 rounded-xl border border-over/40 bg-over-soft/50 p-4">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-over" />
            <p className="text-[13px] leading-relaxed text-foreground">{state.error}</p>
          </div>
        )}

        {/* Quality gate rejection — FR-1.2 */}
        {state.rejection && (
          <Card className="border-over/40">
            <CardHeader className="bg-over-soft/50">
              <div className="flex items-start gap-2.5">
                <CircleAlert className="mt-0.5 h-4.5 w-4.5 shrink-0 text-over" />
                <div>
                  <CardTitle>Rejected before processing</CardTitle>
                  <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                    {state.rejection.reason}
                  </p>
                </div>
              </div>
              <Badge tone="par">No quota consumed</Badge>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {state.rejection.checks.map((check) => (
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
            </CardContent>
          </Card>
        )}

        <Button type="submit" size="lg" disabled={!picked || pending || exhausted}>
          {pending ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Extracting and benchmarking…
            </>
          ) : (
            <>
              <ScanLine className="h-4 w-4" />
              Process document
            </>
          )}
        </Button>
      </div>

      {/* Side panel */}
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Document settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="project">Project</Label>
              <Input id="project" name="project" placeholder="e.g. Sector 62 Tower — Noida" />
            </div>
            <div>
              <Label htmlFor="cityId">Project city</Label>
              <Select
                id="cityId"
                name="cityId"
                value={cityId}
                onChange={(event) => setCityId(event.target.value)}
              >
                {cities.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}, {city.state}
                    {city.currency && city.region === "gcc" ? ` — ${city.currency}` : ""} — index {city.indexFactor.toFixed(2)}
                  </option>
                ))}
              </Select>
              <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
                Sets the cost index applied to SoR base rates and localises market quotes.
              </p>
            </div>
            <div>
              <Label htmlFor="documentType">Document type</Label>
              <Select id="documentType" name="documentType" defaultValue="invoice">
                <option value="invoice">Tax invoice / RA bill</option>
                <option value="quotation">Quotation / estimate</option>
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
              {tier.name} plan. The limit is enforced on the server — rejected files are never
              counted.
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
                "Upload the original PDF wherever you have it — an embedded text layer extracts far more accurately than any photo.",
                "Line rows are checked against their own arithmetic; where quantity × rate does not equal the printed amount, the row is flagged for review.",
                "Scans and photos need an OCR provider to be configured before they can be processed.",
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
    </form>
  );
}
