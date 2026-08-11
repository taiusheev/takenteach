import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createMaterial, listMaterials, listStyleKits } from "@/lib/db";
import { requireBuilder } from "@/lib/api/guards";
import { badRequest, readBody, serverError } from "@/lib/api/request";
import { contentTypeDef } from "@/lib/content-types";
import { SUBJECTS, Subject } from "@/lib/subjects";
import {
  unitPlanSchema,
  usedAccents,
  ensureDistinctAccent,
  unitKey,
} from "@/lib/unit-plan";
import { RIGOR_LEVELS } from "@/lib/lesson-quality";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({ plan: unitPlanSchema });

/**
 * Batch-create a whole class from an (edited) unit plan: one draft lesson pack
 * per planned lesson, all sharing the unit's anchor and design identity, each
 * carrying its own slot in the sequence. Generation happens afterwards, on the
 * unit page, one lesson at a time.
 */
export async function POST(req: NextRequest) {
  const builder = await requireBuilder();
  if (!builder.ok) return builder.response;
  const scope = builder.session.scope;
  const { role } = builder;

  // The plan is validated field by field rather than caught as one "malformed"
  // — this body is an edited scope-and-sequence, and an author who mistyped one
  // lesson's duration deserves to be told which one.
  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { plan } = parsed.data;

  if (plan.lessons.length === 0) {
    return badRequest("The unit has no lessons.");
  }

  const subject: Subject = SUBJECTS.includes(plan.subject as Subject)
    ? (plan.subject as Subject)
    : "debate";
  const kit = (await listStyleKits(scope)).find((k) => k.is_default === 1);
  if (!kit) {
    return serverError(
      "There is no default Style Kit — every material inherits one, so nothing can be created until a kit is marked default."
    );
  }

  // Re-assert visual distinctness against everything currently in the library,
  // in case the author edited the accent to something too close.
  const accent = ensureDistinctAccent(
    plan.design.accentColor,
    usedAccents(await listMaterials(scope))
  );
  const rigorLevel = (RIGOR_LEVELS as readonly string[]).includes(plan.rigorLevel)
    ? plan.rigorLevel
    : "standard";

  const typeDef = contentTypeDef("lesson-pack");
  const ids: number[] = [];
  for (const lesson of plan.lessons) {
    const content = typeDef.schema.parse({
      ...(typeDef.empty() as object),
      lessonCode: lesson.lessonCode.trim(),
      title: lesson.coverTitle.trim(),
      skillFocus: lesson.skillFocus.trim(),
      series: plan.series.trim(),
      resolution: plan.resolution.trim(),
      durationMin: lesson.durationMin > 0 ? lesson.durationMin : plan.durationMin,
      accentColor: accent,
      emoji: plan.design.coverEmoji || typeDef.emoji,
      gradeBand: plan.gradeBand.trim() || "Grades 6–8",
      rigorLevel,
      format: lesson.format.trim() || "auto",
      designMotif: plan.design.motif.trim(),
    });
    const title = `${lesson.lessonCode ? lesson.lessonCode + " · " : ""}${
      lesson.coverTitle || lesson.skillFocus || "Untitled lesson"
    }`;
    ids.push(
      await createMaterial(scope, title, kit.id, content, role, subject, undefined, "lesson-pack")
    );
  }

  return NextResponse.json({
    subject,
    series: plan.series,
    key: unitKey(subject, plan.series),
    ids,
  });
}
