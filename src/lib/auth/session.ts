import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/db/client";
import type { Role, SessionUser, Subscription, TierId } from "@/lib/types";
import { SESSION_COOKIE, SESSION_TTL_DAYS } from "./constants";

export type { SessionUser };
export { SESSION_COOKIE };

/**
 * Session handling.
 *
 * The cookie carries a random opaque token; only its SHA-256 is stored, so a
 * database leak cannot be replayed as a live session. Sessions are server-side
 * records, which means sign-out and forced revocation actually work — unlike a
 * self-contained JWT.
 */

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Issues a session and sets the cookie. Only callable from a server action. */
export async function createSession(userId: string, userAgent?: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      userAgent: userAgent?.slice(0, 255),
    },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });

  return { token, expiresAt };
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;

  if (token) {
    // deleteMany rather than delete: a stale cookie must not throw on sign-out.
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  store.delete(SESSION_COOKIE);
}

/**
 * Resolves the signed-in user for this request.
 *
 * Wrapped in React's cache so several server components on one page share a
 * single query rather than each issuing their own.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  // Check validity and expire atomically so a stolen-but-expired cookie
  // cannot be used by a concurrent request between the check and the cleanup.
  const deleted = await prisma.session.deleteMany({
    where: { tokenHash: hashToken(token), expiresAt: { lte: new Date() } },
  });
  if (deleted.count > 0) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        include: {
          organisation: { include: { subscription: true } },
        },
      },
    },
  });

  if (!session) return null;

  const { user } = session;
  // A suspended account keeps its rows but loses access immediately.
  if (user.status === "suspended") return null;

  const sub = user.organisation.subscription;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role as Role,
    status: user.status as SessionUser["status"],
    organisation: {
      id: user.organisation.id,
      name: user.organisation.name,
      gstin: user.organisation.gstin,
      defaultCityId: user.organisation.defaultCityId,
      subscription: {
        tierId: (sub?.tierId ?? "starter") as TierId,
        status: (sub?.status ?? "cancelled") as Subscription["status"],
        billingCycle: (sub?.billingCycle ?? "monthly") as Subscription["billingCycle"],
        renewsOn: (sub?.renewsOn ?? new Date()).toISOString(),
        documentsUsed: sub?.documentsUsed ?? 0,
        seatsUsed: sub?.seatsUsed ?? 0,
      },
    },
  };
});

/** Housekeeping: drop expired rows. Called opportunistically on sign-in. */
export async function pruneExpiredSessions() {
  await prisma.session.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}
