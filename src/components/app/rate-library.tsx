"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { CircleAlert, LoaderCircle, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldHint, Input, Label, Select } from "@/components/ui/field";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useSession } from "@/components/app/session-context";
import {
  deleteRateAction,
  saveRateAction,
  type RateActionState,
} from "@/lib/rates/actions";
import type { City, SorEntry } from "@/lib/types";
import { formatDate, formatINR } from "@/lib/utils";

export function RateLibrary({ entries, cities }: { entries: SorEntry[]; cities: City[] }) {
  const { cityId, setCityId, user } = useSession();
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState("all");
  const [editing, setEditing] = useState<SorEntry | "new" | null>(null);
  const [removing, startRemove] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  const canManage = user.role === "owner" || user.role === "admin";
  const city = cities.find((entry) => entry.id === cityId) ?? cities[0];

  const chapters = useMemo(
    () => Array.from(new Set(entries.map((entry) => entry.chapter))).sort(),
    [entries],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchesChapter = chapter === "all" || entry.chapter === chapter;
      const matchesQuery =
        q === "" ||
        entry.description.toLowerCase().includes(q) ||
        entry.code.toLowerCase().includes(q) ||
        entry.source.toLowerCase().includes(q);
      return matchesChapter && matchesQuery;
    });
  }, [entries, query, chapter]);

  function remove(entry: SorEntry) {
    setRowError(null);
    startRemove(async () => {
      const data = new FormData();
      data.set("id", entry.id);
      const result = await deleteRateAction(data);
      if (!result.ok) setRowError(`${entry.code} could not be removed.`);
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by code, description or source…"
            className="h-9.5 w-full rounded-lg border border-border-strong bg-surface pr-3 pl-9 text-[13px] text-foreground placeholder:text-muted-foreground/70 focus:border-brand focus:ring-2 focus:ring-brand/20 focus:outline-none"
          />
        </div>

        <div className="w-56">
          <Select
            value={chapter}
            onChange={(event) => setChapter(event.target.value)}
            aria-label="Filter by chapter"
          >
            <option value="all">All chapters</option>
            {chapters.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </Select>
        </div>

        <div className="w-48">
          <Select
            value={cityId}
            onChange={(event) => setCityId(event.target.value)}
            aria-label="City for rate adjustment"
          >
            {cities.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} · ×{entry.indexFactor.toFixed(2)}
              </option>
            ))}
          </Select>
        </div>

        {canManage && (
          <Button onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Add rate
          </Button>
        )}
      </div>

      {editing && (
        <RateEditor entry={editing === "new" ? null : editing} onClose={() => setEditing(null)} />
      )}

      {rowError && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-over/40 bg-over-soft/50 px-3 py-2">
          <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-over" />
          <p className="text-[12.5px] text-foreground">{rowError}</p>
        </div>
      )}

      <Card>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Code</TH>
                <TH>Description</TH>
                <TH>Unit</TH>
                <TH className="text-right">Base rate</TH>
                <TH className="text-right">{city.name} rate</TH>
                <TH>Source</TH>
                <TH>Effective</TH>
                <TH className="w-16" />
              </tr>
            </THead>
            <TBody>
              {rows.map((entry) => (
                <TR key={entry.id}>
                  <TD className="font-mono text-[12px] whitespace-nowrap text-foreground">
                    {entry.code}
                  </TD>
                  <TD className="max-w-xl">
                    <p className="line-clamp-2 text-[13px] leading-snug text-foreground">
                      {entry.description}
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">{entry.chapter}</p>
                  </TD>
                  <TD className="text-[12.5px] text-muted-foreground">{entry.unit}</TD>
                  <TD className="tnum text-right text-[13px] whitespace-nowrap text-muted-foreground">
                    {formatINR(entry.baseRate)}
                  </TD>
                  <TD className="tnum text-right text-[13px] font-medium whitespace-nowrap text-foreground">
                    {formatINR(entry.baseRate * city.indexFactor)}
                  </TD>
                  <TD>
                    <Badge tone={entry.owned ? "brand" : "neutral"}>{entry.source}</Badge>
                  </TD>
                  <TD className="text-[12.5px] whitespace-nowrap text-muted-foreground">
                    {formatDate(entry.effectiveFrom)}
                  </TD>
                  <TD>
                    {canManage ? (
                      <div className="flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => setEditing(entry)}
                          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={`Edit ${entry.code}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(entry)}
                          disabled={!entry.owned || removing}
                          title={
                            entry.owned
                              ? `Remove ${entry.code}`
                              : "Shared rate-book entries cannot be deleted — edit it to create your own override"
                          }
                          className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-over disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                          aria-label={`Delete ${entry.code}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-[12px] text-muted-foreground/40">—</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>

        {rows.length === 0 && (
          <p className="px-5 py-12 text-center text-[13px] text-muted-foreground">
            No rates match that search.
          </p>
        )}
      </Card>

      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        Showing {rows.length} of {entries.length} entries. The {city.name} column applies the
        city cost index (×{city.indexFactor.toFixed(2)}) to the base rate — this is the figure the
        variance engine benchmarks against for projects in that city. Entries badged in blue are
        your organisation&rsquo;s own and override the shared book on a matching code.
      </p>
    </>
  );
}

function RateEditor({ entry, onClose }: { entry: SorEntry | null; onClose: () => void }) {
  const [state, action, pending] = useActionState<RateActionState, FormData>(saveRateAction, {});

  // Close only once the write has actually succeeded, so a validation error
  // stays on screen with the user's input intact.
  useEffect(() => {
    if (state.ok) onClose();
  }, [state.ok, onClose]);

  return (
    <Card className="mb-4">
      <form action={action}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <p className="text-[14px] font-semibold text-foreground">
            {entry ? `Edit ${entry.code}` : "Add a rate"}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="rate-code">Code</Label>
            <Input
              id="rate-code"
              name="code"
              defaultValue={entry?.code ?? ""}
              required
              className="font-mono"
              placeholder="DSR 13.1.2"
            />
            {entry && !entry.owned && (
              <FieldHint>
                Saving creates your own entry under this code, overriding the shared book.
              </FieldHint>
            )}
          </div>
          <div>
            <Label htmlFor="rate-unit">Unit</Label>
            <Input id="rate-unit" name="unit" defaultValue={entry?.unit ?? ""} required placeholder="sqm" />
          </div>
          <div>
            <Label htmlFor="rate-base">Base rate (₹, Delhi baseline)</Label>
            <Input
              id="rate-base"
              name="baseRate"
              type="number"
              step="0.01"
              min="0"
              defaultValue={entry?.baseRate ?? ""}
              required
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <Label htmlFor="rate-description">Description</Label>
            <Input
              id="rate-description"
              name="description"
              defaultValue={entry?.description ?? ""}
              required
            />
            <FieldHint>
              The full specification. Matching works on these words, so a fuller description
              matches more reliably.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="rate-chapter">Chapter</Label>
            <Input
              id="rate-chapter"
              name="chapter"
              defaultValue={entry?.chapter ?? ""}
              placeholder="13 — Finishing"
            />
          </div>
          <div>
            <Label htmlFor="rate-source">Source</Label>
            <Input
              id="rate-source"
              name="source"
              defaultValue={entry?.source ?? ""}
              placeholder="Own rate card"
            />
          </div>
          <div>
            <Label htmlFor="rate-effective">Effective from</Label>
            <Input
              id="rate-effective"
              name="effectiveFrom"
              type="date"
              defaultValue={(entry?.effectiveFrom ?? new Date().toISOString()).slice(0, 10)}
            />
          </div>
        </div>

        {state.error && (
          <div className="mx-5 mb-4 flex items-start gap-2 rounded-lg border border-over/40 bg-over-soft/50 px-3 py-2">
            <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-over" />
            <p className="text-[12.5px] text-foreground">{state.error}</p>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button type="button" size="sm" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            Save rate
          </Button>
        </div>
      </form>
    </Card>
  );
}
