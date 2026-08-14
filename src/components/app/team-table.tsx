"use client";

import { useState } from "react";
import { Check, MoreHorizontal, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useSession, useTier } from "@/components/app/session-context";
import { ROLE_LABEL, ROLE_SUMMARY } from "@/lib/data/org";
import type { Role, User } from "@/lib/types";
import { formatDate, initials } from "@/lib/utils";

const PERMISSION_MATRIX: { label: string; roles: Role[] }[] = [
  { label: "View documents and reports", roles: ["owner", "admin", "estimator", "auditor", "viewer"] },
  { label: "Upload documents", roles: ["owner", "admin", "estimator"] },
  { label: "Correct extracted line items", roles: ["owner", "admin", "estimator"] },
  { label: "Export reports", roles: ["owner", "admin", "estimator", "auditor"] },
  { label: "Delete documents", roles: ["owner", "admin"] },
  { label: "Manage rate library", roles: ["owner", "admin"] },
  { label: "Manage users and roles", roles: ["owner", "admin"] },
  { label: "Manage billing", roles: ["owner"] },
];

const ALL_ROLES: Role[] = ["owner", "admin", "estimator", "auditor", "viewer"];

export function TeamTable({ users }: { users: User[] }) {
  const { user: me } = useSession();
  const myRole = me.role;
  const tier = useTier();
  const [roles, setRoles] = useState<Record<string, Role>>(() =>
    Object.fromEntries(users.map((user) => [user.id, user.role])),
  );

  const activeSeats = users.filter((u) => u.status !== "suspended").length;
  const seatLimit = tier.seats;
  const seatsFull = seatLimit !== null && activeSeats >= seatLimit;

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1.7fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Members</CardTitle>
              <CardDescription>
                {activeSeats} of {seatLimit ?? "unlimited"} seats used on the {tier.name} plan
              </CardDescription>
            </div>
          </CardHeader>
          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Member</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Last active</TH>
                  <TH className="w-10" />
                </tr>
              </THead>
              <TBody>
                {users.map((user) => (
                  <TR key={user.id}>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-soft-foreground">
                          {initials(user.name)}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-foreground">{user.name}</p>
                          <p className="truncate text-[11.5px] text-muted-foreground">
                            {user.email}
                          </p>
                        </div>
                      </div>
                    </TD>
                    <TD>
                      {user.role === "owner" ? (
                        <Badge tone="brand">Owner</Badge>
                      ) : (
                        <div className="w-36">
                          <Select
                            value={roles[user.id]}
                            onChange={(event) =>
                              setRoles((prev) => ({
                                ...prev,
                                [user.id]: event.target.value as Role,
                              }))
                            }
                            disabled={myRole !== "owner" && myRole !== "admin"}
                            className="h-8 text-[12.5px]"
                            aria-label={`Role for ${user.name}`}
                          >
                            {ALL_ROLES.filter((r) => r !== "owner").map((r) => (
                              <option key={r} value={r}>
                                {ROLE_LABEL[r]}
                              </option>
                            ))}
                          </Select>
                        </div>
                      )}
                    </TD>
                    <TD>
                      <Badge
                        tone={
                          user.status === "active"
                            ? "par"
                            : user.status === "invited"
                              ? "warning"
                              : "outline"
                        }
                      >
                        {user.status}
                      </Badge>
                    </TD>
                    <TD className="text-[12.5px] whitespace-nowrap text-muted-foreground">
                      {formatDate(user.lastActive)}
                    </TD>
                    <TD>
                      <button
                        type="button"
                        className="cursor-pointer rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`Actions for ${user.name}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Invite a member</CardTitle>
              <CardDescription>They receive an email to set their own password</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="invite-email">Work email</Label>
              <Input id="invite-email" type="email" placeholder="name@company.in" />
            </div>
            <div>
              <Label htmlFor="invite-role">Role</Label>
              <Select id="invite-role" defaultValue="estimator">
                {ALL_ROLES.filter((r) => r !== "owner").map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>
            <Button className="w-full" disabled={seatsFull}>
              <UserPlus className="h-4 w-4" />
              Send invitation
            </Button>
            {seatsFull && (
              <p className="text-[12px] leading-relaxed text-over">
                All {seatLimit} seats on the {tier.name} plan are in use. Upgrade or suspend a
                member to free a seat.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>What each role can do</CardTitle>
            <CardDescription>
              Enforced on the server for every request, not just hidden in the interface
            </CardDescription>
          </div>
        </CardHeader>
        <TableWrap>
          <Table>
            <THead>
              <tr>
                <TH>Capability</TH>
                {ALL_ROLES.map((role) => (
                  <TH key={role} className="text-center">
                    {ROLE_LABEL[role]}
                  </TH>
                ))}
              </tr>
            </THead>
            <TBody>
              {PERMISSION_MATRIX.map((row) => (
                <TR key={row.label}>
                  <TD className="text-[13px] font-medium text-foreground">{row.label}</TD>
                  {ALL_ROLES.map((role) => (
                    <TD key={role} className="text-center">
                      {row.roles.includes(role) ? (
                        <Check className="mx-auto h-4 w-4 text-par" />
                      ) : (
                        <span className="text-muted-foreground/40">—</span>
                      )}
                    </TD>
                  ))}
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
        <CardContent className="border-t border-border">
          <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_ROLES.map((role) => (
              <div key={role}>
                <dt className="text-[12.5px] font-semibold text-foreground">
                  {ROLE_LABEL[role]}
                </dt>
                <dd className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  {ROLE_SUMMARY[role]}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
