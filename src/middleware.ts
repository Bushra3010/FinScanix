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
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasCookie = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname.startsWith("/app") && !hasCookie) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (hasCookie && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/app/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/login", "/register"],
};
