"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/field";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { usePrototype } from "@/components/app/prototype-context";
import { CITIES, SOR_CATALOG, getCity } from "@/lib/data/reference";
import { formatDate, formatINR } from "@/lib/utils";

export function RateLibrary() {
  const { cityId, setCityId } = usePrototype();
  const [query, setQuery] = useState("");
  const [chapter, setChapter] = useState("all");

  const city = getCity(cityId);

  const chapters = useMemo(
    () => Array.from(new Set(SOR_CATALOG.map((entry) => entry.chapter))).sort(),
    [],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return SOR_CATALOG.filter((entry) => {
      const matchesChapter = chapter === "all" || entry.chapter === chapter;
      const matchesQuery =
        q === "" ||
        entry.description.toLowerCase().includes(q) ||
        entry.code.toLowerCase().includes(q) ||
        entry.source.toLowerCase().includes(q);
      return matchesChapter && matchesQuery;
    });
  }, [query, chapter]);

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
            {CITIES.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} · ×{entry.indexFactor.toFixed(2)}
              </option>
            ))}
          </Select>
        </div>

        <Button>
          <Plus className="h-4 w-4" />
          Add rate
        </Button>
      </div>

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
                    <Badge tone="neutral">{entry.source}</Badge>
                  </TD>
                  <TD className="text-[12.5px] whitespace-nowrap text-muted-foreground">
                    {formatDate(entry.effectiveFrom)}
                  </TD>
                  <TD>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Edit ${entry.code}`}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-over"
                        aria-label={`Delete ${entry.code}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
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
        Showing {rows.length} of {SOR_CATALOG.length} entries. The {city.name} column applies the
        city cost index (×{city.indexFactor.toFixed(2)}) to the base rate — this is the figure the
        variance engine benchmarks against for projects in that city.
      </p>
    </>
  );
}
