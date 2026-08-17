import type { Metadata } from "next";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-parts";
import { OrganisationForm, ProfileForm } from "@/components/app/settings-forms";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/guard";
import { listCities } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Settings" };

const NOTIFICATIONS = [
  { id: "analysis", label: "A document finishes analysis", default: true },
  { id: "flagged", label: "A document is billed more than 15% above benchmark", default: true },
  { id: "rejected", label: "An upload is rejected at the quality gate", default: true },
  { id: "quota", label: "Monthly document quota reaches 80%", default: true },
  { id: "rates", label: "Rate library is updated by an admin or a scheduled job", default: false },
  { id: "digest", label: "Weekly variance digest", default: false },
];

export default async function SettingsPage() {
  const user = await requireUser();
  const cities = await listCities();
  const canEditOrg = user.role === "owner" || user.role === "admin";

  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile, the organisation record used on reports, and how FinScanix handles your data."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileForm user={user} />

        <OrganisationForm user={user} cities={cities} canEdit={canEditOrg} />

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Email alerts for this account</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {NOTIFICATIONS.map((item) => (
                <label
                  key={item.id}
                  className="flex items-start gap-2.5 text-[13px] text-muted-foreground"
                >
                  <input
                    type="checkbox"
                    defaultChecked={item.default}
                    disabled
                    className="mt-0.5 h-4 w-4 rounded border-border-strong accent-[var(--brand)]"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <span className="text-[12px] leading-relaxed text-muted-foreground">
              No email provider is connected to this deployment yet, so none of these alerts are
              sent. The list is shown as the intended set, not as active preferences.
            </span>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Data & retention</CardTitle>
              <CardDescription>What FinScanix keeps, and for how long</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Deleting a document removes that document, its extracted line items, its cached
              market quotes and its generated reports. It never cascades to other documents or to
              account data.
            </p>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Data linked to an active subscription and to core usage is retained; everything else
              is purged on the retention schedule in your service agreement.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" variant="outline">
                Export my data
              </Button>
              <Link
                href="/security#retention"
                className="inline-flex h-8 items-center rounded-lg px-3 text-[13px] text-muted-foreground hover:text-foreground"
              >
                Read the retention policy
              </Link>
            </div>

            <div className="mt-2 rounded-lg border border-over/40 bg-over-soft/40 p-4">
              <p className="text-[13px] font-semibold text-foreground">Delete account</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                Permanently removes the organisation, its users and every document. This cannot be
                undone and is only available to the account owner.
              </p>
              <Button size="sm" variant="danger" className="mt-3">
                <Trash2 className="h-3.5 w-3.5" />
                Delete account
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
