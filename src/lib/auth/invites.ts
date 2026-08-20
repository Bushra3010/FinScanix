import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/client";

/**
 * One-time invitation links — SoW section 2, user management.
 *
 * No email provider is connected to this deployment, and an invitation nobody
 * can act on is not an invitation. So the link is issued to the admin who sent
 * it, to pass on however they already talk to the person. When email is wired
 * up later it delivers this same link; nothing else has to change.
 *
 * The token follows the session rules: 32 random bytes, only its SHA-256 stored,
 * single use, and short-lived. A database leak therefore cannot be turned into
 * an account claim.
 */

export const INVITE_TTL_HOURS = 72;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function issueInvite(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60_000);

  // Any earlier link for this person stops working the moment a new one is
  // issued, so a forwarded old link cannot be used behind their back.
  await prisma.inviteToken.deleteMany({ where: { userId, usedAt: null } });
  await prisma.inviteToken.create({ data: { userId, tokenHash: hashToken(token), expiresAt } });

  return { token, expiresAt };
}

export interface InviteHolder {
  userId: string;
  name: string;
  email: string;
  organisationName: string;
}

/** Resolves a token to the person it belongs to, or null if it cannot be used. */
export async function resolveInvite(token: string): Promise<InviteHolder | null> {
  if (!token) return null;

  const record = await prisma.inviteToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: { include: { organisation: { select: { name: true } } } } },
  });

  if (!record) return null;
  if (record.usedAt !== null) return null;
  if (record.expiresAt.getTime() <= Date.now()) return null;
  // An invitation to an account that has since been suspended is not an
  // invitation either.
  if (record.user.status === "suspended") return null;

  return {
    userId: record.user.id,
    name: record.user.name,
    email: record.user.email,
    organisationName: record.user.organisation.name,
  };
}

/**
 * Marks the token spent and the member active, in one transaction with the
 * password write so a half-applied invitation cannot leave an account that is
 * active but unclaimable.
 */
export function consumeInvite(token: string, userId: string, passwordHash: string) {
  return prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { passwordHash, status: "active" },
    }),
    prisma.inviteToken.updateMany({
      where: { tokenHash: hashToken(token), usedAt: null },
      data: { usedAt: new Date() },
    }),
  ]);
}
