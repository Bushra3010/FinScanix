"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Check, CircleAlert, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { FieldHint, Input, Label, Select } from "@/components/ui/field";
import {
  updateOrganisationAction,
  updateProfileAction,
  type OrgActionState,
} from "@/lib/org/actions";
import { ROLE_LABEL } from "@/lib/data/org";
import type { City, SessionUser } from "@/lib/types";

function Feedback({ state }: { state: OrgActionState }) {
  if (state.error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-over/40 bg-over-soft/50 px-3 py-2">
        <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-over" />
        <p className="text-[12.5px] leading-relaxed text-foreground">{state.error}</p>
      </div>
    );
  }
  if (state.ok && state.message) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-par/40 bg-par-soft/50 px-3 py-2">
        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-par" />
        <p className="text-[12.5px] leading-relaxed text-foreground">{state.message}</p>
      </div>
    );
  }
  return null;
}

export function ProfileForm({ user }: { user: SessionUser }) {
  const [state, action, pending] = useActionState<OrgActionState, FormData>(
    updateProfileAction,
    {},
  );

  return (
    <form action={action}>
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
            <Input id="profile-name" name="name" defaultValue={user.name} required />
          </div>
          <div>
            <Label htmlFor="profile-email">Work email</Label>
            <Input id="profile-email" type="email" defaultValue={user.email} disabled />
            <FieldHint>
              Your email is your sign-in identity and cannot be changed here.
            </FieldHint>
          </div>
          <div>
            <Label htmlFor="profile-role">Role</Label>
            <Input id="profile-role" defaultValue={ROLE_LABEL[user.role]} disabled />
            <FieldHint>
              Roles are assigned by an account owner from{" "}
              <Link href="/app/settings/team" className="text-brand hover:underline">
                Team &amp; roles
              </Link>
              .
            </FieldHint>
          </div>
          <Feedback state={state} />
        </CardContent>
        <CardFooter>
          <span className="text-[12px] text-muted-foreground">
            Changes apply to new activity only
          </span>
          <Button type="submit" size="sm" disabled={pending}>
            {pending && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            Save profile
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}

export function OrganisationForm({
  user,
  cities,
  canEdit,
}: {
  user: SessionUser;
  cities: City[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState<OrgActionState, FormData>(
    updateOrganisationAction,
    {},
  );

  return (
    <form action={action}>
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
            <Input
              id="org-name"
              name="name"
              defaultValue={user.organisation.name}
              disabled={!canEdit}
              required
            />
          </div>
          <div>
            <Label htmlFor="org-gstin">GSTIN</Label>
            <Input
              id="org-gstin"
              name="gstin"
              defaultValue={user.organisation.gstin}
              disabled={!canEdit}
              className="font-mono uppercase"
              maxLength={15}
            />
            <FieldHint>15 characters, e.g. 27AABCU9603R1ZM. Leave blank if not registered.</FieldHint>
          </div>
          <div>
            <Label htmlFor="org-city">Default project city</Label>
            <Select
              id="org-city"
              name="defaultCityId"
              defaultValue={user.organisation.defaultCityId}
              disabled={!canEdit}
            >
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}, {city.state}
                  {city.currency && city.region === "gcc" ? ` — ${city.currency}` : ""} — index {city.indexFactor.toFixed(2)}
                </option>
              ))}
            </Select>
            <FieldHint>
              Used when a document does not specify a location. Each document can override it.
            </FieldHint>
          </div>
          <Feedback state={state} />
        </CardContent>
        <CardFooter>
          <span className="text-[12px] text-muted-foreground">Owners and admins only</span>
          <Button type="submit" size="sm" disabled={!canEdit || pending}>
            {pending && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
            Save organisation
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
