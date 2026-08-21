import { Resend } from "resend";

/**
 * Email delivery via Resend.
 *
 * Set RESEND_API_KEY in your environment. If the key is absent, emails are
 * logged to the console instead of sent — useful in development where you
 * can copy the reset link from the terminal.
 *
 * Get a free key at https://resend.com — the free tier allows 3,000 emails/month.
 */

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "FinScanix <noreply@finscanix.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://finscanix-production.up.railway.app";

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  return new Resend(key);
}

export interface EmailResult {
  ok: boolean;
  devLink?: string; // populated when no API key — for dev use only
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  token: string,
): Promise<EmailResult> {
  const resetUrl = `${APP_URL}/reset-password/${token}`;
  const resend = getResend();

  if (!resend) {
    // Dev fallback: print to console so you can test without an email key.
    console.log(`\n[DEV] Password reset link for ${to}:\n${resetUrl}\n`);
    return { ok: true, devLink: resetUrl };
  }

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reset your FinScanix password</title>
</head>
<body style="margin:0;padding:0;background:#f2fbfc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f2fbfc;padding:40px 0">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;border:1px solid #ccedf2;overflow:hidden">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#14b8a6,#06b6d4);padding:28px 36px">
              <p style="margin:0;color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px">FinScanix</p>
              <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:13px">AI-powered invoice verification</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:36px">
              <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#0d2026">Reset your password</p>
              <p style="margin:0 0 24px;font-size:14px;color:#4a7080;line-height:1.6">
                Hi ${name}, we received a request to reset your FinScanix password. Click the button below to choose a new one.
              </p>
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:linear-gradient(135deg,#14b8a6,#06b6d4);border-radius:8px">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 28px;color:#fff;font-size:14px;font-weight:600;text-decoration:none;letter-spacing:-0.1px">
                      Reset password →
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:12px;color:#7ab8c8;line-height:1.6">
                This link expires in <strong>1 hour</strong>. If you didn't request a reset, you can safely ignore this email — your password won't change.
              </p>
              <hr style="margin:24px 0;border:none;border-top:1px solid #ccedf2">
              <p style="margin:0;font-size:11px;color:#a0c0cc">
                Can't click the button? Copy this link:<br>
                <a href="${resetUrl}" style="color:#06b6d4;word-break:break-all">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f2fbfc;padding:16px 36px;border-top:1px solid #ccedf2">
              <p style="margin:0;font-size:11px;color:#7ab8c8">
                © ${new Date().getFullYear()} FinScanix. You're receiving this because a password reset was requested for your account.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: "Reset your FinScanix password",
      html,
    });

    if (error) {
      console.error("[email] Resend error:", error);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("[email] Send failed:", err);
    return { ok: false };
  }
}
