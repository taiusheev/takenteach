import { NextResponse, type NextRequest } from "next/server";
import { logActivity, snapshotAndUpdate } from "@/lib/db";
import { generateDesignSystem, describeAiError } from "@/lib/ai";
import { avoidDigest, priorDesigns } from "@/lib/design-memory";
import { LessonPack, lessonPackSchema } from "@/lib/lesson-pack-schema";
import { loadEditableMaterial } from "@/lib/api/guards";
import { serverError } from "@/lib/api/request";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Art-direct the pack: the AI authors a cohesive per-pack design system (a
 * scoped CSS block) and we save it as `designCss`/`designNote`, so every page
 * prints in this pack's own visual identity.
 */
export async function POST(
  _req: NextRequest,
  ctx: RouteContext<"/api/materials/[id]/design">
) {
  const gate = await loadEditableMaterial(ctx, {
    refusal: "Only draft packs can be designed, by builders.",
    packOnly: "Design generation",
  });
  if (!gate.ok) return gate.response;
  const { material, role, session } = gate;

  const content = material.content as LessonPack;
  try {
    // Design memory: show the model what earlier packs look like so it invents
    // something genuinely its own and raises the bar.
    const avoid = avoidDigest(await priorDesigns(session.scope, material.id));
    const design = await generateDesignSystem(material.subject, content, avoid);
    const next = lessonPackSchema.parse({
      ...content,
      designCss: design.css,
      designNote: design.note,
    });
    // snapshot the state this call is about to overwrite
    snapshotAndUpdate(material.id, "design system generated", role, material.title, next);
    await logActivity(material.id, role, "design-system", design.note);
    return NextResponse.json({ pack: next, note: design.note });
  } catch (err) {
    return serverError(describeAiError(err, "Design generation failed"));
  }
}
