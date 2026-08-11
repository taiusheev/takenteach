import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logActivity, snapshotAndUpdate } from "@/lib/db";
import { reviseLessonPack, describeAiError } from "@/lib/ai";
import { LessonPack } from "@/lib/lesson-pack-schema";
import { loadEditableMaterial } from "@/lib/api/guards";
import { readBody, serverError } from "@/lib/api/request";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({
  instruction: z
    .string()
    .trim()
    .min(1, "say what to change, e.g. “make the exit ticket easier”")
    // A bound so the body can't be unbounded — NOT a style rule about length.
    // Content QA's "Fix one thing" buttons post their own instructions here, and
    // a citation finding arrives as ~230 characters of boilerplate wrapped
    // around a model-written note; a tighter cap would reject the product's own
    // repair path with a validation error the author can do nothing about.
    .max(4000, "that's too long for a targeted revision — say it in a sentence or two"),
});

/**
 * Targeted revision: apply ONE plain-English change to a finished pack, editing
 * only the named unit(s) and leaving the rest untouched — the opposite of a
 * regenerate. e.g. "fix the Page 9 answer key that overstates Card A".
 */
export async function POST(
  req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/revise">
) {
  const gate = await loadEditableMaterial(ctx, {
    refusal: "Only draft packs can be revised, by builders.",
    packOnly: "Targeted revision",
  });
  if (!gate.ok) return gate.response;
  const { material, role } = gate;

  const parsed = await readBody(req, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { instruction } = parsed.data;

  const content = material.content as LessonPack;
  try {
    const result = await reviseLessonPack(material.subject, content, instruction);
    if (!result.applied) {
      // Nothing located/changed — don't overwrite; tell the author why.
      return NextResponse.json(
        { applied: false, summary: result.summary, changed: [] },
        { status: 200 }
      );
    }
    // snapshot the state this call is about to overwrite
    snapshotAndUpdate(material.id, "targeted revision", role, material.title, result.pack);
    logActivity(material.id, role, "revise", result.summary.slice(0, 140));
    return NextResponse.json({
      applied: true,
      summary: result.summary,
      changed: result.changed,
    });
  } catch (err) {
    return serverError(describeAiError(err, "Revision failed"));
  }
}
