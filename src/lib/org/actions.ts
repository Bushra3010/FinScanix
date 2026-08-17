"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/client";
import { requirePermission, requireUser } from "@/lib/auth/guard";
import { hashPassword } from "@/lib/auth/password";
import { getTier } from "@/lib/data/org";
import { CITIES } from "@/lib/data/reference";
import type { Role } from "@/lib/types";

/** Team and account management — FR-7.2. */

export interface OrgActionState {
  error?: string;
  ok?: boolean;
  message?: string;
}

const ASSIGNABLE: Role[] = ["admin", "estimator", "auditor", "viewer"];

export async function inviteMemberAction(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const user = await requirePermission("users.manage");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const role = String(formData.get("role") ?? "estimator") as Role;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }
  if (!ASSIGNABLE.includes(role)) {
    return { error: "Choose a role other than Owner." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Someone with that email already has an account." };
  }

  // Seats are enforced here, not in the interface — FR-8.3.
  const tier = getTier(user.organisation.subscription.tierId);
  if (tier.seats !== null) {
    const inUse = await prisma.user.count({
      where: { organisationId: user.organisation.id, status: { not: "suspended" } },
    });
    if (inUse >= tier.seats) {
      return {
        error: `All ${tier.seats} seats on the ${tier.name} plan are in use. Upgrade, or suspend a member to free one.`,
      };
    }
  }

  // The invitee sets their own password; this placeholder is unguessable and
  // is never a usable credential.
  const placeholder = await hashPassword(randomBytes(32).toString("base64url"));

  await prisma.user.create({
    data: {
      organisationId: user.organisation.id,
      name: email.split("@")[0],
      email,
      passwordHash: placeholder,
      role,
      status: "invited",
    },
  });

  await prisma.activityEvent.create({
    data: {
      organisationId: user.organisation.id,
      kind: "member",
      actor: user.name,
      message: `Invited ${email} as ${role}`,
    },
  });

  revalidatePath("/app/settings/team");
  return {
    ok: true,
    // Said plainly rather than implying an email went out, because none does yet.
    message: `${email} added as ${role}. Invitation email delivery is not wired up yet — they cannot sign in until a password is set.`,
  };
}

export async function changeRoleAction(formData: FormData): Promise<OrgActionState> {
  const actor = await requirePermission("users.manage");

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;

  if (!ASSIGNABLE.includes(role)) {
    return { error: "That role cannot be assigned." };
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, organisationId: actor.organisation.id },
  });
  if (!target) return { error: "That member is not in your organisation." };

  // The owner role is the account's root of trust — it is not reassignable
  // through this path, in either direction.
  if (target.role === "owner") {
    return { error: "The account owner's role cannot be changed here." };
  }
  if (target.id === actor.id) {
    return { error: "You cannot change your own role." };
  }

  await prisma.user.update({ where: { id: target.id }, data: { role } });

  await prisma.activityEvent.create({
    data: {
      organisationId: actor.organisation.id,
      kind: "member",
      actor: actor.name,
      message: `Changed ${target.email} to ${role}`,
    },
  });

  revalidatePath("/app/settings/team");
  return { ok: true };
}

export async function setMemberStatusAction(formData: FormData): Promise<OrgActionState> {
  const actor = await requirePermission("users.manage");

  const userId = String(formData.get("userId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "active" && status !== "suspended") {
    return { error: "Unknown status." };
  }

  const target = await prisma.user.findFirst({
    where: { id: userId, organisationId: actor.organisation.id },
  });
  if (!target) return { error: "That member is not in your organisation." };
  if (target.role === "owner") return { error: "The account owner cannot be suspended." };
  if (target.id === actor.id) return { error: "You cannot suspend yourself." };

  await prisma.user.update({ where: { id: target.id }, data: { status } });

  // Suspension takes effect immediately: existing sessions are revoked rather
  // than left alive until they expire.
  if (status === "suspended") {
    await prisma.session.deleteMany({ where: { userId: target.id } });
  }

  await prisma.activityEvent.create({
    data: {
      organisationId: actor.organisation.id,
      kind: "member",
      actor: actor.name,
      message: `${status === "suspended" ? "Suspended" : "Reactivated"} ${target.email}`,
    },
  });

  revalidatePath("/app/settings/team");
  return { ok: true };
}

export async function updateProfileAction(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const user = await requireUser();

  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2) return { error: "Enter your name." };

  await prisma.user.update({ where: { id: user.id }, data: { name } });
  revalidatePath("/app/settings");
  return { ok: true, message: "Profile saved." };
}

export async function updateOrganisationAction(
  _prev: OrgActionState,
  formData: FormData,
): Promise<OrgActionState> {
  const user = await requirePermission("users.manage");

  const name = String(formData.get("name") ?? "").trim();
  const gstin = String(formData.get("gstin") ?? "").trim().toUpperCase();
  const defaultCityId = String(formData.get("defaultCityId") ?? "");

  if (name.length < 2) return { error: "Enter an organisation name." };
  if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin)) {
    return { error: "That GSTIN is not in the standard 15-character format." };
  }
  if (!CITIES.some((city) => city.id === defaultCityId)) {
    return { error: "Choose a valid default city." };
  }

  await prisma.organisation.update({
    where: { id: user.organisation.id },
    data: { name, gstin, defaultCityId },
  });

  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return { ok: true, message: "Organisation saved." };
}
