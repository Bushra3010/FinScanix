import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Clears a session cookie that no longer resolves.
 *
 * A cookie outlives its session row whenever the session expires, is revoked by
 * an admin, or the database is reseeded. Rendering cannot delete a cookie in
 * Next — only a Route Handler or Server Action can — so a page that finds a
 * dead cookie sends the browser here to have it removed.
 *
 * A cookie that IS still valid is left untouched and the caller is sent back to
 * the app. That is deliberate: it makes this endpoint useless as a cross-site
 * sign-out, since a forged GET cannot end a live session.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getSessionUser();

  if (user) {
    return NextResponse.redirect(new URL("/app/dashboard", request.url));
  }

  const response = NextResponse.redirect(new URL("/login?expired=1", request.url));
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
