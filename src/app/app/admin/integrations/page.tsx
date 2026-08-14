import type { Metadata } from "next";
import { KeyRound, Plug, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app/page-parts";
import { RequirePermission } from "@/components/app/gates";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SERVICE_STATUS } from "@/lib/adapters";

export const metadata: Metadata = { title: "Integrations" };

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Every external dependency sits behind an adapter. A service goes live the moment its credentials are present — until then it runs on a mock, so nothing in the app breaks."
      />

      <RequirePermission
        permission="rates.manage"
        message="Integration configuration is restricted to owners and admins."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {SERVICE_STATUS.map((service) => (
            <Card key={service.key}>
              <CardHeader>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <CardTitle>{service.name}</CardTitle>
                    <Badge tone={service.adapter.live ? "par" : "warning"} dot>
                      {service.adapter.live ? "Live" : "Mock"}
                    </Badge>
                  </div>
                  <CardDescription>{service.requirement}</CardDescription>
                </div>
                <Plug className="h-4 w-4 shrink-0 text-muted-foreground" />
              </CardHeader>

              <CardContent className="space-y-3">
                <div className="flex items-center justify-between gap-3 text-[13px]">
                  <span className="text-muted-foreground">Provider</span>
                  <span className="font-medium text-foreground">{service.adapter.provider}</span>
                </div>

                <div className="border-t border-border pt-3">
                  <p className="text-[11.5px] font-medium tracking-wide text-muted-foreground uppercase">
                    Required credentials
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {service.adapter.requiredEnv.map((env) => (
                      <code
                        key={env}
                        className="rounded-md border border-border bg-surface-sunken px-2 py-1 font-mono text-[11.5px] text-foreground"
                      >
                        {env}
                      </code>
                    ))}
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">
                    {service.adapter.live
                      ? "Configured on the server. Requests are billed to your provider account."
                      : "Not configured — this service is running on its mock implementation."}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-muted-foreground" />
                <CardTitle>How credentials are handled</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
                {[
                  "Keys are read from the server environment only — none are prefixed NEXT_PUBLIC_, so none reach the browser.",
                  "Each adapter receives only the credentials it needs; a pricing key cannot reach billing.",
                  "A missing key degrades that one service to its mock rather than failing the request.",
                  "Keys are never written to logs, reports or exports.",
                ].map((point) => (
                  <li key={point} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                    {point}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <CardTitle>Adding a provider</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                The pricing module is deliberately modular so a private market-data feed can be
                added later without touching any screen. Implement the adapter interface, register
                it in the service map, and it is selected automatically once its credentials are
                set.
              </p>
              <code className="mt-3 block overflow-x-auto rounded-lg border border-border bg-surface-sunken p-3 font-mono text-[11.5px] leading-relaxed text-foreground">
                src/lib/adapters/types.ts — interfaces
                <br />
                src/lib/adapters/live.ts — provider implementations
                <br />
                src/lib/adapters/index.ts — selection by credential
              </code>
            </CardContent>
          </Card>
        </div>
      </RequirePermission>
    </>
  );
}
