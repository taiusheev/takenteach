import { NextRequest, NextResponse } from "next/server";
import { planLesson, describeAiError } from "@/lib/ai";
import { type Scope, listSeriesSiblings } from "@/lib/db";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { Subject } from "@/lib/subjects";
import { requireBuilder } from "@/lib/api/guards";
import { readBody, serverError } from "@/lib/api/request";
import { getUser } from "@/lib/auth/store";
import { parsePreferences } from "@/lib/auth/preferences";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const bodySchema = z.object({
  // Capped: this string is the whole prompt for a paid model call, and an
  // unbounded one is both a cost and a prompt-injection surface.
  idea: z
    .string()
    .trim()
    .min(1, "say what you want to teach in a sentence")
    .max(2000, "keep the idea under 2000 characters"),
  /** Whatever the teacher already typed into "Add teaching detail" this time. */
  known: z
    .object({
      priorKnowledge: z.string().max(2000).optional(),
      misconceptions: z.string().max(2000).optional(),
      constraints: z.string().max(2000).optional(),
    })
    .optional(),
});

/**
 * Suggest the next free lesson code in a series. The planner often knows the
 * series but leaves the code blank (a required-feeling field the author then has
 * to fill by hand). We read the codes already used and propose max+1 with the
 * same prefix — e.g. a series holding L1, L4 → "L5".
 */
async function nextLessonCode(
  scope: Scope,
  subject: Subject,
  series: string
): Promise<string> {
  if (!series.trim()) return "";
  const codes = (await listSeriesSiblings(scope, subject, series, -1))
    .map((m) => ((m.content as LessonPack).lessonCode || "").trim())
    .filter(Boolean);
  let prefix = "L";
  let max = 0;
  for (const code of codes) {
    const m = code.match(/^([A-Za-z]+)\s*0*(\d+)$/);
    if (!m) continue;
    prefix = m[1];
    max = Math.max(max, Number(m[2]));
  }
  return `${prefix}${max + 1}`;
}

/** Infer a complete lesson setup from a one-line idea. */
export async function POST(req: NextRequest) {
  const builder = await requireBuilder();
  if (!builder.ok) return builder.response;
  const scope = builder.session.scope;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { idea, known } = parsed.data;
  try {
    // What's typed into this build's fields wins; a saved class default only
    // fills in what wasn't. Both exist so the planner never asks about
    // something the teacher already told it, either just now or on file.
    const prefs = parsePreferences(
      (await getUser(builder.session.userId))?.preferences
    );
    const plan = await planLesson(idea, {
      priorKnowledge: known?.priorKnowledge || prefs.defaultPriorKnowledge,
      misconceptions: known?.misconceptions || prefs.defaultMisconceptions,
      constraints: known?.constraints || prefs.defaultConstraints,
    });
    // The planner reliably infers the series but often leaves the code blank —
    // fill it with the next free code so the author isn't asked for it.
    if (!plan.lessonCode?.trim() && plan.series?.trim()) {
      plan.lessonCode = await nextLessonCode(
        scope,
        plan.subject as Subject,
        plan.series
      );
    }
    return NextResponse.json({ plan });
  } catch (err) {
    return serverError(describeAiError(err, "Planning failed"));
  }
}
