import type { Metadata } from "next";
import { PageHeader } from "@/components/app/page-parts";
import { RequirePermission } from "@/components/app/gates";
import { TeamTable } from "@/components/app/team-table";

export const metadata: Metadata = { title: "Team & roles" };

export default function TeamPage() {
  return (
    <>
      <PageHeader
        title="Team & roles"
        description="Who can reach what. Roles are checked server-side on every request, so a restricted user cannot reach an admin function by navigating to it."
      />
      <RequirePermission
        permission="users.manage"
        message="Only owners and admins can manage team members and roles."
      >
        <TeamTable />
      </RequirePermission>
    </>
  );
}
