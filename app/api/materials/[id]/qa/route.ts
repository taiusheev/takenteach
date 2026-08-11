import { NextResponse, type NextRequest } from "next/server";
import { logActivity, updateMaterialContent } from "@/lib/db";
import { reviewPackContent, describeAiError } from "@/lib/ai";
import { LessonPack, lessonPackSchema, packContentHash } from "@/lib/lesson-pack-schema";
import { loadEditableMaterial } from "@/lib/api/guards";
import { serverError } from "@/lib/api/request";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Content QA: fact-check the citations and pedagogically review every activity,
 * then store the report on the pack so the author must clear it before review.
 * This is the judgement the deterministic checklist can't make.
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/qa">
) {
  const gate = await loadEditableMaterial(ctx, {
    refusal: "Only draft packs can be QA'd, by builders.",
    packOnly: "Content QA",
  });
  if (!gate.ok) return gate.response;
  const { material, role } = gate;

  const content = material.content as LessonPack;
  try {
    const report = await reviewPackContent(material.subject, content);
    const next = lessonPackSchema.parse({
      ...content,
      // stamp the report with the content fingerprint it describes, so the
      // review gate can detect when a later edit made this QA stale
      contentQaJson: JSON.stringify({ ...report, contentHash: packContentHash(content) }),
      contentQaAt: new Date().toISOString(),
    });
    await updateMaterialContent(material.id, material.title, next);
    await logActivity(
      material.id,
      role,
      "content-qa",
      `${report.overallGrade} · ${report.readyForReview ? "ready" : "needs work"}`
    );
    return NextResponse.json({ report });
  } catch (err) {
    return serverError(describeAiError(err, "Content QA failed"));
  }
}
