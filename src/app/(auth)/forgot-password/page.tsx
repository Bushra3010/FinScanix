"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, LoaderCircle, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/field";
import { forgotPasswordAction, type ResetState } from "@/lib/auth/reset-password";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState<ResetState, FormData>(
    forgotPasswordAction,
    {},
  );

  return (
    <div>
      <Link
        href="/login"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to sign in
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Forgot your password?
      </h1>
      <p className="mt-1.5 text-[13.5px] text-muted-foreground">
        Enter your work email and we&apos;ll send you a reset link.
      </p>

      {state.success ? (
        <div className="mt-8 space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-par/40 bg-par-soft/50 p-4">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-par" />
            <div>
              <p className="text-[13.5px] font-medium text-foreground">Check your inbox</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">
                If that address is registered, a reset link is on its way. It expires in 1 hour.
              </p>
            </div>
          </div>

          {/* Fallback: show direct link when email delivery fails */}
          {state.devLink && (
            <div className="rounded-xl border border-brand/30 bg-brand-soft p-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-brand-soft-foreground">
                Email could not be delivered — use this link directly
              </p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">
                Copy and open this link to reset your password:
              </p>
              <a
                href={state.devLink}
                className="mt-2 block break-all text-[12px] font-mono text-brand hover:underline"
              >
                {state.devLink}
              </a>
            </div>
          )}

          <p className="text-center text-[13px] text-muted-foreground">
            Didn&apos;t receive it?{" "}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="font-medium text-brand hover:underline"
            >
              Try again
            </button>
          </p>
        </div>
      ) : (
        <form action={formAction} className="mt-8 space-y-4">
          {state.error && (
            <div className="flex gap-2.5 rounded-lg border border-over/40 bg-over-soft/50 px-3.5 py-3">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-over" />
              <p className="text-[12.5px] leading-relaxed text-foreground">{state.error}</p>
            </div>
          )}

          <div>
            <Label htmlFor="email">Work email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="name@company.in"
              required
            />
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <LoaderCircle className="h-4 w-4 animate-spin" />
                Sending reset link…
              </>
            ) : (
              <>
                <Mail className="h-4 w-4" />
                Send reset link
              </>
            )}
          </Button>
        </form>
      )}
    </div>
  );
}
