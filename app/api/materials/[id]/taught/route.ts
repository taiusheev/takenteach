import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logTaught } from "@/lib/db";
import { loadMaterial } from "@/lib/api/guards";
import { badRequest, readBody } from "@/lib/api/request";
import type { LessonPack } from "@/lib/lesson-pack-schema";

export const dynamic = "force-dynamic";

/**
 * "I taught this."
 *
 * ── WHY THIS IS `loadMaterial` AND NOT `loadEditableMaterial` ────────────
 * Every other write on a material refuses anything that is not a draft,
 * because every other write CHANGES the lesson. This one does not touch it —
 * it records a fact about the teacher's week. And the normal case is teaching
 * a lesson that has been approved and published, which is exactly what the
 * editable guard exists to refuse. Using it here would have meant only
 * unfinished lessons could be marked as taught.
 *
 * TAs and judges are deliberately not excluded either. `requireBuilder` gates
 * MAKING materials; standing in front of a class is not that, and an assistant
 * who ran the session is the person who knows how it went.
 */
const bodySchema = z.object({
  cohort: z.string().trim().max(120).default(""),
  /** "YYYY-MM-DD". Defaults to today, in UTC, matching the column's own default. */
  taughtOn: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
    .optional(),
  /* "" is a real answer here — it means "didn't say", which is different from
     "on time". The digest only counts lessons where the coach actually
     answered, so a silent default of "on" would invent evidence that the
     generator's durations are correct. */
  pacing: z.enum(["behind", "on", "ahead", ""]).default(""),
  /** 1–5, or 0 for "didn't rate it". Same scale as an observation. */
  rating: z.number().int().min(0).max(5).default(0),
  note: z.string().trim().max(2000).default(""),
  /** page titles actually skipped; capped so one request cannot carry a pack */
  skipped: z.array(z.string().trim().max(200)).max(40).default([]),
});

export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/taught">
) {
  const gate = await loadMaterial(ctx);
  if (!gate.ok) return gate.response;
  const { material, session } = gate;

  if (material.type !== "lesson-pack") {
    return badRequest("Only lesson packs can be marked as taught.");
  }

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const today = new Date().toISOString().slice(0, 10);
  const taughtOn = body.taughtOn ?? today;
  /* A future date is refused rather than stored. It is almost always a typo,
     and one bad row silently changes which week every later digest thinks it
     is describing — a wrong answer that looks like a right one. */
  if (taughtOn > today) {
    return badRequest("That date is in the future — a lesson can only be logged after it is taught.");
  }

  const pack = material.content as LessonPack;
  const id = await logTaught(session.scope, {
    materialId: material.id,
    /* Snapshotted at write time, because the material link goes NULL if the
       pack is later deleted and the record has to still name something. */
    lessonTitle: material.title,
    cohort: body.cohort || pack.series || "",
    taughtOn,
    pacing: body.pacing,
    rating: body.rating,
    note: body.note,
    skipped: body.skipped,
  });

  return NextResponse.json({ ok: true, id, taughtOn });
}
