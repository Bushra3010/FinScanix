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

/**
 * Redirects to a path, not an absolute URL.
 *
 * Behind a proxy — Railway's included — `request.url` inside a Route Handler is
 * the internal origin the container was addressed on, so building an absolute
 * URL from it sends the browser to localhost. A relative Location is resolved
 * by the browser against the address it actually used, which is always right.
 */
function redirectTo(path: string) {
  return new NextResponse(null, { status: 303, headers: { Location: path } });
}

export async function GET() {
  if (await getSessionUser()) return redirectTo("/app/dashboard");

  const response = redirectTo("/login?expired=1");
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
