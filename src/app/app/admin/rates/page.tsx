import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-parts";
import { AccessDenied } from "@/components/app/access-denied";
import { RateLibrary } from "@/components/app/rate-library";
import { CoverageGaps } from "@/components/app/coverage-gaps";
import { gateFor, requireUser } from "@/lib/auth/guard";
import { listCities, listCoverageGaps, listSorEntries } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Rate library" };

export default async function RatesPage() {
  const user = await requireUser();
  const gate = gateFor(user);

  const header = (
    <PageHeader
      title="Rate library"
      description="The Schedule of Rates baseline every line item is benchmarked against. Seeded from CPWD DSR and State PWD books, extendable with your own negotiated rates."
    />
  );

  if (!gate.allows("rates.manage")) {
    return (
      <>
        {header}
        <AccessDenied message="Rate management is restricted to owners and admins. Ask an account owner if you need access." />
      </>
    );
  }

  const [entries, cities, coverage] = await Promise.all([
    listSorEntries(user.organisation.id),
    listCities(),
    listCoverageGaps(user.organisation.id),
  ]);

  return (
    <>
      {header}
      <RateLibrary entries={entries} cities={cities} />
      <CoverageGaps gaps={coverage.gaps} matched={coverage.matched} unmatched={coverage.unmatched} />
    </>
  );
}
