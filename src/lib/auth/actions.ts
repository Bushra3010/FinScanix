"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { hashPassword, validatePassword, verifyPassword } from "./password";
import { createSession, destroySession, pruneExpiredSessions } from "./session";
import { consumeInvite, resolveInvite } from "./invites";
import { CITIES } from "@/lib/data/reference";

export interface AuthState {
  error?: string;
}

/**
 * A throwaway hash verified when no account matches, so a wrong email and a
 * wrong password take the same time. Without it, response timing tells an
 * attacker which addresses are registered.
 */
const DUMMY_HASH =
  "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "Ej0kJ0k5R0pFTUxNQ0pJUUlOWFpBQkNERUZHSElKS0xNTk9QUVJTVFVWV1hZWjAxMjM0NTY3ODlBQg==";

function readString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

export async function loginAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = readString(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    await verifyPassword(password, DUMMY_HASH);
    return { error: "Email or password is incorrect." };
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    return { error: "Email or password is incorrect." };
  }

  if (user.status === "suspended") {
    return { error: "This account has been suspended. Contact your account owner." };
  }

  const userAgent = (await headers()).get("user-agent") ?? undefined;
  await pruneExpiredSessions();
  await createSession(user.id, userAgent);
  await prisma.user.update({
    where: { id: user.id },
    data: { lastActive: new Date(), status: user.status === "invited" ? "active" : user.status },
  });

  // Outside the guarded block: redirect() signals by throwing.
  redirect("/app/dashboard");
}

export async function registerAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const name = readString(formData, "name");
  const organisationName = readString(formData, "org");
  const email = readString(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const cityId = readString(formData, "city") || "delhi";

  if (!name || !organisationName || !email) {
    return { error: "Fill in your name, organisation and email." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const passwordProblem = validatePassword(password);
  if (passwordProblem) return { error: passwordProblem };

  if (!CITIES.some((city) => city.id === cityId)) {
    return { error: "Select a valid project city." };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists. Sign in instead." };
  }

  const passwordHash = await hashPassword(password);
  const trialEnds = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  // New signups get their own tenant and own it. The 14-day trial runs on the
  // Professional entitlement set so the full pipeline can be evaluated.
  const user = await prisma.$transaction(async (tx) => {
    const organisation = await tx.organisation.create({
      data: {
        name: organisationName,
        gstin: "",
        defaultCityId: cityId,
        subscription: {
          create: {
            tierId: "professional",
            status: "trialing",
            billingCycle: "monthly",
            renewsOn: trialEnds,
            documentsUsed: 0,
            seatsUsed: 1,
          },
        },
      },
    });

    return tx.user.create({
      data: {
        organisationId: organisation.id,
        name,
        email,
        passwordHash,
        role: "owner",
        status: "active",
      },
    });
  });

  const userAgent = (await headers()).get("user-agent") ?? undefined;
  await createSession(user.id, userAgent);

  redirect("/app/dashboard");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

/**
 * Accepts an invitation: sets the member's own password and signs them in.
 *
 * The token is checked again here rather than trusted from the page that
 * rendered the form — a form can be posted to directly, and the page's check
 * happened at render time.
 */
export async function acceptInviteAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const token = String(formData.get("token") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const invite = await resolveInvite(token);
  if (!invite) {
    return { error: "This invitation has expired or has already been used. Ask for a new one." };
  }

  if (name.length < 2) return { error: "Enter your full name." };
  if (password !== confirm) return { error: "The two passwords do not match." };

  const problem = validatePassword(password);
  if (problem) return { error: problem };

  await consumeInvite(token, invite.userId, await hashPassword(password));
  await prisma.user.update({ where: { id: invite.userId }, data: { name } });

  const userAgent = (await headers()).get("user-agent") ?? undefined;
  await createSession(invite.userId, userAgent);

  redirect("/app/dashboard");
}
