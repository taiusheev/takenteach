import { NextResponse, type NextRequest } from "next/server";
import { logActivity, updateMaterialContent } from "@/lib/db";
import { reviewPackContent, describeAiError } from "@/lib/ai";
import { LessonPack, lessonPackSchema, packContentHash } from "@/lib/lesson-pack-schema";
import { loadEditableMaterial } from "@/lib/api/guards";
import { metered, checkSpend, ESTIMATE_USD } from "@/lib/api/metered";
import { captureQaScope } from "@/lib/qa-scope";
import { badRequest, serverError } from "@/lib/api/request";

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
  const { material, role, session } = gate;
  const { scope } = session;


  /* The organization-level ceiling — see checkSpend in lib/api/metered.ts.
     Before the call, not inside it: a refusal raised from within the metered
     block would arrive as a 500 after the model had already been paid. */
  const spend = await checkSpend(scope, ESTIMATE_USD.qa);
  if (!spend.allow) return badRequest(spend.reason);
  const content = material.content as LessonPack;
  try {
    const report = await metered(
      { scope, materialId: material.id, operation: "qa" },
      () => reviewPackContent(material.subject, content)
    );
    const next = lessonPackSchema.parse({
      ...content,
      // stamp the report with the content fingerprint it describes, so the
      // review gate can detect when a later edit made this QA stale
      contentQaJson: JSON.stringify({
        ...report,
        contentHash: packContentHash(content),
        /* Per-page fingerprints, so a later edit can be reported as "pages 4
           and 8 are unreviewed" rather than only "this report is stale" —
           which left re-reading all thirteen as the only way to find out. */
        scope: captureQaScope(content),
      }),
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
