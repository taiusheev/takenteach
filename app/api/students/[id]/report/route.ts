import { NextRequest, NextResponse } from "next/server";
import {
  getStudent,
  listAllSubmissions,
  listObservations,
  listRounds,
} from "@/lib/db";
import { requireApiSession } from "@/lib/auth/dal";
import { badRequest, notFound, routeId } from "@/lib/api/request";
import { studentReport } from "@/lib/student-report";
import { daysAgo } from "@/lib/weekly-digest";

export const dynamic = "force-dynamic";

/**
 * One student's period, with the evidence attached — see lib/student-report.ts.
 *
 * ── THE OBSERVATION READ IS NOT WINDOWED, AND MUST NOT BE ────────────────
 * `listObservations` returns the student's WHOLE log. That is not an oversight
 * to optimise away later: the report measures movement against what the coach
 * believed BEFORE the period began, so the rows older than the window are the
 * baseline. Filtering them out in SQL would make every skill look newly
 * observed and every student look static.
 */
const MAX_DAYS = 365;

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/students/[id]/report">
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { scope } = auth.session;

  const { id } = await ctx.params;
  const studentId = routeId(id);
  if (studentId === null) return notFound("No such student.");
  const student = await getStudent(scope, studentId);
  // A student in another organization is "no such student", for the same
  // reason a material in one 404s: the alternative confirms the row exists.
  if (!student) return notFound("No such student.");

  const raw = req.nextUrl.searchParams.get("days");
  const days = raw === null ? 30 : Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    return badRequest(`"days" must be a whole number between 1 and ${MAX_DAYS}.`);
  }

  const today = new Date().toISOString().slice(0, 10);
  const [observations, rounds, submissions] = await Promise.all([
    listObservations(scope, studentId),
    listRounds(scope),
    listAllSubmissions(scope),
  ]);

  return NextResponse.json({
    student: { id: student.id, name: student.name, cohort: student.cohort },
    report: studentReport({
      from: daysAgo(today, days),
      to: today,
      observations,
      studentId,
      rounds,
      submissions,
    }),
  });
}
