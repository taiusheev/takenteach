import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getBestExemplar, getKitForMaterial, listAllSubmissions, listMaterials, listRounds, logActivity, logEditCorrection, snapshotAndUpdate } from "@/lib/db";
import { computeTeachingSignal, signalForPrompt } from "@/lib/teaching-signal";
import { classifyInstruction } from "@/lib/correction-tags";
import { RegenSection, regenerateSection, describeAiError } from "@/lib/ai";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { runChecklistFor } from "@/lib/checklist";
import { loadEditableMaterial } from "@/lib/api/guards";
import { badRequest, readBody, serverError } from "@/lib/api/request";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

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
  const exemplar =
    getBestExemplar(scope, 
      material.subject,
      {
        skillFocus: content.skillFocus,
        format: content.format,
        gradeBand: content.gradeBand,
        rigorLevel: content.rigorLevel,
      },
      material.id
    )?.content ?? null;
  try {
    const pack = await regenerateSection(
      material.subject,
      material.content as LessonPack,
      section,
      body.instruction,
      signalForPrompt(
        computeTeachingSignal(listRounds(scope), listAllSubmissions(scope), listMaterials(scope)),
        (material.content as LessonPack).skillFocus ?? ""
      ),
      exemplar
    );
    // snapshot the state this call is about to overwrite
    snapshotAndUpdate(material.id, "section regenerated", role, material.title, pack);
    logActivity(
      material.id,
      role,
      "regenerate-section",
      `${body.section}${body.section === "activity" ? ` #${body.activityIndex + 1}` : ""}${body.instruction ? ` — "${body.instruction}"` : ""}`
    );
    // A steered rewrite is a correction — capture it (auto-tagged) so recurring
    // fixes become a measurable pattern the builder can learn from over time.
    if (body.instruction) {
      logEditCorrection(scope, {
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
        getKitForMaterial(scope, material.style_kit_id)?.config
      ),
    });
  } catch (err) {
    return serverError(describeAiError(err, "Regeneration failed"));
  }
}
