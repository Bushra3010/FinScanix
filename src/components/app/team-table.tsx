"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Check, CircleAlert, LoaderCircle, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/field";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { useSession, useTier } from "@/components/app/session-context";
import {
  changeRoleAction,
  inviteMemberAction,
  setMemberStatusAction,
  type OrgActionState,
} from "@/lib/org/actions";
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
const ASSIGNABLE = ALL_ROLES.filter((role) => role !== "owner");

export function TeamTable({ users }: { users: User[] }) {
  const { user: me } = useSession();
  const tier = useTier();
  const canManage = me.role === "owner" || me.role === "admin";

  const [invite, inviteAction, inviting] = useActionState<OrgActionState, FormData>(
    inviteMemberAction,
    {},
  );
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<string | null>(null);

  const activeSeats = users.filter((u) => u.status !== "suspended").length;
  const seatLimit = tier.seats;
  const seatsFull = seatLimit !== null && activeSeats >= seatLimit;

  function run(action: (data: FormData) => Promise<OrgActionState>, data: FormData) {
    setRowError(null);
    startTransition(async () => {
      const result = await action(data);
      if (result.error) setRowError(result.error);
    });
  }

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
            {pending && <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />}
          </CardHeader>

          {rowError && (
            <div className="mx-5 mb-1 flex items-start gap-2 rounded-lg border border-over/40 bg-over-soft/50 px-3 py-2">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-over" />
              <p className="text-[12.5px] text-foreground">{rowError}</p>
            </div>
          )}

          <TableWrap>
            <Table>
              <THead>
                <tr>
                  <TH>Member</TH>
                  <TH>Role</TH>
                  <TH>Status</TH>
                  <TH>Last active</TH>
                  <TH className="text-right">Access</TH>
                </tr>
              </THead>
              <TBody>
                {users.map((user) => {
                  const isOwner = user.role === "owner";
                  const isMe = user.id === me.id;
                  const editable = canManage && !isOwner && !isMe;

                  return (
                    <TR key={user.id}>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[11px] font-semibold text-brand-soft-foreground">
                            {initials(user.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-foreground">
                              {user.name}
                              {isMe && (
                                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                                  you
                                </span>
                              )}
                            </p>
                            <p className="truncate text-[11.5px] text-muted-foreground">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD>
                        {isOwner ? (
                          <Badge tone="brand">Owner</Badge>
                        ) : editable ? (
                          <div className="w-36">
                            <Select
                              defaultValue={user.role}
                              disabled={pending}
                              className="h-8 text-[12.5px]"
                              aria-label={`Role for ${user.name}`}
                              onChange={(event) => {
                                const data = new FormData();
                                data.set("userId", user.id);
                                data.set("role", event.target.value);
                                run(changeRoleAction, data);
                              }}
                            >
                              {ASSIGNABLE.map((role) => (
                                <option key={role} value={role}>
                                  {ROLE_LABEL[role]}
                                </option>
                              ))}
                            </Select>
                          </div>
                        ) : (
                          <span className="text-[13px] text-muted-foreground">
                            {ROLE_LABEL[user.role]}
                          </span>
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
                      <TD className="text-right">
                        {editable ? (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={pending}
                            onClick={() => {
                              const data = new FormData();
                              data.set("userId", user.id);
                              data.set(
                                "status",
                                user.status === "suspended" ? "active" : "suspended",
                              );
                              run(setMemberStatusAction, data);
                            }}
                          >
                            {user.status === "suspended" ? "Reactivate" : "Suspend"}
                          </Button>
                        ) : (
                          <span className="text-[12px] text-muted-foreground/50">—</span>
                        )}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </TableWrap>
          <p className="border-t border-border px-5 py-3 text-[11.5px] leading-relaxed text-muted-foreground">
            Suspending a member revokes their signed-in sessions immediately — they are signed out
            on their next request, not when the session would have expired.
          </p>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>Invite a member</CardTitle>
              <CardDescription>Adds them to this organisation with the chosen role</CardDescription>
            </div>
          </CardHeader>
          <form action={inviteAction}>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="invite-email">Work email</Label>
                <Input
                  id="invite-email"
                  name="email"
                  type="email"
                  required
                  placeholder="name@company.in"
                />
              </div>
              <div>
                <Label htmlFor="invite-role">Role</Label>
                <Select id="invite-role" name="role" defaultValue="estimator">
                  {ASSIGNABLE.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABEL[role]}
                    </option>
                  ))}
                </Select>
              </div>

              {invite.error && (
                <div className="flex items-start gap-2 rounded-lg border border-over/40 bg-over-soft/50 px-3 py-2">
                  <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-over" />
                  <p className="text-[12.5px] leading-relaxed text-foreground">{invite.error}</p>
                </div>
              )}
              {invite.ok && invite.message && (
                <div className="flex items-start gap-2 rounded-lg border border-par/40 bg-par-soft/50 px-3 py-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-par" />
                  <p className="text-[12.5px] leading-relaxed text-foreground">{invite.message}</p>
                </div>
              )}

              <Button type="submit" className="w-full" disabled={seatsFull || !canManage || inviting}>
                {inviting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <UserPlus className="h-4 w-4" />
                )}
                Add member
              </Button>
              {seatsFull && (
                <p className="text-[12px] leading-relaxed text-over">
                  All {seatLimit} seats on the {tier.name} plan are in use. Upgrade or suspend a
                  member to free a seat.
                </p>
              )}
              {!canManage && (
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  Only owners and admins can add members.
                </p>
              )}
            </CardContent>
          </form>
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
