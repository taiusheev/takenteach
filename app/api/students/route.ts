import { NextRequest, NextResponse } from "next/server";
import { createStudent, listStudents, setStudentArchived } from "@/lib/db";
import { requireBuilder } from "@/lib/api/guards";
import { requireApiSession } from "@/lib/auth/dal";
import { readBody } from "@/lib/api/request";
import { z } from "zod";

import { SUBJECTS } from "@/lib/subjects";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1, "a student needs a name").max(120),
  cohort: z.string().trim().max(120).default(""),
  subject: z.enum(SUBJECTS).catch("debate"),
  gradeBand: z.string().trim().max(60).default(""),
  note: z.string().trim().max(2000).default(""),
});

const archiveSchema = z.object({
  id: z.number().int().positive({ message: "no student" }),
  archived: z.boolean().default(true),
});

export async function GET() {
  const auth = await requireApiSession();
  if (!auth.ok) return auth.response;
  return NextResponse.json({ students: await listStudents(auth.session.scope) });
}

export async function POST(req: NextRequest) {
  const builder = await requireBuilder(
    "TAs and judges give feedback; they don't manage the roster."
  );
  if (!builder.ok) return builder.response;
  const scope = builder.session.scope;

  const parsed = await readBody(req, createSchema);
  if (!parsed.ok) return parsed.response;
  const id = await createStudent(scope, parsed.data);
  return NextResponse.json({ id });
}

/** Archive rather than delete — the observation log is the record of teaching. */
export async function PATCH(req: NextRequest) {
  const builder = await requireBuilder(
    "TAs and judges give feedback; they don't manage the roster."
  );
  if (!builder.ok) return builder.response;
  const { scope } = builder.session;

  const parsed = await readBody(req, archiveSchema);
  if (!parsed.ok) return parsed.response;
  const { id, archived } = parsed.data;
  await setStudentArchived(scope, id, archived !== false);
  return NextResponse.json({ ok: true });
}
