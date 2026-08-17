import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runDueJobs } from "@/lib/jobs/run";

/**
 * The tick an external scheduler calls — FR-9.2.
 *
 * Next.js has no in-process scheduler, and running one inside a web dyno would
 * fire once per instance. So the schedule lives outside: a platform cron (or
 * any timer) calls this endpoint, and it runs whatever is due.
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron
 *
 * Called every 15 minutes, a job fires within 15 minutes of its cron time.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";

  const a = Buffer.from(presented);
  const b = Buffer.from(secret);
  // Compare lengths separately; timingSafeEqual throws on a mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    // Better to fail loudly than to leave an unauthenticated endpoint that
    // triggers paid third-party calls.
    return NextResponse.json(
      { error: "CRON_SECRET is not set on this deployment; the scheduler is disabled." },
      { status: 503 },
    );
  }

  if (!authorised(request)) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  const startedAt = new Date();
  const results = await runDueJobs(startedAt);

  return NextResponse.json({
    ranAt: startedAt.toISOString(),
    jobsRun: results.length,
    elapsedMs: Date.now() - startedAt.getTime(),
    results: results.map((entry) => ({
      job: entry.job,
      status: entry.result.status,
      itemsRefreshed: entry.result.itemsRefreshed,
      detail: entry.result.detail,
    })),
  });
}
