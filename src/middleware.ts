import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/**
 * Cheap edge-level routing only.
 *
 * Middleware runs on the Edge runtime, where Prisma is unavailable, so this can
 * do no more than check that a session cookie exists. The real check — that the
 * session is valid, unexpired and belongs to an active user — happens in the
 * /app layout via requireUser(). Treat this as a redirect optimisation, never
 * as the security boundary.
 *
 * It deliberately does NOT bounce /login to the app when a cookie is present.
 * A cookie outlives its session row (expiry, revocation, a reseeded database),
 * and this layer cannot tell a live cookie from a dead one. Sending anyone
 * holding a cookie to /app produced an infinite loop: /app rejected the dead
 * session and redirected to /login, which bounced straight back. That decision
 * belongs to the login page, which can actually resolve the session.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/app") && !hasCookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*"],
};
