"use client";

import { useActionState } from "react";
import Link from "next/link";
import { CircleAlert, Info, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, Select } from "@/components/ui/field";
import { loginAction, registerAction, type AuthState } from "@/lib/auth/actions";
import { CITIES } from "@/lib/data/reference";
import { TIERS } from "@/lib/data/org";
import type { TierId } from "@/lib/types";

/**
 * Credentials are posted to a server action, verified against a scrypt hash,
 * and exchanged for a database-backed session cookie. Nothing about the
 * password reaches the client bundle or the URL.
 */
export function AuthForm({
  mode,
  plan,
  expired,
}: {
  mode: "login" | "register";
  plan?: TierId;
  /** Set when the visitor arrived because their session had lapsed. */
  expired?: boolean;
}) {
  const isRegister = mode === "register";
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    isRegister ? registerAction : loginAction,
    {},
  );

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {isRegister ? "Create your account" : "Sign in to FinScanix"}
      </h1>
      <p className="mt-1.5 text-[13.5px] text-muted-foreground">
        {isRegister
          ? "14-day trial of the full pipeline. No card required."
          : "Verify vendor rates against SoR and live market pricing."}
      </p>

      {expired && (
        <div className="mt-5 flex gap-2.5 rounded-lg border border-warning/40 bg-warning-soft/50 px-3.5 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <p className="text-[12.5px] leading-relaxed text-foreground">
            Your session has ended — it either expired or was signed out elsewhere. Sign in again
            to carry on.
          </p>
        </div>
      )}

      {!isRegister && (
        <div className="mt-5 flex gap-2.5 rounded-lg border border-border bg-brand-soft/50 px-3.5 py-3">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Demo data seeded.</span> Sign in as{" "}
            <code className="font-mono text-[11.5px] text-foreground">asif@meridian-infra.in</code>{" "}
            (owner) or any seeded account — the password is in the README. Other roles show the
            access restrictions in action.
          </p>
        </div>
      )}

      {state.error && (
        <div className="mt-5 flex gap-2.5 rounded-lg border border-over/40 bg-over-soft/50 px-3.5 py-3">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-over" />
          <p className="text-[12.5px] leading-relaxed text-foreground">{state.error}</p>
        </div>
      )}

      <form action={formAction} className="mt-6 space-y-4">
        {isRegister && (
          <>
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" name="name" autoComplete="off" placeholder="Your name" required />
            </div>
            <div>
              <Label htmlFor="org">Organisation</Label>
              <Input id="org" name="org" autoComplete="off" placeholder="Company name" required />
            </div>
          </>
        )}

        <div>
          <Label htmlFor="email">Work email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="off"
            placeholder="name@company.in"
            required
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {!isRegister && (
              <Link href="/login" className="mb-1.5 text-[12.5px] text-brand hover:underline">
                Forgot password?
              </Link>
            )}
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            placeholder="••••••••••"
            required
          />
          {isRegister && (
            <FieldHint>
              Minimum 12 characters with a number and a symbol. Checked against known breached
              passwords.
            </FieldHint>
          )}
        </div>

        {isRegister && (
          <>
            <div>
              <Label htmlFor="city">Primary project city</Label>
              <Select id="city" name="city" defaultValue="noida">
                {CITIES.map((city) => (
                  <option key={city.id} value={city.id}>
                    {city.name}, {city.state} · index {city.indexFactor.toFixed(2)}
                  </option>
                ))}
              </Select>
              <FieldHint>Sets the default cost index for rate adjustment. Changeable per project.</FieldHint>
            </div>

            <div>
              <Label htmlFor="plan">Plan</Label>
              <Select id="plan" name="plan" defaultValue={plan ?? "professional"}>
                {TIERS.map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.name}
                    {tier.documentQuota ? ` · ${tier.documentQuota} docs/month` : " · unlimited"}
                  </option>
                ))}
              </Select>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] leading-relaxed text-muted-foreground">
              <input
                type="checkbox"
                required
                className="mt-0.5 h-4 w-4 cursor-pointer rounded border-border-strong accent-[var(--brand)]"
              />
              <span>
                I agree to the terms of service and confirm I am authorised to upload my
                organisation&apos;s vendor documents.
              </span>
            </label>
          </>
        )}

        {!isRegister && (
          <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4 cursor-pointer rounded border-border-strong accent-[var(--brand)]"
            />
            Keep me signed in on this device
          </label>
        )}

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
          {isRegister ? "Create account" : "Sign in"}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        {isRegister ? "Already have an account? " : "New to FinScanix? "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="font-medium text-brand hover:underline"
        >
          {isRegister ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </div>
  );
}
