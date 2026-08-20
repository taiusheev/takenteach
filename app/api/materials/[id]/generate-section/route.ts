import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBestExemplar, getKitForMaterial, listAllSubmissions, listMaterials, listRounds, logActivity, logEditCorrection, snapshotAndUpdate } from "@/lib/db";
import { computeTeachingSignal, signalForPrompt } from "@/lib/teaching-signal";
import { classifyInstruction } from "@/lib/correction-tags";
import { RegenSection, regenerateSection, describeAiError } from "@/lib/ai";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { runChecklistFor } from "@/lib/checklist";
import { loadEditableMaterial } from "@/lib/api/guards";
import { metered } from "@/lib/api/metered";
import { badRequest, readBody, serverError } from "@/lib/api/request";

export const dynamic = "force-dynamic";
/**
 * 300, not 600, because 300 is the ceiling — and it is a HARD one.
 *
 * Vercel refuses the whole deployment over this rather than clamping it:
 * "Serverless Functions must have a maxDuration between 1 and 300 for plan
 * hobby". So an over-large value here is not an optimistic request for more
 * time, it is a build failure for every route in the project.
 *
 * This rewrites one section of one pack — a single model call, comfortably
 * inside 300s even for the teacher guide. The long-running case is a whole
 * build, and that is the one that had to be restructured: see the note on legs
 * in ../generate/route.ts.
 */
export const maxDuration = 300;

const bodySchema = z.object({
  // An unrecognised section used to be passed straight through to the model,
  // which then rewrote whatever it felt like and overwrote the pack with the
  // result. The set of rewritable sections is closed, so say so here.
  section: z.enum(["vocabulary", "evidence", "teacher-guide", "activity"], {
    message: "pick a section to rewrite",
  }),
  activityIndex: z.number().int().min(0).default(0),
  // Bounded, but generously: this is steering prose a coach types, and the QA
  // panel posts model-written instructions of its own here too.
  instruction: z.string().trim().max(4000).default(""),
});

/** Regenerate one section of a draft pack with AI, with an optional steering instruction. */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/generate-section">
) {
  const gate = await loadEditableMaterial(ctx, {
    refusal: "Only draft packs can be regenerated, by builders.",
  });
  if (!gate.ok) return gate.response;
  const scope = gate.session.scope;
  const { material, role } = gate;

  if (material.type !== "lesson-pack") {
    return badRequest(
      "Section rewrites are a Lesson Pack feature — regenerate this material from its Quick Build page instead."
    );
  }

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const content = material.content as LessonPack;

  // An index past the end used to reach the model, which dutifully invented a
  // page that didn't exist and appended it — a rewrite that silently became an
  // insert. The pack decides how many pages it has.
  if (body.section === "activity") {
    const pages = content.activities?.length ?? 0;
    if (body.activityIndex >= pages) {
      return badRequest(
        pages === 0
          ? "This pack has no pages to rewrite yet — build it first."
          : `There is no page ${body.activityIndex + 1} — this pack has ${pages}.`
      );
    }
  }

  const section: RegenSection =
    body.section === "activity" ? { activityIndex: body.activityIndex } : body.section;

  /**
   * THE GROUNDING EXEMPLAR IS FOR WRITING, NOT FOR EDITING.
   *
   * It is a whole approved pack serialised into the system prompt — measured at
   * roughly 11k tokens, and by far the largest thing any request here sends.
   * Its job is to set a quality bar for prose being written from nothing: match
   * this density, this texture, this rigor.
   *
   * A targeted edit is not that. "Simplify this page", "make the answers more
   * specific", "cut the repetition" all act on a page that already exists and
   * already met the bar when it was built — the instruction is the whole
   * specification, and the exemplar contributes nothing an editor could use.
   *
   * It is also the most expensive place to send it. A build amortises the
   * exemplar across a dozen calls that share one cached prefix; a section
   * rewrite is a single call in a fresh process, so it pays a full cache WRITE
   * at 2x and reads it back never. That is ~24k billed input tokens for context
   * the model will not act on — and these actions are now one click each in the
   * editor, so a teacher polishing a lesson fires them dozens of times.
   *
   * So: a rebuild from scratch (no instruction) still gets the exemplar,
   * because that IS writing. Everything the AI menu sends — improve, simplify,
   * expand, shorten, a custom note — does not.
   */
  const isTargetedEdit = body.instruction.trim().length > 0;
  const exemplar = isTargetedEdit
    ? null
    : (await getBestExemplar(
        scope,
        material.subject,
        {
          skillFocus: content.skillFocus,
          format: content.format,
          gradeBand: content.gradeBand,
          rigorLevel: content.rigorLevel,
        },
        material.id
      ))?.content ?? null;
  /* Gathered BEFORE the meter starts. These are three database queries, not
     model calls — inside the metered block they would inflate the recorded
     latency of the AI operation with time no model spent. */
  const classroomEvidence = signalForPrompt(
    computeTeachingSignal(
      await listRounds(scope),
      await listAllSubmissions(scope),
      await listMaterials(scope)
    ),
    content.skillFocus ?? ""
  );
  try {
    const pack = await metered(
      { scope, materialId: material.id, operation: `section:${body.section}` },
      () =>
        regenerateSection(
          material.subject,
          material.content as LessonPack,
          section,
          body.instruction,
          classroomEvidence,
          exemplar
        )
    );
    // snapshot the state this call is about to overwrite
    await snapshotAndUpdate(material.id, "section regenerated", role, material.title, pack);
    await logActivity(
      material.id,
      role,
      "regenerate-section",
      `${body.section}${body.section === "activity" ? ` #${body.activityIndex + 1}` : ""}${body.instruction ? ` — "${body.instruction}"` : ""}`
    );
    // A steered rewrite is a correction — capture it (auto-tagged) so recurring
    // fixes become a measurable pattern the builder can learn from over time.
    if (body.instruction) {
      await logEditCorrection(scope, {
        materialId: material.id,
        role,
        subject: material.subject,
        type: material.type,
        tags: classifyInstruction(body.instruction),
        note: `[${body.section}] ${body.instruction}`,
      });
    }
    return NextResponse.json({
      ok: true,
      pack,
      checklist: runChecklistFor(
        material.type,
        pack,
        material.subject,
        (await getKitForMaterial(scope, material.style_kit_id))?.config
      ),
    });
  } catch (err) {
    return serverError(describeAiError(err, "Regeneration failed"));
  }
}
