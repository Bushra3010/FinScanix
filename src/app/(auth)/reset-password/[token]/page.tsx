"use client";

import { useActionState } from "react";
import Link from "next/link";
import { use } from "react";
import { CircleAlert, LoaderCircle, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label } from "@/components/ui/field";
import { resetPasswordAction, type ResetState } from "@/lib/auth/reset-password";

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);

  // Bind the token into the action so the form only needs password fields.
  const boundAction = resetPasswordAction.bind(null, token);
  const [state, formAction, pending] = useActionState<ResetState, FormData>(boundAction, {});

  return (
    <div>
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <ShieldCheck className="h-6 w-6" />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Choose a new password
      </h1>
      <p className="mt-1.5 text-[13.5px] text-muted-foreground">
        Pick something strong — at least 12 characters with a number or symbol.
      </p>

      {state.error && (
        <div className="mt-5 flex gap-2.5 rounded-lg border border-over/40 bg-over-soft/50 px-3.5 py-3">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-over" />
          <div>
            <p className="text-[12.5px] leading-relaxed text-foreground">{state.error}</p>
            {state.error.includes("expired") && (
              <Link
                href="/forgot-password"
                className="mt-1 inline-block text-[12.5px] font-medium text-brand hover:underline"
              >
                Request a new reset link →
              </Link>
            )}
          </div>
        </div>
      )}

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            required
          />
          <FieldHint>Minimum 12 characters with a number or symbol.</FieldHint>
        </div>

        <div>
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            placeholder="••••••••••••"
            required
          />
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Updating password…
            </>
          ) : (
            "Set new password"
          )}
        </Button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
