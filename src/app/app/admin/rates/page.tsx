import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-parts";
import { RequirePermission } from "@/components/app/gates";
import { RateLibrary } from "@/components/app/rate-library";

export const metadata: Metadata = { title: "Rate library" };

export default function RatesPage() {
  return (
    <>
      <PageHeader
        title="Rate library"
        description="The Schedule of Rates baseline every line item is benchmarked against. Seeded from CPWD DSR and State PWD books, extendable with your own negotiated rates."
      />
      <RequirePermission
        permission="rates.manage"
        message="Rate management is restricted to owners and admins. Ask an account owner if you need access."
      >
        <RateLibrary />
      </RequirePermission>
    </>
  );
}
