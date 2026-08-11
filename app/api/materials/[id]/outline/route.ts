import { NextResponse, type NextRequest } from "next/server";
import { getBestExemplar, listAllSubmissions, listMaterials, listRounds, listSeriesSiblings, logActivity, snapshotAndUpdate } from "@/lib/db";
import { computeTeachingSignal, signalForPrompt } from "@/lib/teaching-signal";
import { planOutline, describeAiError } from "@/lib/ai";
import { LessonPack, lessonPackSchema } from "@/lib/lesson-pack-schema";
import { loadEditableMaterial } from "@/lib/api/guards";
import { serverError } from "@/lib/api/request";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Plan just the page-by-page outline (the "steer the outline" step). Saves it as
 * the pack's outlinePlan + cover subtitle/emoji so the author can review and
 * edit before committing to the full build, and returns it for the editor.
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/outline">
) {
  const gate = await loadEditableMaterial(ctx, {
    refusal: "Only draft packs can be planned, by builders.",
    packOnly: "Outline planning",
  });
  if (!gate.ok) return gate.response;
  const scope = gate.session.scope;
  const { material, role } = gate;

  const content = material.content as LessonPack;
  const siblings = await listSeriesSiblings(scope, 
    material.subject,
    content.series ?? "",
    material.id
  );
  const evidence = signalForPrompt(
    computeTeachingSignal(await listRounds(scope), await listAllSubmissions(scope), await listMaterials(scope)),
    content.skillFocus ?? ""
  );
  const exemplar =
    (await getBestExemplar(scope, 
      material.subject,
      {
        skillFocus: content.skillFocus,
        format: content.format,
        gradeBand: content.gradeBand,
        rigorLevel: content.rigorLevel,
      },
      material.id
    ))?.content ?? null;

  try {
    const outline = await planOutline(material.subject, content, {
      siblings,
      classroomEvidence: evidence,
      exemplar,
    });
    // Persist the plan (+ cover subtitle/emoji) so a refresh keeps it.
    const next = lessonPackSchema.parse({
      ...content,
      title: content.title || outline.coverTitle,
      subtitle: content.subtitle || outline.subtitle,
      emoji: outline.emoji || content.emoji,
      outlinePlan: outline.activities.map((a) => ({
        kind: a.kind,
        title: a.title,
        badge: a.badge,
        durationMin: a.durationMin,
        goal: a.goal,
      })),
    });
    // snapshot the state this call is about to overwrite
    await snapshotAndUpdate(material.id, "outline replanned", role, material.title, next);
    await logActivity(material.id, role, "plan-outline", `${outline.activities.length} pages`);
    return NextResponse.json({ pack: next, outline });
  } catch (err) {
    return serverError(describeAiError(err, "Outline planning failed"));
  }
}
