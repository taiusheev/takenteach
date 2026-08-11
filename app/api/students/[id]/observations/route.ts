import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getStudent, listObservations, logObservation } from "@/lib/db";
import { requireApiSession } from "@/lib/auth/dal";
import { SKILL_IDS } from "@/lib/students";
import { notFound, readBody, routeId } from "@/lib/api/request";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  skill: z.enum(SKILL_IDS, { message: "unknown skill" }),
  // The whole scale, and only the scale. A rating is what the progress chart
  // and the squad signal are computed from, so an out-of-range one doesn't
  // render oddly — it moves a student's trend line for a term.
  rating: z.number().int().min(1).max(5, "rating must be 1–5"),
  note: z.string().trim().max(2000).default(""),
  context: z.string().trim().max(200).default(""),
  observedOn: z.string().trim().max(40).default(""),
});

export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/students/[id]/observations">
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { scope } = auth.session;

  const { id } = await ctx.params;
  const studentId = routeId(id);
  // An unparseable id used to reach the query as NaN and come back as an empty
  // list, so a typo'd URL looked exactly like a student with nothing logged yet.
  if (studentId === null) return notFound("No such student.");
  // A student in another organization is "no such student" for the same reason
  // a material in one 404s: the alternative confirms the row exists.
  if (!await getStudent(scope, studentId)) return notFound("No such student.");

  return NextResponse.json({ observations: await listObservations(scope, studentId) });
}

/**
 * Log what a coach just saw. Judges and TAs CAN post here — watching students
 * and saying what they saw is exactly their job, even though they can't build
 * materials.
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/students/[id]/observations">
) {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  const { scope, legacyRole: role } = auth.session;

  const { id } = await ctx.params;
  const studentId = routeId(id);
  if (studentId === null) return notFound("No such student.");
  const student = await getStudent(scope, studentId);
  if (!student) return notFound("No such student.");
  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const observationId = await logObservation({
    studentId: student.id,
    skill: body.skill,
    rating: body.rating,
    note: body.note,
    context: body.context,
    // default to today so the common case is zero extra input
    observedOn: body.observedOn || new Date().toISOString().slice(0, 10),
    role,
  });
  return NextResponse.json({ id: observationId });
}
