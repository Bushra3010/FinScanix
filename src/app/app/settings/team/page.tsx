import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-parts";
import { AccessDenied } from "@/components/app/access-denied";
import { TeamTable } from "@/components/app/team-table";
import { requireUser, gateFor } from "@/lib/auth/guard";
import { listUsers } from "@/lib/db/queries";

export const metadata: Metadata = { title: "Team & roles" };

export default async function TeamPage() {
  const user = await requireUser();
  const gate = gateFor(user);

  const header = (
    <PageHeader
      title="Team & roles"
      description="Who can reach what. Roles are checked server-side on every request, so a restricted user cannot reach an admin function by navigating to it."
    />
  );

  // Checked before the query runs: member emails must not reach the response at
  // all for a role that cannot manage users.
  if (!gate.allows("users.manage")) {
    return (
      <>
        {header}
        <AccessDenied message="Only owners and admins can manage team members and roles." />
      </>
    );
  }

  const users = await listUsers(user.organisation.id);

  return (
    <>
      {header}
      <TeamTable users={users} />
    </>
  );
}
