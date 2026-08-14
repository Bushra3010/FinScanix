import type { Metadata } from "next";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { PageHeader } from "@/components/app/page-parts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FieldHint, Input, Label, Select } from "@/components/ui/field";
import { CITIES } from "@/lib/data/reference";
import { CURRENT_USER, ORGANISATION, ROLE_LABEL } from "@/lib/data/org";

export const metadata: Metadata = { title: "Settings" };

const NOTIFICATIONS = [
  { id: "analysis", label: "A document finishes analysis", default: true },
  { id: "flagged", label: "A document is billed more than 15% above benchmark", default: true },
  { id: "rejected", label: "An upload is rejected at the quality gate", default: true },
  { id: "quota", label: "Monthly document quota reaches 80%", default: true },
  { id: "rates", label: "Rate library is updated by an admin or a scheduled job", default: false },
  { id: "digest", label: "Weekly variance digest", default: false },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Your profile, the organisation record used on reports, and how FinScanix handles your data."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Profile</CardTitle>
              <CardDescription>Shown on the audit trail of anything you touch</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="profile-name">Full name</Label>
              <Input id="profile-name" defaultValue={CURRENT_USER.name} />
            </div>
            <div>
              <Label htmlFor="profile-email">Work email</Label>
              <Input id="profile-email" type="email" defaultValue={CURRENT_USER.email} />
            </div>
            <div>
              <Label htmlFor="profile-role">Role</Label>
              <Input id="profile-role" defaultValue={ROLE_LABEL[CURRENT_USER.role]} disabled />
              <FieldHint>
                Roles are assigned by an account owner from{" "}
                <Link href="/app/settings/team" className="text-brand hover:underline">
                  Team &amp; roles
                </Link>
                .
              </FieldHint>
            </div>
          </CardContent>
          <CardFooter>
            <span className="text-[12px] text-muted-foreground">
              Changes apply to new activity only
            </span>
            <Button size="sm">Save profile</Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Organisation</CardTitle>
              <CardDescription>Appears on exported variance reports</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="org-name">Organisation name</Label>
              <Input id="org-name" defaultValue={ORGANISATION.name} />
            </div>
            <div>
              <Label htmlFor="org-gstin">GSTIN</Label>
              <Input id="org-gstin" defaultValue={ORGANISATION.gstin} className="font-mono" />
            </div>
            <div>
              <Label htmlFor="org-city">Default project city</Label>
              <Select id="org-city" defaultValue={ORGANISATION.defaultCityId}>
                {CITIES.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}, {city.state} — index {city.indexFactor.toFixed(2)}
                  </option>
                ))}
              </Select>
              <FieldHint>
                Used when a document does not specify a location. Each document can override it.
              </FieldHint>
            </div>
          </CardContent>
          <CardFooter>
            <span className="text-[12px] text-muted-foreground">Owners and admins only</span>
            <Button size="sm">Save organisation</Button>
          </CardFooter>
        </Card>

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
                  className="flex cursor-pointer items-start gap-2.5 text-[13px] text-muted-foreground"
                >
                  <input
                    type="checkbox"
                    defaultChecked={item.default}
                    className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border-strong accent-[var(--brand)]"
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </CardContent>
          <CardFooter>
            <span />
            <Button size="sm">Save preferences</Button>
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
