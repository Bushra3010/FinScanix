import { TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { CoverageGap } from "@/lib/db/queries";
import { formatDate, formatINR } from "@/lib/utils";

/**
 * What the rate library cannot yet price, ranked by the spend behind it.
 *
 * This is the shopping list for the rate book: every row here is money the
 * variance engine could not judge, and loading a rate that covers it converts
 * a blank verdict into a real one.
 */
export function CoverageGaps({
  gaps,
  matched,
  unmatched,
}: {
  gaps: CoverageGap[];
  matched: number;
  unmatched: number;
}) {
  const total = matched + unmatched;
  const pct = total === 0 ? 0 : Math.round((matched / total) * 100);

  return (
    <Card className="mt-6">
      <CardHeader>
        <div>
          <CardTitle>Rate book coverage</CardTitle>
          <CardDescription>
            {total === 0
              ? "No analysed line items yet"
              : `${pct}% of ${total} analysed line items matched a rate — ${unmatched} could not be priced`}
          </CardDescription>
        </div>
        {unmatched > 0 && <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />}
      </CardHeader>

      {gaps.length === 0 ? (
        <CardContent>
          <p className="text-[13px] text-muted-foreground">
            {total === 0
              ? "Upload a document and anything the rate library cannot price will be listed here."
              : "Every analysed line item matched a rate in the library."}
          </p>
        </CardContent>
      ) : (
        <>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Description the library cannot price</TH>
                  <TH>Unit</TH>
                  <TH className="text-right">Times seen</TH>
                  <TH className="text-right">Value unpriced</TH>
                  <TH>Last seen</TH>
                </tr>
              </THead>
              <TBody>
                {gaps.map((gap) => (
                  <TR key={gap.description}>
                    <TD className="max-w-xl">
                      <p className="line-clamp-2 text-[13px] leading-snug text-foreground">
                        {gap.description}
                      </p>
                    </TD>
                    <TD className="text-[12.5px] text-muted-foreground">{gap.unit}</TD>
                    <TD className="tnum text-right text-[13px]">{gap.occurrences}</TD>
                    <TD className="tnum text-right text-[13px] font-medium whitespace-nowrap text-foreground">
                      {formatINR(gap.value, { decimals: 0 })}
                    </TD>
                    <TD className="text-[12.5px] whitespace-nowrap text-muted-foreground">
                      {formatDate(gap.lastSeen)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
          <p className="border-t border-border px-5 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
            Ranked by the value passing through each gap, so the rates worth loading first are at
            the top. Add them individually above, or import a rate book covering them from Bulk
            upload — every one of these lines gets a verdict as soon as the library can price it.
          </p>
        </>
      )}
    </Card>
  );
}
