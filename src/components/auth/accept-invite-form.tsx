"use client";

import { useActionState } from "react";
import { CircleAlert, LoaderCircle } from "lucide-react";
import { acceptInviteAction, type AuthState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/field";

/**
 * Where an invited member claims their account.
 *
 * The email is shown but not editable: it is what the invitation was issued
 * against, and letting it be changed here would turn an invitation to one
 * person into an account for another.
 */
export function AcceptInviteForm({
  token,
  email,
  organisation,
}: {
  token: string;
  email: string;
  organisation: string;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(acceptInviteAction, {});

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Join {organisation}
      </h1>
      <p className="mt-1.5 text-[13.5px] text-muted-foreground">
        Choose a password and your account is ready.
      </p>

      <form action={action} className="mt-6 space-y-4">
        <input type="hidden" name="token" value={token} />

        <div>
          <Label htmlFor="invite-email">Work email</Label>
          <Input id="invite-email" type="email" value={email} disabled readOnly />
          <FieldHint>This invitation was issued to this address.</FieldHint>
        </div>

        <div>
          <Label htmlFor="invite-name">Full name</Label>
          <Input id="invite-name" name="name" required autoFocus placeholder="Priya Nair" />
        </div>

        <div>
          <Label htmlFor="invite-password">Password</Label>
          <Input id="invite-password" name="password" type="password" required minLength={12} />
          <FieldHint>At least 12 characters.</FieldHint>
        </div>

        <div>
          <Label htmlFor="invite-confirm">Confirm password</Label>
          <Input id="invite-confirm" name="confirm" type="password" required minLength={12} />
        </div>

        {state.error && (
          <div className="flex gap-2.5 rounded-lg border border-over/40 bg-over-soft/50 px-3.5 py-3">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-over" />
            <p className="text-[12.5px] leading-relaxed text-foreground">{state.error}</p>
          </div>
        )}

        <Button type="submit" className="w-full" disabled={pending}>
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
          Set password and sign in
        </Button>
      </form>
    </div>
  );
}
