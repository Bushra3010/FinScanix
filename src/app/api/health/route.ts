/**
 * Lightweight health check endpoint used by Railway's deployment healthcheck.
 *
 * Returns 200 with a minimal JSON body. No database calls, no auth, no imports
 * from application code — intentionally inert so the check passes the instant
 * the Next.js server is ready, regardless of downstream service availability.
 */
export function GET() {
  return Response.json({ ok: true });
}
