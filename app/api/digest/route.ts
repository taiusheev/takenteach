import { NextRequest, NextResponse } from "next/server";
import {
  listAllObservations,
  listMaterials,
  listStudents,
  listTaught,
} from "@/lib/db";
import { requireApiSession } from "@/lib/auth/dal";
import { badRequest } from "@/lib/api/request";
import { daysAgo, weeklyDigest } from "@/lib/weekly-digest";

export const dynamic = "force-dynamic";

/**
 * The week, from the records of it — see lib/weekly-digest.ts.
 *
 * ── WHY THE WINDOW IS A QUERY PARAMETER AND NOT A FIXED WEEK ─────────────
 * A coach who opens this on a Wednesday wants the last seven days, not
 * "since Monday", and one coming back from a half-term wants a fortnight.
 * The aggregation takes the window explicitly and this route just supplies
 * it, so neither has to know what day it is when the other runs.
 *
 * ── THE READS ARE WIDER THAN THE WINDOW, DELIBERATELY ────────────────────
 * `listTaught` is not filtered by date here. The digest needs the FULL log to
 * decide which finished lessons have never been taught — a lesson taught two
 * months ago is not "waiting", and a query bounded to this week could not tell
 * the difference. The window is applied inside the aggregation, once, where it
 * can be tested.
 */
const MAX_DAYS = 90;

export async function GET(req: NextRequest) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { scope } = auth.session;

  const raw = req.nextUrl.searchParams.get("days");
  const days = raw === null ? 7 : Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return badRequest(`"days" must be a whole number between 1 and ${MAX_DAYS}.`);
  }

  const today = new Date().toISOString().slice(0, 10);
  /* One query each, all already org-scoped. `listTaught` additionally scopes
     to this user — a digest is one person's week, and blending two coaches
     who share a library would describe nobody's. */
  const [taught, materials, students, observations] = await Promise.all([
    listTaught(scope),
    listMaterials(scope),
    listStudents(scope),
    listAllObservations(scope),
  ]);

  return NextResponse.json({
    digest: weeklyDigest({ today, days, taught, materials, students, observations }),
    since: daysAgo(today, days),
  });
}
