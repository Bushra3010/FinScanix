import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { AcceptInviteForm } from "@/components/auth/accept-invite-form";
import { resolveInvite } from "@/lib/auth/invites";

export const metadata: Metadata = { title: "Accept invitation" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await resolveInvite(token);

  // One message for every way a link can fail — expired, already used, revoked,
  // never valid. Distinguishing them would tell a stranger which tokens exist.
  if (!invite) {
    return (
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          This invitation cannot be used
        </h1>
        <div className="mt-5 flex gap-2.5 rounded-lg border border-over/40 bg-over-soft/50 px-3.5 py-3">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-over" />
          <p className="text-[12.5px] leading-relaxed text-foreground">
            The link has expired, has already been used, or has been replaced by a newer one.
            Ask whoever invited you to issue another from Team &amp; roles.
          </p>
        </div>
        <p className="mt-5 text-[13px] text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-brand hover:underline">
            Sign in
          </Link>
          .
        </p>
      </div>
    );
  }

  return <AcceptInviteForm token={token} email={invite.email} organisation={invite.organisationName} />;
}
