"use server";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/client";
import { sendPasswordResetEmail } from "@/lib/email";
import { hashPassword, validatePassword } from "./password";

const RESET_TTL_HOURS = 1;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export interface ResetState {
  error?: string;
  success?: boolean;
  devLink?: string;
}

/**
 * Forgot-password form action.
 *
 * Always responds with "success" whether the email exists or not — this
 * prevents account enumeration (an attacker cannot tell which emails are
 * registered by watching for different responses).
 */
export async function forgotPasswordAction(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  // Look up user — but don't reveal whether they exist.
  const user = await prisma.user.findUnique({ where: { email } });

  if (user && user.status !== "suspended") {
    // Invalidate any existing unused tokens for this user before creating a new one.
    await prisma.passwordResetToken.deleteMany({
      where: { userId: user.id, usedAt: null },
    });

    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + RESET_TTL_HOURS * 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });

    const result = await sendPasswordResetEmail(user.email, user.name, token);

    // Dev-only: surface the link in the UI so you can test without email.
    if (result.devLink) {
      return { success: true, devLink: result.devLink };
    }
  }

  return { success: true };
}

/**
 * Resolves a raw reset token to its user.
 * Returns null if expired, already used, or simply not found.
 */
export async function resolveResetToken(token: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });

  if (!record) return null;
  if (record.usedAt) return null;
  if (record.expiresAt <= new Date()) return null;

  return record;
}

/**
 * Reset-password form action.
 * Validates the token, hashes the new password, and marks the token used.
 */
export async function resetPasswordAction(
  token: string,
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const password = (formData.get("password") as string | null) ?? "";
  const confirm = (formData.get("confirm") as string | null) ?? "";

  if (password !== confirm) return { error: "Passwords do not match." };

  const err = validatePassword(password);
  if (err) return { error: err };

  const record = await resolveResetToken(token);
  if (!record) {
    return {
      error:
        "This reset link is invalid or has expired. Request a new one from the forgot-password page.",
    };
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: record.userId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    }),
    // Sign out all existing sessions so old devices must re-authenticate.
    prisma.session.deleteMany({ where: { userId: record.userId } }),
  ]);

  redirect("/login?reset=success");
}
